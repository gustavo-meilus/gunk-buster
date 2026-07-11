import { describe, expect, it } from "vitest";
import type { PileResult } from "../src/pile.js";
import type { ReportResult } from "../src/report.js";
import { renderPileHuman, renderReportHuman, renderScanHuman } from "../src/voice.js";
import type { ScanResult } from "../src/schema.js";

const scanResult: ScanResult = {
  schemaVersion: 1,
  scannedAt: "2026-07-10T00:00:00.000Z",
  repoRoot: "/repo",
  counts: { byVerdict: { SAFE: 1 }, byLabel: { DUMP: 1 } },
  findings: [
    {
      type: "file",
      path: "dist/bundle.js",
      kind: "generated",
      label: "DUMP",
      verdict: "SAFE",
      evidence: [
        {
          rule: "generated-build-dir",
          confidence: "CERTAIN",
          rationale: "almost certainly committed by mistake",
        },
      ],
      protections: [],
    },
  ],
};

const scanPath = "/repo/.gunk-buster/scan.json";

const pileResult: PileResult = {
  schemaVersion: 1,
  scannedAt: scanResult.scannedAt,
  repoRoot: scanResult.repoRoot,
  groups: [
    {
      label: "DUMP",
      count: 1,
      verdictCounts: { SAFE: 1 },
      findings: scanResult.findings,
    },
  ],
};

const emptyPileResult: PileResult = {
  schemaVersion: 1,
  scannedAt: scanResult.scannedAt,
  repoRoot: scanResult.repoRoot,
  groups: [],
};

const reportResult: ReportResult = {
  schemaVersion: 1,
  scannedAt: scanResult.scannedAt,
  repoRoot: scanResult.repoRoot,
  reportPath: "/repo/.gunk-buster/reports/report.md",
  findingsCount: 1,
  counts: scanResult.counts,
};

describe("voice — Chief default, professional override, persona-free JSON by construction", () => {
  it("renderScanHuman: chief voice addresses the Chief and is playful", () => {
    const text = renderScanHuman("chief", scanResult, scanPath);
    expect(text).toContain("Chief");
  });

  it("renderScanHuman: professional voice never addresses anyone or says Chief", () => {
    const text = renderScanHuman("professional", scanResult, scanPath);
    expect(text.toLowerCase()).not.toContain("chief");
  });

  it("renderPileHuman: chief voice says Chief when there are findings", () => {
    const text = renderPileHuman("chief", pileResult);
    expect(text).toContain("Chief");
    expect(text).toContain("DUMP");
  });

  it("renderPileHuman: renders the findings themselves — path, verdict, and evidence rationale", () => {
    for (const voice of ["chief", "professional"] as const) {
      const text = renderPileHuman(voice, pileResult);
      expect(text).toContain("dist/bundle.js");
      expect(text).toContain("SAFE");
      expect(text).toContain("almost certainly committed by mistake");
    }
  });

  it("renderPileHuman: professional voice drops the persona but keeps the data", () => {
    const text = renderPileHuman("professional", pileResult);
    expect(text.toLowerCase()).not.toContain("chief");
    expect(text).toContain("DUMP");
  });

  it("renderPileHuman: chief voice has a distinct empty-pile message", () => {
    const text = renderPileHuman("chief", emptyPileResult);
    expect(text).toContain("Chief");
  });

  it("renderPileHuman: professional voice has a distinct empty-pile message with no persona", () => {
    const text = renderPileHuman("professional", emptyPileResult);
    expect(text.toLowerCase()).not.toContain("chief");
  });

  it("renderReportHuman: chief voice says Chief and includes the report path", () => {
    const text = renderReportHuman("chief", reportResult);
    expect(text).toContain("Chief");
    expect(text).toContain("report.md");
  });

  it("renderReportHuman: professional voice drops the persona but keeps the report path", () => {
    const text = renderReportHuman("professional", reportResult);
    expect(text.toLowerCase()).not.toContain("chief");
    expect(text).toContain("report.md");
  });
});
