import { readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultConfig, type GunkConfig } from "../src/config.js";
import { GunkError } from "../src/errors.js";
import { hashIndexedFile } from "../src/file-index.js";
import { writeKeep } from "../src/keeps.js";
import { persistScanResult, scan } from "../src/scan.js";
import { scanResultSchema, trapReceiptSchema } from "../src/schema.js";
import { buildTrapId, findTrappableFinding, resolveVaultRoot, trap } from "../src/trap.js";
import { NINETY_DAYS_AGO, fileFindings } from "./helpers/findings.js";
import { createFixtureRepo, createTempDir, removeDir } from "./helpers/fixture.js";

/** A fixed clock, so trap-ids in assertions are deterministic. */
const FIXED_NOW = new Date("2026-07-11T14:22:05.123Z");
const fixedClock = () => FIXED_NOW;

describe("trap(repoRoot, path, opts) — engine seam", () => {
  let repo: string;
  let vaultParent: string;
  let config: GunkConfig;

  beforeEach(async () => {
    // orphan-docs, backdated past the recency window: two GHOST/PROPOSE
    // file findings (docs/old-plan.md and assets/unused-diagram.png).
    repo = await createFixtureRepo("orphan-docs", { commitDate: NINETY_DAYS_AGO });
    vaultParent = await createTempDir();
    config = defaultConfig();
    config.trap.vaultRoot = path.join(vaultParent, "vault");
    await persistScanResult(await scan(repo, config));
  });

  afterEach(async () => {
    await removeDir(repo);
    await removeDir(vaultParent);
  });

  it("moves the file to the vault at its preserved relative path and returns the receipt", async () => {
    const originalHash = await hashIndexedFile(repo, "docs/old-plan.md");

    const receipt = await trap(repo, "docs/old-plan.md", { config, now: fixedClock });

    // trap identity: `<UTC timestamp>-<slug of relative path>` (spec)
    expect(receipt.trapId).toBe("2026-07-11T14-22-05Z-docs-old-plan-md");
    // a standalone trap is its own batch of one
    expect(receipt.batchId).toBe(receipt.trapId);
    expect(receipt.status).toBe("trapped");
    expect(receipt.originalPath).toBe("docs/old-plan.md");
    expect(receipt.label).toBe("GHOST");
    expect(receipt.verdict).toBe("PROPOSE");
    expect(receipt.contentHash).toBe(originalHash);
    expect(receipt.trappedAt).toBe(FIXED_NOW.toISOString());
    expect(receipt.restoreCommand).toBe(`gunk restore ${receipt.trapId}`);

    // the file is gone from the repo…
    expect(existsSync(path.join(repo, "docs", "old-plan.md"))).toBe(false);

    // …and present in the vault, byte-identical, structure preserved:
    // <vaultRoot>/traps/<repo-dir-name>/<trap-id>/<original-relative-path>
    const trapDir = path.join(
      config.trap.vaultRoot,
      "traps",
      path.basename(repo),
      receipt.trapId,
    );
    expect(await hashIndexedFile(trapDir, "docs/old-plan.md")).toBe(originalHash);
  });

  it("writes the authoritative in-repo receipt and a byte-identical vault copy", async () => {
    const receipt = await trap(repo, "docs/old-plan.md", { config, now: fixedClock });

    const inRepoRaw = await readFile(
      path.join(repo, ".gunk-buster", "receipts", `${receipt.trapId}.json`),
      "utf8",
    );
    const vaultRaw = await readFile(
      path.join(
        config.trap.vaultRoot,
        "traps",
        path.basename(repo),
        receipt.trapId,
        "receipt.json",
      ),
      "utf8",
    );

    expect(vaultRaw).toBe(inRepoRaw);
    // the persisted receipt round-trips through the schema and matches the returned one
    expect(trapReceiptSchema.parse(JSON.parse(inRepoRaw))).toEqual(receipt);
  });

  it("keeps receipts git-tracked: the internal .gitignore never covers receipts/", async () => {
    await trap(repo, "docs/old-plan.md", { config, now: fixedClock });

    const gitignore = await readFile(path.join(repo, ".gunk-buster", ".gitignore"), "utf8");
    expect(gitignore).not.toMatch(/receipts/);
    // scan.json / radar.json stay ignored
    expect(gitignore).toMatch(/scan\.json/);
    expect(gitignore).toMatch(/radar\.json/);
  });

  it("shares a caller-supplied batchId across receipts from one run", async () => {
    const receipt = await trap(repo, "docs/old-plan.md", {
      config,
      now: fixedClock,
      batchId: "2026-07-11T14-22-05Z-bust",
    });
    expect(receipt.batchId).toBe("2026-07-11T14-22-05Z-bust");
  });

  it("refuses a path that is not a file finding in the scan index", async () => {
    await expect(trap(repo, "README.md", { config })).rejects.toBeInstanceOf(GunkError);
    await expect(trap(repo, "README.md", { config })).rejects.toThrow(/gunk scan/);
  });

  it("refuses when no scan index has been persisted yet", async () => {
    await rm(path.join(repo, ".gunk-buster"), { recursive: true, force: true });
    await expect(trap(repo, "docs/old-plan.md", { config })).rejects.toThrow(/gunk scan/);
  });

  it("staleness guard: refuses when the file changed since the scan", async () => {
    await writeFile(path.join(repo, "docs", "old-plan.md"), "edited after the scan\n");

    await expect(trap(repo, "docs/old-plan.md", { config })).rejects.toBeInstanceOf(GunkError);
    await expect(trap(repo, "docs/old-plan.md", { config })).rejects.toThrow(/re-scan/i);
    // a refusal never mutates: the edited file is still where it was
    expect(existsSync(path.join(repo, "docs", "old-plan.md"))).toBe(true);
  });

  it("refuses when the file is already gone from disk", async () => {
    await rm(path.join(repo, "docs", "old-plan.md"));
    await expect(trap(repo, "docs/old-plan.md", { config })).rejects.toThrow(/already trapped/i);
  });

  it("refuses a vaultRoot that resolves inside the repo", async () => {
    config.trap.vaultRoot = "./vault";
    await expect(trap(repo, "docs/old-plan.md", { config })).rejects.toBeInstanceOf(GunkError);
    await expect(trap(repo, "docs/old-plan.md", { config })).rejects.toThrow(/inside the repo/i);
    // decoy vault refused before any mutation
    expect(existsSync(path.join(repo, "docs", "old-plan.md"))).toBe(true);
  });
});

