import { describe, expect, it } from "vitest";
import type { PileResult } from "../src/pile.js";
import type { FixPlanResult } from "../src/radar.js";
import type { ReportResult } from "../src/report.js";
import {
  renderFixPlanHuman,
  renderPileHuman,
  renderRadarHuman,
  renderReportHuman,
  renderScanHuman,
} from "../src/voice.js";
import type { RadarResult, ScanResult } from "../src/schema.js";

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

const radarResult: RadarResult = {
  schemaVersion: 1,
  scannedAt: "2026-07-10T00:00:00.000Z",
  repoRoot: "/repo",
  counts: { byLabel: {}, byCheck: {} },
  findings: [],
};

const radarPath = "/repo/.gunk-buster/radar.json";

const mergedPileResult: PileResult = {
  schemaVersion: 1,
  scannedAt: scanResult.scannedAt,
  radarScannedAt: "2026-07-10T01:00:00.000Z",
  repoRoot: scanResult.repoRoot,
  groups: [
    {
      label: "BAIT",
      count: 1,
      verdictCounts: {},
      findings: [
        {
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
        },
      ],
    },
    ...pileResult.groups,
  ],
};

const emptyFixPlanResult: FixPlanResult = {
  schemaVersion: 1,
  scannedAt: "2026-07-10T00:00:00.000Z",
  repoRoot: "/repo",
  items: [],
};

const fixPlanResult: FixPlanResult = {
  schemaVersion: 1,
  scannedAt: "2026-07-10T00:00:00.000Z",
  repoRoot: "/repo",
  items: [
    {
      path: "CLAUDE.md",
      line: 3,
      label: "BAIT",
      check: "package-manager-drift",
      expected: "pnpm install",
      actual: "npm install",
      suggestion: { replace: "npm install", with: "pnpm install" },
    },
  ],
};

describe("voice — Chief default, professional override, persona-free JSON by construction", () => {
  it("renderRadarHuman: chief voice addresses the Chief and includes the radar path", () => {
    const text = renderRadarHuman("chief", radarResult, radarPath);
    expect(text).toContain("Chief");
    expect(text).toContain("radar.json");
  });

  it("renderRadarHuman: professional voice drops the persona but keeps the radar path", () => {
    const text = renderRadarHuman("professional", radarResult, radarPath);
    expect(text.toLowerCase()).not.toContain("chief");
    expect(text).toContain("radar.json");
  });

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

  it("renderPileHuman: without a merged radar result, no timestamps appear (unchanged MVP 1 output)", () => {
    const text = renderPileHuman("chief", pileResult);
    expect(text).not.toContain(scanResult.scannedAt);
  });

  it("renderPileHuman: with a merged radar result, both indexes' own timestamps appear", () => {
    const text = renderPileHuman("chief", mergedPileResult);
    expect(text).toContain(mergedPileResult.scannedAt);
    expect(text).toContain(mergedPileResult.radarScannedAt);
  });

  it("renderPileHuman: renders a claim finding with path, line, and expected/actual — never a trap verdict", () => {
    const text = renderPileHuman("chief", mergedPileResult);
    expect(text).toContain("CLAUDE.md:3");
    expect(text).toContain("pnpm install");
    expect(text).toContain("npm install");
    const claimLine = text.split("\n").find((line) => line.includes("CLAUDE.md:3"));
    expect(claimLine).not.toMatch(/SAFE|PROPOSE|ASK_CHIEF|KEEP/);
  });

  it("renderFixPlanHuman: chief voice renders a checklist of suggestion-carrying items", () => {
    const text = renderFixPlanHuman("chief", fixPlanResult);
    expect(text).toContain("Chief");
    expect(text).toContain("CLAUDE.md:3");
    expect(text).toContain("npm install");
    expect(text).toContain("pnpm install");
    expect(text).toContain("[ ]");
  });

  it("renderFixPlanHuman: professional voice drops the persona but keeps the checklist", () => {
    const text = renderFixPlanHuman("professional", fixPlanResult);
    expect(text.toLowerCase()).not.toContain("chief");
    expect(text).toContain("CLAUDE.md:3");
  });

  it("renderFixPlanHuman: has a distinct empty message when no findings carry a suggestion", () => {
    const chiefText = renderFixPlanHuman("chief", emptyFixPlanResult);
    expect(chiefText).toContain("Chief");
    const professionalText = renderFixPlanHuman("professional", emptyFixPlanResult);
    expect(professionalText.toLowerCase()).not.toContain("chief");
  });
});
