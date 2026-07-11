import { describe, expect, it } from "vitest";
import { buildPileResult } from "../src/pile.js";
import type { FileFinding, Finding, LinkFinding } from "../src/schema.js";

function fileFinding(overrides: Partial<FileFinding> = {}): FileFinding {
  return {
    type: "file",
    path: "dist/bundle.js",
    kind: "generated",
    label: "DUMP",
    verdict: "SAFE",
    evidence: [{ rule: "generated-build-dir", confidence: "CERTAIN", rationale: "..." }],
    protections: [],
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

describe("buildPileResult(scan) — grouping findings by label for `gunk pile`", () => {
  it("groups file findings by label with per-group count and verdict tally", () => {
    const findings: Finding[] = [
      fileFinding({ path: "dist/bundle.js", label: "DUMP", verdict: "SAFE" }),
      fileFinding({ path: "build.log", label: "DUMP", verdict: "PROPOSE" }),
    ];

    const result = buildPileResult({
      schemaVersion: 1,
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
      schemaVersion: 1,
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
      schemaVersion: 1,
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
      schemaVersion: 1,
      scannedAt: "2026-07-10T00:00:00.000Z",
      repoRoot: "/repo",
      counts: { byVerdict: {}, byLabel: {} },
      findings: [],
    });

    expect(result.groups).toEqual([]);
  });

  it("carries scannedAt and repoRoot through from the scan result", () => {
    const result = buildPileResult({
      schemaVersion: 1,
      scannedAt: "2026-07-10T00:00:00.000Z",
      repoRoot: "/repo",
      counts: { byVerdict: {}, byLabel: {} },
      findings: [],
    });

    expect(result.scannedAt).toBe("2026-07-10T00:00:00.000Z");
    expect(result.repoRoot).toBe("/repo");
  });
});