describe("trap() verdict ladder — ASK_CHIEF's mandatory confirmation", () => {
  let repo: string;
  let vaultParent: string;
  let config: GunkConfig;

  beforeEach(async () => {
    // NOT backdated: the recently-modified soft protection caps these
    // findings at ASK_CHIEF.
    repo = await createFixtureRepo("orphan-docs");
    vaultParent = await createTempDir();
    config = defaultConfig();
    config.trap.vaultRoot = path.join(vaultParent, "vault");
    await persistScanResult(await scan(repo, config));
  });

  afterEach(async () => {
    await removeDir(repo);
    await removeDir(vaultParent);
  });

  it("refuses ASK_CHIEF without the interactive confirmation, naming the protection that fired", async () => {
    await expect(trap(repo, "docs/old-plan.md", { config })).rejects.toBeInstanceOf(GunkError);
    await expect(trap(repo, "docs/old-plan.md", { config })).rejects.toThrow(/recently-modified/);
    // a refusal never mutates
    expect(existsSync(path.join(repo, "docs", "old-plan.md"))).toBe(true);
  });

  it("still refuses ASK_CHIEF when force is set — force is a git knob, not a moat bypass", async () => {
    await expect(
      trap(repo, "docs/old-plan.md", { config, force: true }),
    ).rejects.toThrow(/recently-modified/);
  });

  it("traps ASK_CHIEF once the Chief's interactive confirmation is carried in", async () => {
    const receipt = await trap(repo, "docs/old-plan.md", {
      config,
      now: fixedClock,
      askChiefConfirmed: true,
    });

    expect(receipt.verdict).toBe("ASK_CHIEF");
    expect(receipt.status).toBe("trapped");
    expect(existsSync(path.join(repo, "docs", "old-plan.md"))).toBe(false);
  });
});

describe("trap() git guards — dirty refusal and untracked warning", () => {
  let repo: string;
  let vaultParent: string;
  let config: GunkConfig;

  beforeEach(async () => {
    repo = await createFixtureRepo("orphan-docs", { commitDate: NINETY_DAYS_AGO });
    vaultParent = await createTempDir();
    config = defaultConfig();
    config.trap.vaultRoot = path.join(vaultParent, "vault");
    await persistScanResult(await scan(repo, config));
  });

  afterEach(async () => {
    await removeDir(repo);
    await removeDir(vaultParent);
  });

  it("refuses a tracked file with uncommitted changes without force", async () => {
    await writeFile(path.join(repo, "docs", "old-plan.md"), "edited but not committed\n");
    await persistScanResult(await scan(repo, config)); // re-scan so the staleness guard is satisfied

    await expect(trap(repo, "docs/old-plan.md", { config })).rejects.toBeInstanceOf(GunkError);
    await expect(trap(repo, "docs/old-plan.md", { config })).rejects.toThrow(/--force/);
    expect(existsSync(path.join(repo, "docs", "old-plan.md"))).toBe(true);
  });

  it("traps a dirty tracked file when force is set", async () => {
    await writeFile(path.join(repo, "docs", "old-plan.md"), "edited but not committed\n");
    await persistScanResult(await scan(repo, config));

    const receipt = await trap(repo, "docs/old-plan.md", { config, now: fixedClock, force: true });

    expect(receipt.status).toBe("trapped");
    expect(existsSync(path.join(repo, "docs", "old-plan.md"))).toBe(false);
  });

  it("traps an untracked file with a loud warning that git holds no copy", async () => {
    // untracked: written after the fixture commit, never git-added; no git
    // date means no recency protection, so the orphan doc lands PROPOSE
    await writeFile(path.join(repo, "docs", "scratch-notes.md"), "# Scratch\n\nuntracked orphan\n");
    await persistScanResult(await scan(repo, config));

    const warnings: string[] = [];
    const receipt = await trap(repo, "docs/scratch-notes.md", {
      config,
      now: fixedClock,
      onWarning: (w) => warnings.push(w),
    });

    expect(receipt.status).toBe("trapped");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/git/i);
    expect(warnings[0]).toMatch(/only/i);
  });

  it("emits no warning for a tracked, clean file", async () => {
    const warnings: string[] = [];
    await trap(repo, "docs/old-plan.md", {
      config,
      now: fixedClock,
      onWarning: (w) => warnings.push(w),
    });
    expect(warnings).toEqual([]);
  });
});

