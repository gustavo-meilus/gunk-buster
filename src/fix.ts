import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig, type GunkConfig, type Voice } from "./config.js";
import { refuse } from "./errors.js";
import { resolveRepoRoot, runGit } from "./git.js";
import { buildFixPlan, loadRadarResult, type FixPlanItem } from "./radar.js";
import { fixResultSchema, type FixApplied, type FixResult, type FixSkip } from "./schema.js";

/**
 * `gunk radar --fix` (docs/specs/mvp-3-trap.md "Radar --fix"): apply MVP 2's
 * patch plans. A thin loop over the persisted fix plan (every
 * suggestion-carrying claim finding, MVP 2 law) — each item either applied
 * (its `suggestion.replace` rewritten to `suggestion.with` on the recorded
 * line) or skipped with the guard's own reason. No receipts: a fix is a
 * plain text edit, and git is the only undo (spec).
 */

export interface FixOptions {
  /** Pre-loaded config, so callers that already have one (the CLI) don't re-read the file. */
  config?: GunkConfig;
  /**
   * The Chief's single confirmation for the whole batch (spec: "one y/N").
   * Only the CLI's interactive prompt or a `--yes` flag may set it — `fix()`
   * refuses outright without it, `--json` included (spec: "under --json,
   * radar --fix refuses to act without --yes").
   */
  confirmed?: boolean;
  /** Apply a fix to a dirty or untracked target anyway. */
  force?: boolean;
  /** Receives loud non-fatal warnings for each skipped git-dirty/untracked target. */
  onWarning?: (warning: string) => void;
}

/** Pick a refusal/skip message by voice without throwing — `refuse()`'s wording convention, for skip reasons that must be recorded rather than thrown. */
function say(voice: Voice, chief: string, professional: string): string {
  return voice === "professional" ? professional : chief;
}

/**
 * How many lines on either side of the recorded line to search for the
 * recorded `actual` text (spec: "at/near the recorded line") — a small
 * window tolerates unrelated edits shifting nearby lines without letting a
 * fix land on the wrong line.
 */
const NEARBY_LINE_WINDOW = 2;

/**
 * Find the 0-based line index still containing `actual`, starting at the
 * recorded line and widening outward, or `undefined` when it has moved or
 * changed beyond the window (the staleness guard, spec).
 */
function findActualLine(
  lines: readonly string[],
  recordedLine: number,
  actual: string,
): number | undefined {
  const zeroBased = recordedLine - 1;
  if (lines[zeroBased]?.includes(actual)) return zeroBased;
  for (let offset = 1; offset <= NEARBY_LINE_WINDOW; offset++) {
    for (const candidate of [zeroBased - offset, zeroBased + offset]) {
      if (candidate >= 0 && candidate < lines.length && lines[candidate]?.includes(actual)) {
        return candidate;
      }
    }
  }
  return undefined;
}

/**
 * The git guard (spec: "targets must be git-clean, tracked and unmodified").
 * Unlike trap (where an untracked file proceeds with a warning), a fix skips
 * on EITHER an untracked or a dirty tracked target — `--force` overrides
 * both. Returns the skip reason, or `undefined` when clean.
 */
async function gitDirtyReason(root: string, relPath: string, voice: Voice): Promise<string | undefined> {
  const status = (
    await runGit(root, ["status", "--porcelain", "--untracked-files=all", "--", relPath])
  ).trim();
  if (status === "") return undefined;

  if (status.startsWith("??")) {
    return say(
      voice,
      `"${relPath}" is untracked, Chief — skipped; git holds no copy to diff against. --force to fix it anyway.`,
      `"${relPath}" is untracked — skipped; use --force to fix anyway.`,
    );
  }
  return say(
    voice,
    `"${relPath}" has uncommitted changes, Chief — skipped; commit first, or --force.`,
    `"${relPath}" has uncommitted changes — skipped; commit first, or use --force.`,
  );
}

/** Apply one fix-plan item's in-place rewrite, or return the skip reason (missing file, staleness guard). */
async function applyOneFix(root: string, item: FixPlanItem, voice: Voice): Promise<string | undefined> {
  const abs = path.join(root, ...item.path.split("/"));

  let raw: string;
  try {
    raw = await readFile(abs, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return say(
        voice,
        `"${item.path}" isn't on disk anymore, Chief — re-run radar.`,
        `"${item.path}" is missing on disk — re-run radar.`,
      );
    }
    throw error;
  }

  const lines = raw.split("\n");
  const lineIndex = findActualLine(lines, item.line, item.actual);
  if (lineIndex === undefined) {
    return say(
      voice,
      `${item.path}:${item.line} has moved on me, Chief — re-run radar.`,
      `${item.path}:${item.line} — the flagged text has moved or changed; re-run radar.`,
    );
  }

  lines[lineIndex] = (lines[lineIndex] ?? "").replace(item.suggestion.replace, item.suggestion.with);
  await writeFile(abs, lines.join("\n"));
  return undefined;
}

/**
 * The engine seam (spec): `fix(repoRoot, opts) -> FixResult`. Requires a
 * persisted radar index (spec: "no radar, no fix — same principle as trap's
 * input contract") — `loadRadarResult` throws its own helpful refusal when
 * none exists. Every item on the fix plan is either applied or skipped; a
 * guard firing on one item skips only that item and the rest proceed.
 */
export async function fix(repoRoot: string, opts: FixOptions = {}): Promise<FixResult> {
  const root = await resolveRepoRoot(repoRoot);
  const config = opts.config ?? (await loadConfig(root));

  if (opts.confirmed !== true) {
    refuse(
      config.voice,
      `Fix needs your yes, Chief — run "gunk radar --fix" interactively, or pass --yes.`,
      `radar --fix requires confirmation — run interactively, or pass --yes.`,
    );
  }

  const radarResult = await loadRadarResult(root);
  const plan = buildFixPlan(radarResult);

  const applied: FixApplied[] = [];
  const skipped: FixSkip[] = [];

  for (const item of plan.items) {
    if (opts.force !== true) {
      const dirtyReason = await gitDirtyReason(root, item.path, config.voice);
      if (dirtyReason !== undefined) {
        opts.onWarning?.(dirtyReason);
        skipped.push({ path: item.path, line: item.line, reason: dirtyReason });
        continue;
      }
    }

    const failureReason = await applyOneFix(root, item, config.voice);
    if (failureReason !== undefined) {
      opts.onWarning?.(failureReason);
      skipped.push({ path: item.path, line: item.line, reason: failureReason });
      continue;
    }

    applied.push({
      path: item.path,
      line: item.line,
      check: item.check,
      label: item.label,
      replace: item.suggestion.replace,
      with: item.suggestion.with,
    });
  }

  return fixResultSchema.parse({ schemaVersion: 1, applied, skipped });
}
