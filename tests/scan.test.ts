import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { GunkError } from "../src/errors.js";
import { loadScanResult, persistScanResult, scan } from "../src/scan.js";
import { scanResultSchema } from "../src/schema.js";
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
    expect(parsed.schemaVersion).toBe(1);
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
        "schemaVersion": 1,
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
