import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { groupFindings } from "./pile.js";
import { scanResultSchema, type Finding, type ScanResult } from "./schema.js";

/**
 * `gunk report` — writes the markdown report into `.gunk-buster/reports/`
 * from the persisted scan index. Never re-scans: it is a pure render of
 * whatever `ScanResult` it is handed. Reuses `groupFindings` from pile.ts so
 * the report groups by label exactly the same way the pile view does —
 * generic over labels/link findings with no changes needed here later.
 */

export const REPORTS_DIR_NAME = "reports";
export const REPORT_FILE_NAME = "report.md";

export const reportResultSchema = z.object({
  schemaVersion: z.literal(1),
  scannedAt: scanResultSchema.shape.scannedAt,
  repoRoot: z.string(),
  reportPath: z.string(),
  findingsCount: z.int().nonnegative(),
  counts: scanResultSchema.shape.counts,
});

export type ReportResult = z.infer<typeof reportResultSchema>;

function findingLine(finding: Finding): string[] {
  const lines: string[] = [];
  if (finding.type === "file") {
    lines.push(`- \`${finding.path}\` — ${finding.verdict}`);
  } else {
    lines.push(`- \`${finding.path}\` -> \`${finding.target}\` (broken link)`);
  }
  for (const evidence of finding.evidence) {
    lines.push(`  - ${evidence.rule} (${evidence.confidence}): ${evidence.rationale}`);
  }
  return lines;
}

/** Pure render: a ScanResult to markdown. No persona — the report is a data artifact. */
export function renderReportMarkdown(scan: ScanResult): string {
  const lines: string[] = [
    "# Gunk Buster report",
    "",
    `- Scanned: ${scan.scannedAt}`,
    `- Repo: ${scan.repoRoot}`,
    `- Findings: ${scan.findings.length}`,
    "",
  ];

  const groups = groupFindings(scan.findings);
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
 * (unchanged) persisted scan index, so re-running never requires a rescan.
 */
export async function writeReport(scan: ScanResult): Promise<ReportResult> {
  const dir = path.join(scan.repoRoot, ".gunk-buster", REPORTS_DIR_NAME);
  await mkdir(dir, { recursive: true });
  const reportPath = path.join(dir, REPORT_FILE_NAME);
  await writeFile(reportPath, renderReportMarkdown(scan));

  return reportResultSchema.parse({
    schemaVersion: 1,
    scannedAt: scan.scannedAt,
    repoRoot: scan.repoRoot,
    reportPath,
    findingsCount: scan.findings.length,
    counts: scan.counts,
  });
}
