import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { groupFindings, mergeFindings, type PileFinding } from "./pile.js";
import {
  radarResultSchema,
  scanResultSchema,
  type RadarResult,
  type ScanResult,
  type TrapReceipt,
} from "./schema.js";

/**
 * `gunk report` — writes the markdown report into `.gunk-buster/reports/`
 * from the persisted scan index, optionally merging the persisted radar
 * index (#13) and the repo's trap receipts (#23) in. Never re-scans, re-runs
 * radar, or re-reads a receipt's disk state: it is a pure render of whatever
 * `ScanResult`/`RadarResult`/receipts it is handed. Reuses `groupFindings`
 * and `mergeFindings` from pile.ts so the report groups exactly the same way
 * the pile view does — generic over labels/link/claim/trapped findings with
 * no changes needed here later.
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
  if (finding.type === "trapped") {
    // A trapped row (spec: "original path, the label it was trapped as,
    // trapped date, restore command") — no evidence, no verdict.
    return [
      `- \`${finding.path}\` — trapped as ${finding.label} on ${finding.trappedAt} — \`${finding.restoreCommand}\``,
    ];
  }

  const lines: string[] = [];
  if (finding.type === "file") {
    lines.push(`- \`${finding.path}\` — ${finding.verdict}`);
  } else if (finding.type === "claim") {
    // Claim findings are never trap proposals: path, line, and the
    // expected-vs-actual claim — no verdict (radar spec).
    lines.push(
      `- \`${finding.path}:${finding.line}\` — expected \`${finding.expected}\`, found \`${finding.actual}\``,
    );
  } else if (finding.type === "link") {
    lines.push(`- \`${finding.path}\` -> \`${finding.target}\` (broken link)`);
  } else {
    lines.push(`- \`${finding.path}\` -> \`${finding.target}\` (broken reference via ${finding.source} / ${finding.selector})`);
  }
  for (const evidence of finding.evidence) {
    lines.push(`  - ${evidence.rule} (${evidence.confidence}): ${evidence.rationale}`);
  }
  return lines;
}

/** Shared by `renderReportMarkdown` and `writeReport` so a merge only ever runs once per call. */
function renderReportBody(scan: ScanResult, radar: RadarResult | undefined, findings: PileFinding[]): string {
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
 * Pure render: a ScanResult (plus an optional RadarResult and trap receipts)
 * to markdown. No persona — the report is a data artifact. Omitting `radar`
 * reproduces MVP 1 output byte-for-byte: no radar-scanned line, no
 * claim-finding sections. Omitting `receipts` means no TRAPPED section and
 * no scan findings dropped.
 */
export function renderReportMarkdown(
  scan: ScanResult,
  radar?: RadarResult,
  receipts?: readonly TrapReceipt[],
): string {
  return renderReportBody(scan, radar, mergeFindings(scan, radar, receipts));
}

/**
 * Write the report into `<repoRoot>/.gunk-buster/reports/report.md`, and
 * return the schema-versioned metadata `gunk report --json` prints. A fixed
 * filename keeps re-running report idempotent: it renders straight from the
 * (unchanged) persisted scan/radar indexes and receipts, so re-running never
 * requires a rescan, a re-radar, or a re-trap. `findingsCount` reflects what
 * the report actually shows: trapped scan findings dropped, trapped rows
 * added.
 */
export async function writeReport(
  scan: ScanResult,
  radar?: RadarResult,
  receipts?: readonly TrapReceipt[],
): Promise<ReportResult> {
  const findings = mergeFindings(scan, radar, receipts);
  const dir = path.join(scan.repoRoot, ".gunk-buster", REPORTS_DIR_NAME);
  await mkdir(dir, { recursive: true });
  const reportPath = path.join(dir, REPORT_FILE_NAME);
  await writeFile(reportPath, renderReportBody(scan, radar, findings));

  return reportResultSchema.parse({
    schemaVersion: 1,
    scannedAt: scan.scannedAt,
    ...(radar ? { radarScannedAt: radar.scannedAt } : {}),
    repoRoot: scan.repoRoot,
    reportPath,
    findingsCount: findings.length,
    counts: scan.counts,
  });
}
