import { describe, expect, it } from "vitest";
import { buildPileResult } from "../src/pile.js";
import type {
  ClaimFinding,
  FileFinding,
  Finding,
  LinkFinding,
  RadarResult,
} from "../src/schema.js";

function fileFinding(overrides: Partial<FileFinding> = {}): FileFinding {
  return {
    type: "file",
    path: "dist/bundle.js",
    kind: "generated",
    label: "DUMP",
    verdict: "SAFE",
    evidence: [{ rule: "generated-build-dir", confidence: "CERTAIN", rationale: "..." }],
    protections: [],
    contentHash: "sha256:" + "a".repeat(64),
    ...overrides,
  };
}

function linkFinding(overrides: Partial<LinkFinding> = {}): LinkFinding {
  return {
    type: "link",
    path: "README.md",
    target: "docs/missing.md",
    evidence: [{ rule: "broken-link", confidence: "CERTAIN", rationale: "target does not exist" }],
    ...overrides,
  };
}

function claimFinding(overrides: Partial<ClaimFinding> = {}): ClaimFinding {
  return {
    type: "claim",
    path: "CLAUDE.md",
    line: 3,
    label: "BAIT",
    check: "package-manager-drift",
    evidence: [
      { rule: "pm-mismatch", confidence: "CERTAIN", rationale: "package.json says pnpm" },
    ],
    expected: "pnpm install",
    actual: "npm install",
    ...overrides,
  };
}

function radarResult(findings: RadarResult["findings"]): RadarResult {
  return {
    schemaVersion: 1,
    scannedAt: "2026-07-10T01:00:00.000Z",
    repoRoot: "/repo",
    counts: { byLabel: {}, byCheck: {} },
    findings,
  };
}

describe("buildPileResult(scan) — grouping findings by label for `gunk pile`", () => {
  it("groups file findings by label with per-group count and verdict tally", () => {
    const findings: Finding[] = [
      fileFinding({ path: "dist/bundle.js", label: "DUMP", verdict: "SAFE" }),
      fileFinding({ path: "build.log", label: "DUMP", verdict: "PROPOSE" }),
    ];

    const result = buildPileResult({
      schemaVersion: 2,
      scannedAt: "2026-07-10T00:00:00.000Z",
      repoRoot: "/repo",
      counts: { byVerdict: { SAFE: 1, PROPOSE: 1 }, byLabel: { DUMP: 2 } },
      findings,
    });

    expect(result.schemaVersion).toBe(1);
    expect(result.groups).toEqual([
      {
        label: "DUMP",
        count: 2,
        verdictCounts: { SAFE: 1, PROPOSE: 1 },
        findings: findings,
      },
    ]);
  });

  it("is generic over labels: any label present in findings gets its own group, sorted alphabetically", () => {
    const findings: Finding[] = [
      fileFinding({ path: "old-notes.md", kind: "doc", label: "GHOST", verdict: "PROPOSE" }),
      fileFinding({ path: "dist/bundle.js", label: "DUMP", verdict: "SAFE" }),
    ];

    const result = buildPileResult({
      schemaVersion: 2,
      scannedAt: "2026-07-10T00:00:00.000Z",
      repoRoot: "/repo",
      counts: { byVerdict: {}, byLabel: {} },
      findings,
    });

    expect(result.groups.map((g) => g.label)).toEqual(["DUMP", "GHOST"]);
  });

  it("is generic over finding type: link findings get their own group with no verdict tally", () => {
    const findings: Finding[] = [linkFinding()];

    const result = buildPileResult({
      schemaVersion: 2,
      scannedAt: "2026-07-10T00:00:00.000Z",
      repoRoot: "/repo",
      counts: { byVerdict: {}, byLabel: {} },
      findings,
    });

    expect(result.groups).toEqual([
      { label: "LINK", count: 1, verdictCounts: {}, findings },
    ]);
  });

  it("produces no groups for an empty findings list", () => {
    const result = buildPileResult({
      schemaVersion: 2,
      scannedAt: "2026-07-10T00:00:00.000Z",
      repoRoot: "/repo",
      counts: { byVerdict: {}, byLabel: {} },
      findings: [],
    });

    expect(result.groups).toEqual([]);
  });

  it("carries scannedAt and repoRoot through from the scan result", () => {
    const result = buildPileResult({
      schemaVersion: 2,
      scannedAt: "2026-07-10T00:00:00.000Z",
      repoRoot: "/repo",
      counts: { byVerdict: {}, byLabel: {} },
      findings: [],
    });

    expect(result.scannedAt).toBe("2026-07-10T00:00:00.000Z");
    expect(result.repoRoot).toBe("/repo");
  });
});

describe("buildPileResult(scan, radar) — merging the radar index in (#13)", () => {
  const scan = {
    schemaVersion: 2 as const,
    scannedAt: "2026-07-10T00:00:00.000Z",
    repoRoot: "/repo",
    counts: { byVerdict: { SAFE: 1 }, byLabel: { DUMP: 1 } },
    findings: [fileFinding()] as Finding[],
  };

  it("is byte-identical to the no-radar call when radar is omitted", () => {
    const withoutArg = buildPileResult(scan);
    const withUndefined = buildPileResult(scan, undefined);
    expect(withUndefined).toEqual(withoutArg);
    expect(withoutArg).not.toHaveProperty("radarScannedAt");
  });

  it("adds BAIT/MOLD groups alongside the scan groups when a radar result is passed", () => {
    const radar = radarResult([
      claimFinding({ label: "BAIT", path: "CLAUDE.md" }),
      claimFinding({ label: "MOLD", path: "README.md", check: "dead-path" }),
    ]);

    const result = buildPileResult(scan, radar);

    expect(result.groups.map((g) => g.label)).toEqual(["BAIT", "DUMP", "MOLD"]);
  });

  it("claim findings carry no verdict — the claim group's verdictCounts stays empty", () => {
    const radar = radarResult([claimFinding()]);
    const result = buildPileResult(scan, radar);
    const baitGroup = result.groups.find((g) => g.label === "BAIT");
    expect(baitGroup?.verdictCounts).toEqual({});
    expect(baitGroup?.findings[0]).not.toHaveProperty("verdict");
  });

  it("surfaces the radar index's own scannedAt separately from the scan's", () => {
    const radar = radarResult([claimFinding()]);
    const result = buildPileResult(scan, radar);
    expect(result.scannedAt).toBe(scan.scannedAt);
    expect(result.radarScannedAt).toBe(radar.scannedAt);
  });

  it("merges in even when the radar index has no findings, with no BAIT/MOLD groups appearing", () => {
    const radar = radarResult([]);
    const result = buildPileResult(scan, radar);
    expect(result.groups.map((g) => g.label)).toEqual(["DUMP"]);
    expect(result.radarScannedAt).toBe(radar.scannedAt);
  });
});
