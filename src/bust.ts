import { loadConfig, type GunkConfig } from "./config.js";
import { GunkError, refuse } from "./errors.js";
import { resolveRepoRoot } from "./git.js";
import { loadScanResult } from "./scan.js";
import {
  bustResultSchema,
  type BustResult,
  type BustSkip,
  type FileFinding,
  type ScanResult,
  type TrapReceipt,
} from "./schema.js";
import { buildBatchId, trap } from "./trap.js";

/**
 * `gunk bust safe` (docs/specs/mvp-3-trap.md "Bust"): batch cleanup behind
 * one Chief decision. A thin loop over the `trap` engine seam — every
 * SAFE-verdict file finding shares one `batchId`; the per-file staleness and
 * git guards already live inside `trap()`, so a guard firing on one file
 * skips that file (with the guard's own message as the reason) and the rest
 * proceed. No new judgement lives here.
 */

/** SAFE-verdict file findings, in scan order — what `gunk bust safe` offers to trap. */
export function findSafeFindings(scanResult: ScanResult): FileFinding[] {
  return scanResult.findings.filter(
    (f): f is FileFinding => f.type === "file" && f.verdict === "SAFE",
  );
}

export interface BustOptions {
  /** Pre-loaded config, so callers that already have one (the CLI) don't re-read the file. */
  config?: GunkConfig;
  /** Clock injection for deterministic tests. */
  now?: () => Date;
  /**
   * The Chief's single confirmation for the whole batch (spec: "single
   * confirmation ... Trap these N files, Chief?"). Only the CLI's
   * interactive prompt or a `--yes` flag may set it — `bust()` refuses
   * outright without it, `--json` included (spec: "under --json, bust
   * refuses to act without --yes").
   */
  confirmed?: boolean;
  /** Receives loud non-fatal warnings from each underlying trap (e.g. an untracked file). */
  onWarning?: (warning: string) => void;
}

/**
 * The engine seam (spec): `bust(repoRoot, opts) -> BustResult`. Traps every
 * current SAFE-verdict file finding under one shared `batchId`; a per-file
 * guard refusal (staleness mismatch, dirty tracked file without `--force`,
 * …) is caught and recorded as a skip instead of aborting the run.
 */
export async function bust(repoRoot: string, opts: BustOptions = {}): Promise<BustResult> {
  const root = await resolveRepoRoot(repoRoot);
  const config = opts.config ?? (await loadConfig(root));

  if (opts.confirmed !== true) {
    refuse(
      config.voice,
      `Bust needs your yes, Chief — run "gunk bust safe" interactively, or pass --yes.`,
      `bust requires confirmation — run interactively, or pass --yes.`,
    );
  }

  const scanResult = await loadScanResult(root);
  const findings = findSafeFindings(scanResult);

  const nowFactory = opts.now ?? (() => new Date());
  const batchId = buildBatchId(nowFactory());

  const trapped: TrapReceipt[] = [];
  const skipped: BustSkip[] = [];

  for (const finding of findings) {
    try {
      const receipt = await trap(root, finding.path, {
        config,
        now: nowFactory,
        batchId,
        ...(opts.onWarning ? { onWarning: opts.onWarning } : {}),
      });
      trapped.push(receipt);
    } catch (error) {
      if (error instanceof GunkError) {
        skipped.push({ path: finding.path, reason: error.message });
        continue;
      }
      throw error;
    }
  }

  return bustResultSchema.parse({ schemaVersion: 1, batchId, trapped, skipped });
}
