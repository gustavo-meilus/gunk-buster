import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { GunkError } from "../src/errors.js";
import {
  buildFixPlan,
  loadRadarResult,
  persistRadarResult,
  radar,
  tryLoadRadarResult,
} from "../src/radar.js";
import { persistScanResult, scan } from "../src/scan.js";
import { claimFindingSchema, radarResultSchema, type RadarResult } from "../src/schema.js";
import { createFixtureRepo, createTempDir, removeDir } from "./helpers/fixture.js";

describe("claim-finding schema", () => {
  const validClaim = {
    type: "claim" as const,
    path: "CLAUDE.md",
    line: 12,
    label: "BAIT" as const,
    check: "package-manager-drift",
    evidence: [
      {
        rule: "pm-mismatch",
        confidence: "CERTAIN" as const,
        rationale: "CLAUDE.md says `npm install`; package.json packageManager is pnpm@9",
      },
    ],
    expected: "pnpm install",
    actual: "npm install",
  };

  it("parses a claim finding without a verdict field and without a suggestion", () => {
    const parsed = claimFindingSchema.parse(validClaim);
    expect(parsed).not.toHaveProperty("verdict");
    expect(parsed.suggestion).toBeUndefined();
  });

  it("parses a claim finding with an optional suggestion", () => {
    const parsed = claimFindingSchema.parse({
      ...validClaim,
      suggestion: { replace: "npm install", with: "pnpm install" },
    });
    expect(parsed.suggestion).toEqual({ replace: "npm install", with: "pnpm install" });
  });

  it("accepts the MOLD label for ordinary docs", () => {
    expect(() => claimFindingSchema.parse({ ...validClaim, label: "MOLD" })).not.toThrow();
  });

  it("rejects a label outside BAIT/MOLD", () => {
    expect(() => claimFindingSchema.parse({ ...validClaim, label: "GHOST" })).toThrow();
  });
});

describe("radar(repoRoot, config) — engine seam", () => {
  let repo: string;

  beforeAll(async () => {
    repo = await createFixtureRepo("clean-repo");
  });

  afterAll(async () => {
    await removeDir(repo);
  });

  it("produces a schema-valid, empty-findings RadarResult with an empty check registry", async () => {
    const result = await radar(repo);

    // the zod schema is the single source of truth for the contract
    const parsed = radarResultSchema.parse(result);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.findings).toEqual([]);
    expect(parsed.counts).toEqual({ byLabel: {}, byCheck: {} });
    expect(Number.isNaN(Date.parse(parsed.scannedAt))).toBe(false);
  });

  it("resolves repoRoot to the repo's top level, even from a subdirectory", async () => {
    const result = await radar(path.join(repo, "docs"));
    // realpath both sides: mkdtemp can hand out an 8.3 short path on Windows
    expect(await realpath(result.repoRoot)).toBe(await realpath(repo));
  });

  it("matches the clean-repo snapshot through the engine seam (volatile fields normalized)", async () => {
    const result = await radar(repo, defaultConfig());
    expect({
      ...result,
      scannedAt: "<scannedAt>",
      repoRoot: "<repoRoot>",
    }).toMatchInlineSnapshot(`
      {
        "counts": {
          "byCheck": {},
          "byLabel": {},
        },
        "findings": [],
        "repoRoot": "<repoRoot>",
        "scannedAt": "<scannedAt>",
        "schemaVersion": 1,
      }
    `);
  });

  it("persists radar.json under .gunk-buster/ with an internal .gitignore covering it", async () => {
    const result = await radar(repo);
    await persistRadarResult(result);

    const written = JSON.parse(
      await readFile(path.join(repo, ".gunk-buster", "radar.json"), "utf8"),
    );
    expect(radarResultSchema.parse(written)).toEqual(result);

    const internalIgnore = await readFile(
      path.join(repo, ".gunk-buster", ".gitignore"),
      "utf8",
    );
    expect(internalIgnore).toContain("radar.json");
    // scan and radar share the .gunk-buster/.gitignore mechanism but never
    // write each other's files (spec) — running radar alone still covers
    // scan.json so a later `gunk scan` never needs to touch the ignore file.
    expect(internalIgnore).toContain("scan.json");
  });

  it("throws a GunkError tool error when the directory is not a git repo", async () => {
    const dir = await createTempDir();
    try {
      await expect(radar(dir)).rejects.toBeInstanceOf(GunkError);
    } finally {
      await removeDir(dir);
    }
  });

  it("running scan after radar keeps both scan.json and radar.json gitignored (persist order independence)", async () => {
    await persistRadarResult(await radar(repo));
    await persistScanResult(await scan(repo)); // scan persists second — must not drop radar's coverage

    const internalIgnore = await readFile(
      path.join(repo, ".gunk-buster", ".gitignore"),
      "utf8",
    );
    expect(internalIgnore).toContain("scan.json");
    expect(internalIgnore).toContain("radar.json");
  });
});

