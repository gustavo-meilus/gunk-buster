import path from "node:path";
import type { Voice } from "./config.js";
import type { FixPlanResult } from "./radar.js";
import type { PileFinding, PileResult } from "./pile.js";
import type { ReportResult } from "./report.js";
import type { RadarResult, ScanResult, Verdict } from "./schema.js";

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

export function renderRadarHuman(voice: Voice, result: RadarResult, radarPath: string): string {
  const rel = toRepoRelative(result.repoRoot, radarPath);
  const count = pluralFindings(result.findings.length);

  if (voice === "professional") {
    return [
      `Radar complete: ${result.repoRoot}`,
      `${count}.`,
      `Radar index written to ${rel}.`,
    ].join("\n");
  }

  return [
    `Chief, radar's swept: ${result.repoRoot}`,
    `${count} caught on the sweep.`,
    `Index stashed at ${rel}.`,
  ].join("\n");
}

function formatVerdictCounts(counts: Partial<Record<Verdict, number>>): string {
  const parts = Object.entries(counts)
    .filter(([, n]) => (n ?? 0) > 0)
    .map(([verdict, n]) => `${n} ${verdict}`);
  return parts.length > 0 ? parts.join(", ") : "no verdicts yet";
}

/**
 * One compact line per finding: path, verdict (file findings), and the
 * evidence rationale. Claim findings (BAIT/MOLD) render path, line, and the
 * expected-vs-actual claim — never a trap verdict, since claim findings
 * live outside the verdict lattice (radar spec).
 */
function formatFinding(finding: PileFinding): string {
  const rationale = finding.evidence.map((e) => e.rationale).join("; ");
  if (finding.type === "file") {
    return `  ${finding.path} — ${finding.verdict} — ${rationale}`;
  }
  if (finding.type === "claim") {
    return `  ${finding.path}:${finding.line} — expected \`${finding.expected}\`, found \`${finding.actual}\` — ${rationale}`;
  }
  return `  ${finding.path} -> ${finding.target} — ${rationale}`;
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
  // The two indexes may be stale independently (radar spec) — surface each
  // one's own timestamp, but only once a radar result was actually merged
  // in, so a scan-only pile stays byte-identical to MVP 1 output.
  if (pile.radarScannedAt) {
    lines.push(
      voice === "professional"
        ? `Scan: ${pile.scannedAt}. Radar: ${pile.radarScannedAt}.`
        : `Chief, scan swept ${pile.scannedAt}; radar swept ${pile.radarScannedAt}.`,
    );
  }
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

/**
 * `gunk radar --fix-plan` — a checklist of every suggestion-carrying claim
 * finding (`buildFixPlan` already filtered out the rest). No diffs, nothing
 * applied — mutation is MVP 3, so each line is a suggested edit to make by
 * hand, not something the tool did.
 */
export function renderFixPlanHuman(voice: Voice, fixPlan: FixPlanResult): string {
  if (fixPlan.items.length === 0) {
    return voice === "professional"
      ? "No fix-plan items. No findings carry a deterministic suggestion."
      : "Chief, nothing to fix — no findings carry a ready-made suggestion.";
  }

  const lines: string[] = [
    voice === "professional" ? "Fix plan:" : "Chief, here's the fix plan.",
  ];
  for (const item of fixPlan.items) {
    lines.push(
      `- [ ] ${item.path}:${item.line} — replace \`${item.suggestion.replace}\` with \`${item.suggestion.with}\``,
    );
  }
  return lines.join("\n");
}
