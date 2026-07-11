import { describe, expect, it } from "vitest";
import { renderReportMarkdown } from "../src/report.js";
import type { ClaimFinding, FileFinding, RadarResult, ScanResult } from "../src/schema.js";

function fileFinding(overrides: Partial<FileFinding> = {}): FileFinding {
  return {
    type: "file",
    path: "dist/bundle.js",
    kind: "generated",
    label: "DUMP",
    verdict: "SAFE",
    evidence: [
      {
        rule: "generated-build-dir",
        confidence: "CERTAIN",
        rationale: 'sits inside "dist/"',
      },
    ],
    protections: [],
    ...overrides,
  };
}

function scanResult(findings: ScanResult["findings"]): ScanResult {
  return {
    schemaVersion: 1,
    scannedAt: "2026-07-10T00:00:00.000Z",
    repoRoot: "/repo",
    counts: { byVerdict: {}, byLabel: {} },
    findings,
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

describe("renderReportMarkdown(scan) — pure markdown rendering for `gunk report`", () => {
  it("renders a header with scan metadata", () => {
    const markdown = renderReportMarkdown(scanResult([]));
    expect(markdown).toContain("/repo");
    expect(markdown).toContain("2026-07-10T00:00:00.000Z");
  });

  it("says clearly when there are no findings", () => {
    const markdown = renderReportMarkdown(scanResult([]));
    expect(markdown.toLowerCase()).toContain("no findings");
  });

  it("renders one section per label with path, verdict, and evidence rationale", () => {
    const markdown = renderReportMarkdown(
      scanResult([
        fileFinding({ path: "dist/bundle.js", label: "DUMP", verdict: "SAFE" }),
        fileFinding({
          path: "build.log",
          label: "DUMP",
          verdict: "PROPOSE",
          evidence: [
            { rule: "generated-extension", confidence: "STRONG", rationale: 'ends in ".log"' },
          ],
        }),
      ]),
    );

    expect(markdown).toContain("DUMP");
    expect(markdown).toContain("dist/bundle.js");
    expect(markdown).toContain("SAFE");
    expect(markdown).toContain("build.log");
    expect(markdown).toContain("PROPOSE");
    expect(markdown).toContain('ends in ".log"');
  });

  it("is generic over labels: multiple labels each get their own section", () => {
    const markdown = renderReportMarkdown(
      scanResult([
        fileFinding({ path: "dist/bundle.js", label: "DUMP", verdict: "SAFE" }),
        fileFinding({ path: "old-notes.md", kind: "doc", label: "GHOST", verdict: "PROPOSE" }),
      ]),
    );

    expect(markdown).toContain("DUMP");
    expect(markdown).toContain("GHOST");
  });

  it("carries no persona strings — the report is data, not the Chief voice", () => {
    const markdown = renderReportMarkdown(scanResult([]));
    expect(markdown.toLowerCase()).not.toContain("chief");
  });
});

describe("renderReportMarkdown(scan, radar) — merging the radar index in (#13)", () => {
  it("is byte-identical to the no-radar call when radar is omitted", () => {
    const scan = scanResult([fileFinding()]);
    expect(renderReportMarkdown(scan)).toBe(renderReportMarkdown(scan, undefined));
  });

  it("adds a BAIT/MOLD section alongside the scan sections when a radar result is passed", () => {
    const scan = scanResult([fileFinding()]);
    const radar = radarResult([claimFinding()]);

    const markdown = renderReportMarkdown(scan, radar);
    expect(markdown).toContain("DUMP");
    expect(markdown).toContain("BAIT");
  });

  it("renders a claim finding with path, line, and expected/actual — never a trap verdict", () => {
    const scan = scanResult([]);
    const radar = radarResult([
      claimFinding({ path: "CLAUDE.md", line: 7, expected: "pnpm install", actual: "npm install" }),
    ]);

    const markdown = renderReportMarkdown(scan, radar);
    expect(markdown).toContain("CLAUDE.md:7");
    expect(markdown).toContain("pnpm install");
    expect(markdown).toContain("npm install");
    expect(markdown).not.toMatch(/SAFE|PROPOSE|ASK_CHIEF|KEEP/);
  });

  it("surfaces both indexes' own scannedAt in the merged header", () => {
    const scan = scanResult([]);
    const radar = radarResult([]);

    const markdown = renderReportMarkdown(scan, radar);
    expect(markdown).toContain(scan.scannedAt);
    expect(markdown).toContain(radar.scannedAt);
  });

  it("carries no persona strings when radar is merged in either", () => {
    const scan = scanResult([]);
    const radar = radarResult([claimFinding()]);
    expect(renderReportMarkdown(scan, radar).toLowerCase()).not.toContain("chief");
  });
});
