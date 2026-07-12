import { readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { GunkError } from "../src/errors.js";
import { writeKeep } from "../src/keeps.js";
import { loadScanResult, persistScanResult, scan } from "../src/scan.js";
import { scanResultSchema, type ScanResult } from "../src/schema.js";
import { NINETY_DAYS_AGO, fileFindings } from "./helpers/findings.js";
import { createFixtureRepo, createTempDir, removeDir } from "./helpers/fixture.js";

describe("scan(repoRoot, config) — engine seam", () => {
  let repo: string;

  beforeAll(async () => {
    repo = await createFixtureRepo("clean-repo");
  });

  afterAll(async () => {
    await removeDir(repo);
  });

  it("produces a schema-valid, empty-findings ScanResult on a clean repo", async () => {
    const result = await scan(repo);

    // the zod schema is the single source of truth for the contract
    const parsed = scanResultSchema.parse(result);
    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.findings).toEqual([]);
    expect(parsed.counts).toEqual({ byVerdict: {}, byLabel: {} });
    expect(Number.isNaN(Date.parse(parsed.scannedAt))).toBe(false);
  });

  it("resolves repoRoot to the repo's top level, even from a subdirectory", async () => {
    const result = await scan(path.join(repo, "docs"));
    // realpath both sides: mkdtemp can hand out an 8.3 short path on Windows
    expect(await realpath(result.repoRoot)).toBe(await realpath(repo));
  });

  it("matches the clean-repo snapshot through the engine seam (volatile fields normalized)", async () => {
    const result = await scan(repo, defaultConfig());
    expect({
      ...result,
      scannedAt: "<scannedAt>",
      repoRoot: "<repoRoot>",
    }).toMatchInlineSnapshot(`
      {
        "counts": {
          "byLabel": {},
          "byVerdict": {},
        },
        "findings": [],
        "repoRoot": "<repoRoot>",
        "scannedAt": "<scannedAt>",
        "schemaVersion": 2,
      }
    `);
  });

  it("persists scan.json under .gunk-buster/ with an internal .gitignore covering it", async () => {
    const result = await scan(repo);
    await persistScanResult(result);

    const written = JSON.parse(
      await readFile(path.join(repo, ".gunk-buster", "scan.json"), "utf8"),
    );
    expect(scanResultSchema.parse(written)).toEqual(result);

    const internalIgnore = await readFile(
      path.join(repo, ".gunk-buster", ".gitignore"),
      "utf8",
    );
    expect(internalIgnore).toContain("scan.json");
    // reports/ must not become context gunk either (#7) — same ephemeral
    // treatment as scan.json until a later milestone tracks it.
    expect(internalIgnore).toContain("reports/");
  });

  it("throws a GunkError tool error when the directory is not a git repo", async () => {
    const dir = await createTempDir();
    try {
      await expect(scan(dir)).rejects.toBeInstanceOf(GunkError);
    } finally {
      await removeDir(dir);
    }
  });
});

