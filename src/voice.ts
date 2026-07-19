import path from "node:path";
import type { Voice } from "./config.js";
import { protectionSummary } from "./trap.js";
import type { FixPlanItem, FixPlanResult } from "./radar.js";
import type { PileFinding, PileResult } from "./pile.js";
import type { ReportResult } from "./report.js";
import type { RestoreResult } from "./restore.js";
import type {
  BustResult,
  FileFinding,
  FixResult,
  RadarResult,
  ScanResult,
  TrapReceipt,
  Verdict,
  VerifyResult,
} from "./schema.js";

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

  const lines = voice === "professional"
    ? [
      `Scan complete: ${result.repoRoot}`,
      `${count}.`,
      `Scan index written to ${rel}.`,
    ]
    : [
    `Chief, scan's done: ${result.repoRoot}`,
    `${count} on the pile.`,
    `Index stashed at ${rel}.`,
  ];
  for (const diagnostic of result.diagnostics ?? []) {
    lines.push(`Reference diagnostic [${diagnostic.code}] ${diagnostic.source}: ${diagnostic.message}`);
  }
  return lines.join("\n");
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
 * live outside the verdict lattice (radar spec). Trapped rows render path,
 * the label it was trapped as, trapped date, and restore command — no
 * evidence, since a receipt's row isn't a live finding (spec "Reporting").
 */
