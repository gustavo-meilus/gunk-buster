import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { groupFindings, type PileFinding } from "./pile.js";
import {
  radarResultSchema,
  scanResultSchema,
  type RadarResult,
  type ScanResult,
} from "./schema.js";

/**
 * `gunk report` — writes the markdown report into `.gunk-buster/reports/`
 * from the persisted scan index, optionally merging the persisted radar
 * index in (#13). Never re-scans or re-runs radar: it is a pure render of
 * whatever `ScanResult`/`RadarResult` it is handed. Reuses `groupFindings`
 * from pile.ts so the report groups by label exactly the same way the pile
 * view does — generic over labels/link/claim findings with no changes
 * needed here later.
 */

export const REPORTS_DIR_NAME = "reports";
export const REPORT_FILE_NAME = "report.md";

export const reportResultSchema = z.object({
  schemaVersion: z.literal(1),
  scannedAt: scanResultSchema.shape.scannedAt,
  /** The radar index's own `scannedAt`, present only when radar was merged in. */
  radarScannedAt: radarResultSchema.shape.scannedAt.optional(),
  repoRoot: z.string(),
  reportPath: z.string(),
  findingsCount: z.int().nonnegative(),
  counts: scanResultSchema.shape.counts,
});

export type ReportResult = z.infer<typeof reportResultSchema>;

function findingLine(finding: PileFinding): string[] {
  const lines: string[] = [];
  if (finding.type === "file") {
    lines.push(`- \`${finding.path}\` — ${finding.verdict}`);
  } else if (finding.type === "claim") {
    // Claim findings are never trap proposals: path, line, and the
    // expected-vs-actual claim — no verdict (radar spec).
    lines.push(
      `- \`${finding.path}:${finding.line}\` — expected \`${finding.expected}\`, found \`${finding.actual}\``,
    );
  } else {
    lines.push(`- \`${finding.path}\` -> \`${finding.target}\` (broken link)`);
  }
  for (const evidence of finding.evidence) {
    lines.push(`  - ${evidence.rule} (${evidence.confidence}): ${evidence.rationale}`);
  }
  return lines;
}

/**
 * Pure render: a ScanResult (plus an optional RadarResult) to markdown. No
 * persona — the report is a data artifact. Omitting `radar` reproduces MVP 1
 * output byte-for-byte: no radar-scanned line, no claim-finding sections.
 */
export function renderReportMarkdown(scan: ScanResult, radar?: RadarResult): string {
  const findings: PileFinding[] = [...scan.findings, ...(radar?.findings ?? [])];

  const lines: string[] = [
    "# Gunk Buster report",
    "",
    `- Scanned: ${scan.scannedAt}`,
    ...(radar ? [`- Radar scanned: ${radar.scannedAt}`] : []),
    `- Repo: ${scan.repoRoot}`,
    `- Findings: ${findings.length}`,
    "",
  ];

  const groups = groupFindings(findings);
  if (groups.length === 0) {
    lines.push("No findings.");
    return `${lines.join("\n")}\n`;
  }

  for (const group of groups) {
    lines.push(`## ${group.label} (${group.count})`, "");
    for (const finding of group.findings) {
      lines.push(...findingLine(finding));
    }
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

/**
 * Write the report into `<repoRoot>/.gunk-buster/reports/report.md`, and
 * return the schema-versioned metadata `gunk report --json` prints. A fixed
 * filename keeps re-running report idempotent: it renders straight from the
 * (unchanged) persisted scan/radar indexes, so re-running never requires a
 * rescan or a re-radar.
 */
export async function writeReport(scan: ScanResult, radar?: RadarResult): Promise<ReportResult> {
  const dir = path.join(scan.repoRoot, ".gunk-buster", REPORTS_DIR_NAME);
  await mkdir(dir, { recursive: true });
  const reportPath = path.join(dir, REPORT_FILE_NAME);
  await writeFile(reportPath, renderReportMarkdown(scan, radar));

  return reportResultSchema.parse({
    schemaVersion: 1,
    scannedAt: scan.scannedAt,
    ...(radar ? { radarScannedAt: radar.scannedAt } : {}),
    repoRoot: scan.repoRoot,
    reportPath,
    findingsCount: scan.findings.length + (radar?.findings.length ?? 0),
    counts: scan.counts,
  });
}