describe("scan(repoRoot, config) — contentHash, the MVP 3 staleness anchor (#15)", () => {
  let repo: string;
  let result: ScanResult;

  beforeAll(async () => {
    repo = await createFixtureRepo("orphan-docs");
    result = await scan(repo, defaultConfig());
  });

  afterAll(async () => {
    await removeDir(repo);
  });

  it("stamps every file finding with a sha256 contentHash", () => {
    const findings = fileFindings(result);
    expect(findings.length).toBeGreaterThan(0);
    for (const finding of findings) {
      expect(finding.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    }
  });

  it("never stamps a link finding with contentHash — file bytes only", () => {
    const linkFindingsOnly = result.findings.filter((f) => f.type === "link");
    for (const finding of linkFindingsOnly) {
      expect(finding).not.toHaveProperty("contentHash");
    }
  });

  it("hash stability: re-scanning unchanged bytes produces the identical hash", async () => {
    const again = await scan(repo, defaultConfig());
    const before = fileFindings(result)[0]!;
    const after = fileFindings(again).find((f) => f.path === before.path)!;
    expect(after.contentHash).toBe(before.contentHash);
  });
});

describe("scan(repoRoot, config) — keep decisions (docs/specs/mvp-3-trap.md)", () => {
  let repo: string;

  beforeEach(async () => {
    // Backdated past the recency window so docs/old-plan.md lands PROPOSE
    // (not capped at ASK_CHIEF) — a stable baseline verdict to override.
    repo = await createFixtureRepo("orphan-docs", { commitDate: NINETY_DAYS_AGO });
  });

  afterEach(async () => {
    await removeDir(repo);
  });

  it("a finding with no matching keep entry keeps its normal verdict and no keptBy", async () => {
    const result = await scan(repo, defaultConfig());
    const finding = fileFindings(result).find((f) => f.path === "docs/old-plan.md")!;
    expect(finding.verdict).toBe("PROPOSE");
    expect(finding).not.toHaveProperty("keptBy");
  });

  it("a matching keep entry overrides the verdict to KEEP with keptBy chief — never silently hidden", async () => {
    const before = await scan(repo, defaultConfig());
    const original = fileFindings(before).find((f) => f.path === "docs/old-plan.md")!;

    await writeKeep(repo, {
      path: "docs/old-plan.md",
      contentHash: original.contentHash,
      decidedAt: "2026-07-11T14:22:05.123Z",
    });

    const after = await scan(repo, defaultConfig());
    const kept = fileFindings(after).find((f) => f.path === "docs/old-plan.md")!;
    expect(kept.verdict).toBe("KEEP");
    expect(kept.keptBy).toBe("chief");
    // evidence and label are preserved — a KEEP row in the pile tells the truth
    expect(kept.label).toBe(original.label);
    expect(kept.evidence).toEqual(original.evidence);
    expect(after.counts.byVerdict.KEEP).toBe(1);
  });

  it("a keep entry pinned to a stale hash never fires — the finding resurfaces under its normal verdict", async () => {
    const before = await scan(repo, defaultConfig());
    const original = fileFindings(before).find((f) => f.path === "docs/old-plan.md")!;

    await writeKeep(repo, {
      path: "docs/old-plan.md",
      contentHash: `sha256:${"f".repeat(64)}`, // deliberately not original's hash
      decidedAt: "2026-07-11T14:22:05.123Z",
    });

    const after = await scan(repo, defaultConfig());
    const finding = fileFindings(after).find((f) => f.path === "docs/old-plan.md")!;
    expect(finding.verdict).toBe("PROPOSE");
    expect(finding).not.toHaveProperty("keptBy");
  });

  it("editing the file after a keep decision expires it — content changed, decision no longer applies", async () => {
    const before = await scan(repo, defaultConfig());
    const original = fileFindings(before).find((f) => f.path === "docs/old-plan.md")!;

    await writeKeep(repo, {
      path: "docs/old-plan.md",
      contentHash: original.contentHash,
      decidedAt: "2026-07-11T14:22:05.123Z",
    });
    // proves the override fires first
    const kept = fileFindings(await scan(repo, defaultConfig())).find((f) => f.path === "docs/old-plan.md")!;
    expect(kept.verdict).toBe("KEEP");

    await writeFile(path.join(repo, "docs", "old-plan.md"), "edited after the keep decision\n");

    const resurfaced = fileFindings(await scan(repo, defaultConfig())).find(
      (f) => f.path === "docs/old-plan.md",
    )!;
    expect(resurfaced.verdict).not.toBe("KEEP");
    expect(resurfaced).not.toHaveProperty("keptBy");
  });
});

describe("loadScanResult(repoRoot) — reading the persisted scan index back (#7)", () => {
  let repo: string;

  beforeAll(async () => {
    repo = await createFixtureRepo("clean-repo");
  });

  afterAll(async () => {
    await removeDir(repo);
  });

  it("round-trips exactly what persistScanResult wrote", async () => {
    const result = await scan(repo);
    await persistScanResult(result);

    const loaded = await loadScanResult(repo);
    expect(loaded).toEqual(result);
  });

  it("throws a helpful GunkError when no scan index exists yet", async () => {
    const dir = await createTempDir();
    try {
      await expect(loadScanResult(dir)).rejects.toBeInstanceOf(GunkError);
      await expect(loadScanResult(dir)).rejects.toThrow(/gunk scan/);
    } finally {
      await removeDir(dir);
    }
  });
});