describe("trap() refuses a Chief-kept file — end to end through scan + keeps", () => {
  let repo: string;
  let vaultParent: string;
  let config: GunkConfig;

  beforeEach(async () => {
    repo = await createFixtureRepo("orphan-docs", { commitDate: NINETY_DAYS_AGO });
    vaultParent = await createTempDir();
    config = defaultConfig();
    config.trap.vaultRoot = path.join(vaultParent, "vault");
  });

  afterEach(async () => {
    await removeDir(repo);
    await removeDir(vaultParent);
  });

  it('refuses ("you told me to keep this, Chief") once a matching keep decision exists', async () => {
    const scanResult = await scan(repo, config);
    const original = fileFindings(scanResult).find((f) => f.path === "docs/old-plan.md")!;

    await writeKeep(repo, {
      path: "docs/old-plan.md",
      contentHash: original.contentHash,
      decidedAt: "2026-07-11T14:22:05.123Z",
    });
    await persistScanResult(await scan(repo, config)); // re-scan: keeps.json now applies

    await expect(trap(repo, "docs/old-plan.md", { config })).rejects.toBeInstanceOf(GunkError);
    await expect(trap(repo, "docs/old-plan.md", { config })).rejects.toThrow(/keep/i);
    expect(existsSync(path.join(repo, "docs", "old-plan.md"))).toBe(true);
  });
});

describe("findTrappableFinding(scanResult, relPath, voice)", () => {
  const evidence = [{ rule: "unreferenced", confidence: "STRONG" as const, rationale: "no inbound links" }];
  const hash = `sha256:${"a".repeat(64)}`;
  const scanResult = scanResultSchema.parse({
    schemaVersion: 2,
    scannedAt: FIXED_NOW.toISOString(),
    repoRoot: "/repo",
    counts: { byVerdict: {}, byLabel: {} },
    findings: [
      {
        type: "file",
        path: "docs/kept.md",
        kind: "doc",
        label: "GHOST",
        verdict: "KEEP",
        evidence,
        protections: [],
        contentHash: hash,
      },
      // a link finding at a path with no file finding — never trappable
      { type: "link", path: "docs/index.md", target: "docs/missing.md", evidence },
    ],
  });

  it("refuses a KEEP-verdict finding (the Chief's ruling stands)", () => {
    expect(() => findTrappableFinding(scanResult, "docs/kept.md", "chief")).toThrow(GunkError);
    expect(() => findTrappableFinding(scanResult, "docs/kept.md", "chief")).toThrow(/keep/i);
  });

  it("never treats a link finding as trappable — its remedy is an edit", () => {
    expect(() => findTrappableFinding(scanResult, "docs/index.md", "chief")).toThrow(/gunk scan/);
  });
});

describe("buildTrapId(relPath, now)", () => {
  it("is `<UTC timestamp>-<slug of relative path>` — sortable, filesystem-safe", () => {
    expect(buildTrapId("docs/old-plan.md", FIXED_NOW)).toBe(
      "2026-07-11T14-22-05Z-docs-old-plan-md",
    );
  });

  it("slugs collide only for the same path at the same second", () => {
    const a = buildTrapId("docs/old-plan.md", FIXED_NOW);
    const b = buildTrapId("assets/unused-diagram.png", FIXED_NOW);
    expect(a).not.toBe(b);
  });
});

describe("resolveVaultRoot(repoRoot, config)", () => {
  let repo: string;

  beforeEach(async () => {
    repo = await createTempDir();
  });

  afterEach(async () => {
    await removeDir(repo);
  });

  it("defaults to ../.gunk-buster resolved from the repo root", () => {
    const resolved = resolveVaultRoot(repo, defaultConfig());
    expect(resolved).toBe(path.resolve(repo, "..", ".gunk-buster"));
  });

  it("refuses a vaultRoot resolving inside the repo (including the repo root itself)", () => {
    const inside = defaultConfig();
    inside.trap.vaultRoot = "./nested/vault";
    expect(() => resolveVaultRoot(repo, inside)).toThrow(GunkError);

    const self = defaultConfig();
    self.trap.vaultRoot = ".";
    expect(() => resolveVaultRoot(repo, self)).toThrow(GunkError);
  });
});