describe("loadRadarResult(repoRoot) — reading the persisted radar index back", () => {
  let repo: string;

  beforeAll(async () => {
    repo = await createFixtureRepo("clean-repo");
  });

  afterAll(async () => {
    await removeDir(repo);
  });

  it("round-trips exactly what persistRadarResult wrote", async () => {
    const result = await radar(repo);
    await persistRadarResult(result);

    const loaded = await loadRadarResult(repo);
    expect(loaded).toEqual(result);
  });

  it("throws a helpful GunkError when no radar index exists yet", async () => {
    const dir = await createTempDir();
    try {
      await expect(loadRadarResult(dir)).rejects.toBeInstanceOf(GunkError);
      await expect(loadRadarResult(dir)).rejects.toThrow(/gunk radar/);
    } finally {
      await removeDir(dir);
    }
  });
});

describe("tryLoadRadarResult(repoRoot) — the optional read pile/report use (#13)", () => {
  it("returns undefined when no radar index exists yet, without throwing", async () => {
    const dir = await createTempDir();
    try {
      await expect(tryLoadRadarResult(dir)).resolves.toBeUndefined();
    } finally {
      await removeDir(dir);
    }
  });

  it("returns the persisted radar result when one exists", async () => {
    const repo = await createFixtureRepo("clean-repo");
    try {
      const result = await radar(repo);
      await persistRadarResult(result);
      await expect(tryLoadRadarResult(repo)).resolves.toEqual(result);
    } finally {
      await removeDir(repo);
    }
  });
});

describe("buildFixPlan(radar) — the `gunk radar --fix-plan` checklist (#13)", () => {
  function radarWithFindings(findings: RadarResult["findings"]): RadarResult {
    return {
      schemaVersion: 1,
      scannedAt: "2026-07-10T00:00:00.000Z",
      repoRoot: "/repo",
      counts: { byLabel: {}, byCheck: {} },
      findings,
    };
  }

  it("includes only findings that carry a suggestion", () => {
    const result = radarWithFindings([
      {
        type: "claim",
        path: "CLAUDE.md",
        line: 3,
        label: "BAIT",
        check: "package-manager-drift",
        evidence: [{ rule: "pm-mismatch", confidence: "CERTAIN", rationale: "..." }],
        expected: "pnpm install",
        actual: "npm install",
        suggestion: { replace: "npm install", with: "pnpm install" },
      },
      {
        type: "claim",
        path: "CLAUDE.md",
        line: 8,
        label: "BAIT",
        check: "dead-command",
        evidence: [{ rule: "unknown-script", confidence: "CERTAIN", rationale: "..." }],
        expected: "an existing script",
        actual: "npm run typo",
        // no suggestion
      },
    ]);

    const fixPlan = buildFixPlan(result);
    expect(fixPlan.items).toHaveLength(1);
    expect(fixPlan.items[0]).toMatchObject({
      path: "CLAUDE.md",
      line: 3,
      suggestion: { replace: "npm install", with: "pnpm install" },
    });
  });

  it("carries the radar result's own scannedAt and repoRoot through", () => {
    const result = radarWithFindings([]);
    const fixPlan = buildFixPlan(result);
    expect(fixPlan.scannedAt).toBe(result.scannedAt);
    expect(fixPlan.repoRoot).toBe(result.repoRoot);
    expect(fixPlan.items).toEqual([]);
  });

  it("produces the fix plan for a real fixture through the engine seam", async () => {
    const repo = await createFixtureRepo("pm-drift-field");
    try {
      const result = await radar(repo, defaultConfig());
      const fixPlan = buildFixPlan(result);
      expect(fixPlan.items.length).toBeGreaterThan(0);
      expect(fixPlan.items.every((item) => item.suggestion !== undefined)).toBe(true);
    } finally {
      await removeDir(repo);
    }
  });
});
