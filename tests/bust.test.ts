import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bust, findSafeFindings } from "../src/bust.js";
import { defaultConfig, type GunkConfig } from "../src/config.js";
import { GunkError } from "../src/errors.js";
import { hashIndexedFile } from "../src/file-index.js";
import { persistScanResult, scan } from "../src/scan.js";
import { NINETY_DAYS_AGO } from "./helpers/findings.js";
import { createFixtureRepo, createTempDir, removeDir } from "./helpers/fixture.js";

/** A fixed clock, so batch/trap-ids in assertions are deterministic. */
const FIXED_NOW = new Date("2026-07-11T14:22:05.123Z");
const fixedClock = () => FIXED_NOW;

describe("findSafeFindings(scanResult)", () => {
  it("keeps only SAFE-verdict file findings", async () => {
    const repo = await createFixtureRepo("generated-dumps", { commitDate: NINETY_DAYS_AGO });
    try {
      const result = await scan(repo, defaultConfig());
      const safe = findSafeFindings(result);
      expect(safe.every((f) => f.verdict === "SAFE")).toBe(true);
      expect(safe.map((f) => f.path).sort()).toEqual(["coverage/lcov.info", "dist/bundle.js"]);
    } finally {
      await removeDir(repo);
    }
  });
});

describe("bust(repoRoot, opts) — engine seam", () => {
  let repo: string;
  let vaultParent: string;
  let config: GunkConfig;

  beforeEach(async () => {
    // generated-dumps, backdated: two SAFE findings (coverage/lcov.info, dist/bundle.js)
    repo = await createFixtureRepo("generated-dumps", { commitDate: NINETY_DAYS_AGO });
    vaultParent = await createTempDir();
    config = defaultConfig();
    config.trap.vaultRoot = path.join(vaultParent, "vault");
    await persistScanResult(await scan(repo, config));
  });

  afterEach(async () => {
    await removeDir(repo);
    await removeDir(vaultParent);
  });

  it("refuses without confirmation, mentioning --yes", async () => {
    await expect(bust(repo, { config })).rejects.toBeInstanceOf(GunkError);
    await expect(bust(repo, { config })).rejects.toThrow(/--yes/);
    // no mutation on refusal
    expect(existsSync(path.join(repo, "dist", "bundle.js"))).toBe(true);
  });

  it("traps every SAFE finding under one shared batchId", async () => {
    const bundleHash = await hashIndexedFile(repo, "dist/bundle.js");
    const lcovHash = await hashIndexedFile(repo, "coverage/lcov.info");

    const result = await bust(repo, { config, now: fixedClock, confirmed: true });

    expect(result.batchId).toBe("2026-07-11T14-22-05Z-bust");
    expect(result.skipped).toEqual([]);
    expect(result.trapped).toHaveLength(2);
    expect(result.trapped.every((r) => r.batchId === result.batchId)).toBe(true);
    // each file still gets its own trap-id
    expect(new Set(result.trapped.map((r) => r.trapId)).size).toBe(2);

    const byPath = new Map(result.trapped.map((r) => [r.originalPath, r]));
    expect(byPath.get("dist/bundle.js")?.contentHash).toBe(bundleHash);
    expect(byPath.get("coverage/lcov.info")?.contentHash).toBe(lcovHash);

    expect(existsSync(path.join(repo, "dist", "bundle.js"))).toBe(false);
    expect(existsSync(path.join(repo, "coverage", "lcov.info"))).toBe(false);
  });

  it("staleness guard: skips a hash-mismatched file with a warning and traps the rest", async () => {
    await writeFile(path.join(repo, "dist", "bundle.js"), "edited after the scan\n");

    const result = await bust(repo, { config, now: fixedClock, confirmed: true });

    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.path).toBe("dist/bundle.js");
    expect(result.skipped[0]?.reason).toMatch(/re-scan/i);
    // the edited file was never touched
    expect(existsSync(path.join(repo, "dist", "bundle.js"))).toBe(true);

    // the rest proceeded
    expect(result.trapped).toHaveLength(1);
    expect(result.trapped[0]?.originalPath).toBe("coverage/lcov.info");
    expect(existsSync(path.join(repo, "coverage", "lcov.info"))).toBe(false);
  });

  it("git guard: skips a dirty tracked file and traps the rest", async () => {
    await writeFile(path.join(repo, "dist", "bundle.js"), "edited but not committed\n");
    await persistScanResult(await scan(repo, config)); // re-scan so the staleness guard is satisfied

    const result = await bust(repo, { config, now: fixedClock, confirmed: true });

    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.path).toBe("dist/bundle.js");
    expect(result.skipped[0]?.reason).toMatch(/--force/);
    expect(existsSync(path.join(repo, "dist", "bundle.js"))).toBe(true);

    expect(result.trapped).toHaveLength(1);
    expect(result.trapped[0]?.originalPath).toBe("coverage/lcov.info");
  });

  it("traps an untracked SAFE file, surfacing the loud warning through onWarning", async () => {
    await writeFile(path.join(repo, "dist", "extra.js"), "console.log('generated')\n");
    await persistScanResult(await scan(repo, config));

    const warnings: string[] = [];
    const result = await bust(repo, {
      config,
      now: fixedClock,
      confirmed: true,
      onWarning: (w) => warnings.push(w),
    });

    const trappedPaths = result.trapped.map((r) => r.originalPath).sort();
    expect(trappedPaths).toEqual(["coverage/lcov.info", "dist/bundle.js", "dist/extra.js"]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/git/i);
    expect(existsSync(path.join(repo, "dist", "extra.js"))).toBe(false);
  });
});

describe("bust() with nothing SAFE on the pile", () => {
  it("returns an empty result — no findings, no batchId collision to worry about", async () => {
    const repo = await createFixtureRepo("clean-repo");
    const vaultParent = await createTempDir();
    try {
      const config = defaultConfig();
      config.trap.vaultRoot = path.join(vaultParent, "vault");
      await persistScanResult(await scan(repo, config));

      const result = await bust(repo, { config, now: fixedClock, confirmed: true });
      expect(result.trapped).toEqual([]);
      expect(result.skipped).toEqual([]);
    } finally {
      await removeDir(repo);
      await removeDir(vaultParent);
    }
  });
});
