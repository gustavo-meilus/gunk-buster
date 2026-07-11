import path from "node:path";
import type { Voice } from "./config.js";
import type { PileResult } from "./pile.js";
import type { ReportResult } from "./report.js";
import type { Finding, ScanResult, Verdict } from "./schema.js";

/**
 * The Chief voice (CONTEXT.md "Chief"): compact, playful, concrete human
 * output, on by default across scan/pile/report. `voice: "professional"`
 * swaps every string here to neutral phrasing with no user address at all —
 * this module is the only place that distinction lives. `--json` output
 * never imports it, so no persona string can ever reach machine output by
 * construction, not just by convention.
 */

function toRepoRelative(repoRoot: string, absolutePath: string): string {
  return path.relative(repoRoot, absolutePath).split(path.sep).join("/");
}

function pluralFindings(count: number): string {
  return `${count} finding${count === 1 ? "" : "s"}`;
}

export function renderScanHuman(voice: Voice, result: ScanResult, scanPath: string): string {
  const rel = toRepoRelative(result.repoRoot, scanPath);
  const count = pluralFindings(result.findings.length);

  if (voice === "professional") {
    return [
      `Scan complete: ${result.repoRoot}`,
      `${count}.`,
      `Scan index written to ${rel}.`,
    ].join("\n");
  }

  return [
    `Chief, scan's done: ${result.repoRoot}`,
    `${count} on the pile.`,
    `Index stashed at ${rel}.`,
  ].join("\n");
}

function formatVerdictCounts(counts: Partial<Record<Verdict, number>>): string {
  const parts = Object.entries(counts)
    .filter(([, n]) => (n ?? 0) > 0)
    .map(([verdict, n]) => `${n} ${verdict}`);
  return parts.length > 0 ? parts.join(", ") : "no verdicts yet";
}

/** One compact line per finding: path, verdict (file findings), and the evidence rationale. */
function formatFinding(finding: Finding): string {
  const rationale = finding.evidence.map((e) => e.rationale).join("; ");
  return finding.type === "file"
    ? `  ${finding.path} — ${finding.verdict} — ${rationale}`
    : `  ${finding.path} -> ${finding.target} — ${rationale}`;
}

export function renderPileHuman(voice: Voice, pile: PileResult): string {
  if (pile.groups.length === 0) {
    return voice === "professional"
      ? "No findings. Nothing to pile."
      : "Chief, the pile's empty — nothing but clean content out here.";
  }

  const lines: string[] = [
    voice === "professional" ? "Gunk pile:" : "Chief, gunk pile ready.",
  ];
  for (const group of pile.groups) {
    lines.push(`${group.label} (${group.count}): ${formatVerdictCounts(group.verdictCounts)}`);
    for (const finding of group.findings) {
      lines.push(formatFinding(finding));
    }
  }
  return lines.join("\n");
}

export function renderReportHuman(voice: Voice, report: ReportResult): string {
  const rel = toRepoRelative(report.repoRoot, report.reportPath);
  return voice === "professional"
    ? `Report written to ${rel}.`
    : `Chief, report's written — ${rel}.`;
}