function formatFinding(finding: PileFinding): string {
  if (finding.type === "trapped") {
    return `  ${finding.path} — trapped as ${finding.label} on ${finding.trappedAt} — ${finding.restoreCommand}`;
  }
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
 * The single SAFE/PROPOSE confirmation prompt (spec: "single confirmation
 * showing the evidence") `gunk trap` prints before mutating anything, unless
 * `--yes` skips it. Ends without a newline — it's a prompt, the answer is
 * typed on the same line.
 */
export function renderTrapConfirmation(voice: Voice, finding: FileFinding): string {
  const rationale = finding.evidence
    .map((e) => `${e.rule} (${e.confidence}): ${e.rationale}`)
    .join("; ");

  return voice === "professional"
    ? `Trap ${finding.path} as ${finding.label} (${finding.verdict})? Evidence: ${rationale}\n[y/N] `
    : `Chief, trapping ${finding.path} as ${finding.label} (${finding.verdict}) — evidence: ${rationale}.\nTrap it? [y/N] `;
}

/**
 * The mandatory ASK_CHIEF confirmation (spec "Verdict ladder"): states the
 * protection that fired and that no flag stands in for the Chief's word —
 * `--yes` does not apply here. Ends without a newline (it's a prompt).
 */
export function renderAskChiefConfirmation(voice: Voice, finding: FileFinding): string {
  const fired = protectionSummary(finding);
  const rationale = finding.evidence
    .map((e) => `${e.rule} (${e.confidence}): ${e.rationale}`)
    .join("; ");

  return voice === "professional"
    ? `${finding.path} is ASK_CHIEF — protection fired: ${fired}. Evidence: ${rationale}\nThis confirmation is mandatory (--yes does not apply). Trap it?\n[y/N] `
    : `Chief, ${finding.path} is ASK_CHIEF — protection fired: ${fired}. Evidence: ${rationale}.\nThis one needs your word — no flag speaks for you (--yes doesn't apply). Trap it? [y/N] `;
}

export function renderTrapDeclinedHuman(voice: Voice): string {
  return voice === "professional" ? "Not trapping." : "Not trapping, Chief.";
}

/** Human summary after a successful trap — always ends with the commit nudge (spec: git is the Chief's job). */
export function renderTrapHuman(voice: Voice, receipt: TrapReceipt): string {
  const receiptRel = `.gunk-buster/receipts/${receipt.trapId}.json`;
  return voice === "professional"
    ? [
        `Trapped: ${receipt.originalPath} -> ${receipt.vaultPath}`,
        `Receipt: ${receiptRel}`,
        "Commit the receipt to make this stick.",
      ].join("\n")
    : [
        `Chief, ${receipt.originalPath} is in the vault — ${receipt.vaultPath}.`,
        `Receipt stashed at ${receiptRel}.`,
        "Commit it when you get a sec, Chief.",
      ].join("\n");
}

/**
 * Human summary after a restore: what came back, what was skipped (with the
 * remedy), what was already restored — ending with the commit nudge whenever
 * a receipt was flipped (spec: git is the Chief's job).
 */
export function renderRestoreHuman(voice: Voice, result: RestoreResult): string {
  const lines: string[] = [];

  for (const receipt of result.restored) {
    lines.push(
      voice === "professional"
        ? `Restored: ${receipt.originalPath} (byte-identical, hash-verified)`
        : `Chief, ${receipt.originalPath} is back — byte-identical, hash checked on both ends.`,
    );
  }
  for (const skip of result.skipped) {
    lines.push(
      voice === "professional"
        ? `Skipped ${skip.originalPath} (${skip.trapId}): ${skip.reason}`
        : `Left ${skip.originalPath} in the vault, Chief — ${skip.reason} (${skip.trapId}).`,
    );
  }
  for (const trapId of result.alreadyRestored) {
    lines.push(
      voice === "professional"
        ? `Already restored: ${trapId} — nothing to do.`
        : `${trapId} already walked out of the vault, Chief — nothing to do.`,
    );
  }
  if (result.restored.length > 0) {
    lines.push(
      voice === "professional"
        ? "Commit the flipped receipt(s) to make this stick."
        : "Commit the receipts when you get a sec, Chief.",
    );
  }
  return lines.join("\n");
}

/**
 * Human summary of a verify run. On failure the very last line(s) are the
 * exact `gunk restore` command(s) that undo the damage (spec/ADR-0005) —
 * nothing may render after them. Pre-existing breakage and git status are
 * informational context, kept to one line each.
 */
export function renderVerifyHuman(voice: Voice, result: VerifyResult): string {
  const lines: string[] = [];

  for (const d of result.damage) {
    if (d.check === "commands") {
      lines.push(
        voice === "professional"
          ? `Verify: command failed (exit ${d.exitCode}): ${d.command}`
          : `Chief, a verify command went down (exit ${d.exitCode}): ${d.command}`,
      );
    } else {
      const via = d.check === "links" ? "links to" : "still references";
      lines.push(
        voice === "professional"
          ? `Verify: ${d.from} ${via} trapped ${d.target}`
          : `Chief, ${d.from} ${via} ${d.target} — and that one's in the vault.`,
      );
    }
  }

  if (result.preexistingBrokenLinks.length > 0) {
    const count = result.preexistingBrokenLinks.length;
    lines.push(
      voice === "professional"
        ? `Note: ${count} pre-existing broken link${count === 1 ? "" : "s"} (not caused by this mutation).`
        : `Heads-up, Chief: ${count} broken link${count === 1 ? "" : "s"} that predate${count === 1 ? "s" : ""} this — scan's problem, not mine.`,
    );
  }
  if (result.gitStatus.length > 0) {
    lines.push(
      voice === "professional"
        ? `Git status: ${result.gitStatus.length} pending change(s).`
        : `Git's holding ${result.gitStatus.length} pending change(s), Chief.`,
    );
  }
  for (const run of result.commands) {
    if (run.exitCode === 0) {
      lines.push(voice === "professional" ? `Command ok: ${run.command}` : `Ran clean: ${run.command}`);
    }
  }

  if (result.passed) {
    lines.push(voice === "professional" ? "Verify passed." : "Verify's clean, Chief — nothing broke.");
    return lines.join("\n");
  }

  // Command-only damage has no restore command — trapping isn't what broke it.
  if (result.restoreCommands.length === 0) {
    lines.push(voice === "professional" ? "Verify FAILED." : "Verify FAILED, Chief.");
  } else {
    lines.push(
      voice === "professional" ? "Verify FAILED. To undo:" : "Verify FAILED, Chief. The way back:",
    );
    lines.push(...result.restoreCommands);
  }
  return lines.join("\n");
}

/** One line per SAFE finding for the bust confirmation list: path, label, one-line evidence (spec). */
function formatSafeFinding(finding: FileFinding): string {
  const rationale = finding.evidence.map((e) => e.rationale).join("; ");
  return `  ${finding.path} — ${finding.label} — ${rationale}`;
}

export function renderBustEmptyHuman(voice: Voice): string {
  return voice === "professional"
    ? "No SAFE findings. Nothing to bust."
    : "Chief, nothing SAFE on the pile — nothing to bust.";
}

/**
 * `gunk bust safe`'s single batch confirmation (spec: "Prints the full list
 * ... then a single 'Trap these N files, Chief?'"). Ends without a newline
 * — it's a prompt, the answer is typed on the same line.
 */
export function renderBustConfirmation(voice: Voice, findings: FileFinding[]): string {
  const lines: string[] = [
    voice === "professional" ? "SAFE findings:" : "Chief, here's what's SAFE to trap:",
  ];
  for (const finding of findings) {
    lines.push(formatSafeFinding(finding));
  }
  lines.push(
    voice === "professional"
      ? `Trap these ${findings.length} files? [y/N] `
      : `Trap these ${findings.length} files, Chief? [y/N] `,
  );
  return lines.join("\n");
}

/** Human summary after a bust run: every trap, every skip (with its guard's reason), then the commit nudge if anything moved. */
export function renderBustHuman(voice: Voice, result: BustResult): string {
  const lines: string[] = [];

  for (const receipt of result.trapped) {
    lines.push(
      voice === "professional"
        ? `Trapped: ${receipt.originalPath} -> ${receipt.vaultPath}`
        : `Chief, ${receipt.originalPath} is in the vault — ${receipt.vaultPath}.`,
    );
  }
  for (const skip of result.skipped) {
    lines.push(
      voice === "professional"
        ? `Skipped ${skip.path}: ${skip.reason}`
        : `Left ${skip.path} alone, Chief — ${skip.reason}`,
    );
  }
  if (result.trapped.length > 0) {
    lines.push(
      voice === "professional"
        ? "Commit the receipts to make this stick."
        : "Commit the receipts when you get a sec, Chief.",
    );
  }
  return lines.join("\n");
}

export function renderAskEmptyHuman(voice: Voice): string {
  return voice === "professional"
    ? "No PROPOSE or ASK_CHIEF findings. Nothing to ask about."
    : "Chief, nothing to ask about — no PROPOSE or ASK_CHIEF findings on the pile.";
}

/**
 * One `gunk ask` item's description plus its action prompt, combined into
 * one string (spec: "shows its verdict, label, and evidence") — the same
 * shape as `renderTrapConfirmation`, ending without a newline since the
 * answer is typed on the same line.
 */
export function renderAskItemPrompt(voice: Voice, finding: FileFinding): string {
  const rationale = finding.evidence
    .map((e) => `${e.rule} (${e.confidence}): ${e.rationale}`)
    .join("; ");
  // ASK_CHIEF's moat (spec "Trap" verdict ladder) states the protection that
  // fired even inside ask's walk — trapping it is still one of the four
  // actions below, but the Chief sees why before choosing.
  const protectionNote =
    finding.verdict === "ASK_CHIEF"
      ? voice === "professional"
        ? ` Protection: ${protectionSummary(finding)}.`
        : ` Protection fired: ${protectionSummary(finding)}.`
      : "";
  const header =
    voice === "professional"
      ? `${finding.path} — ${finding.label} (${finding.verdict}) — ${rationale}.${protectionNote}`
      : `Chief, ${finding.path} — ${finding.label} (${finding.verdict}) — ${rationale}.${protectionNote}`;
  return `${header}\n[t]rap, [k]eep, [s]kip, [q]uit? `;
}

/** After a [k]eep action: the ruling stands until the file's content changes. */
export function renderAskKeptHuman(voice: Voice, path: string): string {
  return voice === "professional"
    ? `Kept: ${path} — pinned to its current content until it changes.`
    : `Chief, ${path} stays — I'll leave it be until the content changes.`;
}

/** The `gunk ask` session's closing tally. */
export function renderAskSummaryHuman(
  voice: Voice,
  counts: { trapped: number; kept: number; skipped: number },
): string {
  return voice === "professional"
    ? `Ask session done: ${counts.trapped} trapped, ${counts.kept} kept, ${counts.skipped} skipped.`
    : `Chief, that's the session: ${counts.trapped} trapped, ${counts.kept} kept, ${counts.skipped} skipped.`;
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

export function renderFixEmptyHuman(voice: Voice): string {
  return voice === "professional"
    ? "No suggestion-carrying claim findings. Nothing to fix."
    : "Chief, nothing on the fix plan — no findings carry a ready-made suggestion.";
}

/** One mini-diff line for the fix confirmation list (spec: `CLAUDE.md:12 — npm install → pnpm install`). */
function formatMiniDiff(item: FixPlanItem): string {
  return `  ${item.path}:${item.line} — ${item.suggestion.replace} → ${item.suggestion.with}`;
}

/**
 * `gunk radar --fix`'s single batch confirmation (spec: "every edit as a
 * mini-diff ... one y/N"). Ends without a newline — it's a prompt, the
 * answer is typed on the same line.
 */
export function renderFixConfirmation(voice: Voice, items: readonly FixPlanItem[]): string {
  const lines: string[] = [
    voice === "professional" ? "Fixable findings:" : "Chief, here's what I can fix:",
  ];
  for (const item of items) {
    lines.push(formatMiniDiff(item));
  }
  lines.push(
    voice === "professional"
      ? `Apply these ${items.length} edits? [y/N] `
      : `Apply these ${items.length} edits, Chief? [y/N] `,
  );
  return lines.join("\n");
}

/** Human summary after a fix run: every edit applied, every skip (with its guard's reason), then the commit nudge if anything changed. */
export function renderFixHuman(voice: Voice, result: FixResult): string {
  const lines: string[] = [];

  for (const item of result.applied) {
    lines.push(
      voice === "professional"
        ? `Fixed: ${item.path}:${item.line} — ${item.replace} → ${item.with}`
        : `Chief, ${item.path}:${item.line} now says ${item.with} instead of ${item.replace}.`,
    );
  }
  for (const skip of result.skipped) {
    lines.push(
      voice === "professional"
        ? `Skipped ${skip.path}:${skip.line}: ${skip.reason}`
        : `Left ${skip.path}:${skip.line} alone, Chief — ${skip.reason}`,
    );
  }
  if (result.applied.length > 0) {
    lines.push(
      voice === "professional"
        ? "Commit the edits to make this stick."
        : "Commit the edits when you get a sec, Chief.",
    );
  }
  return lines.join("\n");
}
