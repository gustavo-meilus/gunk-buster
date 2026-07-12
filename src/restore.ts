import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig, type GunkConfig, type Voice } from "./config.js";
import { GunkError } from "./errors.js";
import { hashIndexedFile } from "./file-index.js";
import { resolveRepoRoot } from "./git.js";
import { trapReceiptSchema, type TrapReceipt } from "./schema.js";

/**
 * `gunk restore` — byte-identical recovery from receipts
 * (docs/specs/mvp-3-trap.md "Restore"): resolve a receipt, prove the vault
 * copy's bytes by hash, copy (never move) the file back, prove the written
 * bytes by hash again, and flip the receipt to `restored`. The vault is
 * append-only — restore removes nothing from it, and the vault-side receipt
 * copy is left as its trap-time snapshot; the in-repo receipt is the
 * authoritative record and the only one flipped.
 */

/** What `restore()` should act on — the four addressing modes from the spec. */
export type RestoreRef =
  | { trapId: string }
  | { path: string }
  | { batchId: string }
  | { all: true };

export interface RestoreSkip {
  trapId: string;
  originalPath: string;
  /** Why this receipt was left trapped — always actionable (names `--force` when that is the remedy). */
  reason: string;
}

export interface RestoreResult {
  /** The flipped receipts (`status: "restored"`), in trap-id (= chronological) order. */
  restored: TrapReceipt[];
  /** Trap-ids that were already restored — the detected no-op, never an error. */
  alreadyRestored: string[];
  /** Multi-restore only: receipts left trapped because their original path was occupied. */
  skipped: RestoreSkip[];
}

export interface RestoreOptions {
  /** Pre-loaded config, so callers that already have one (the CLI) don't re-read the file. */
  config?: GunkConfig;
  /** Overwrite an occupied original path whose content differs from the receipt. */
  force?: boolean;
  /** Clock injection for deterministic tests. */
  now?: () => Date;
}

/** Throw a GunkError, voiced per `config.voice` — the one place restore's refusal copy lives. */
function refuse(voice: Voice, chief: string, professional: string): never {
  throw new GunkError(voice === "professional" ? professional : chief);
}

function receiptsDir(repoRoot: string): string {
  return path.join(repoRoot, ".gunk-buster", "receipts");
}

/**
 * Read and schema-validate every receipt under `.gunk-buster/receipts/`,
 * sorted by trap-id (whose timestamp prefix makes that chronological). An
 * absent directory means no trap has ever happened here — an empty list, not
 * an error. Shared with reporting (the TRAPPED group is sourced from these).
 */
export async function loadReceipts(repoRoot: string): Promise<TrapReceipt[]> {
  let entries: string[];
  try {
    entries = await readdir(receiptsDir(repoRoot));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const receipts: TrapReceipt[] = [];
  for (const entry of entries.filter((e) => e.endsWith(".json")).sort()) {
    const raw = await readFile(path.join(receiptsDir(repoRoot), entry), "utf8");
    receipts.push(trapReceiptSchema.parse(JSON.parse(raw)));
  }
  return receipts;
}

/**
 * Resolve a ref to the receipts restore should act on. Returns the receipts
 * to restore plus the trap-ids that are detected no-ops (explicitly addressed
 * but already restored). Refuses when the ref resolves to nothing at all.
 *
 * By-path resolution expects exactly one `status: "trapped"` receipt: a file
 * can't be trapped twice without a restore in between, so two trapped
 * receipts for one path is an anomalous state (a bad merge of receipts/) —
 * that ambiguity errors listing the candidate trap-ids rather than guessing.
 */
function resolveRef(
  receipts: TrapReceipt[],
  ref: RestoreRef,
  voice: Voice,
): { targets: TrapReceipt[]; alreadyRestored: string[] } {
  if ("trapId" in ref) {
    const receipt = receipts.find((r) => r.trapId === ref.trapId);
    if (!receipt) {
      refuse(
        voice,
        `No receipt for "${ref.trapId}", Chief — nothing trapped under that id.`,
        `No receipt found for trap-id "${ref.trapId}".`,
      );
    }
    if (receipt.status === "restored") {
      return { targets: [], alreadyRestored: [receipt.trapId] };
    }
    return { targets: [receipt], alreadyRestored: [] };
  }

  if ("path" in ref) {
    const candidates = receipts.filter(
      (r) => r.status === "trapped" && r.originalPath === ref.path,
    );
    if (candidates.length === 0) {
      refuse(
        voice,
        `Nothing trapped at "${ref.path}", Chief.`,
        `No trapped receipt found for path "${ref.path}".`,
      );
    }
    if (candidates.length > 1) {
      const ids = candidates.map((r) => `  ${r.trapId}`).join("\n");
      refuse(
        voice,
        `"${ref.path}" matches more than one trapped receipt, Chief — pick a trap-id:\n${ids}`,
        `Path "${ref.path}" is ambiguous — restore by trap-id instead:\n${ids}`,
      );
    }
    return { targets: candidates, alreadyRestored: [] };
  }

  if ("batchId" in ref) {
    const batch = receipts.filter((r) => r.batchId === ref.batchId);
    if (batch.length === 0) {
      refuse(
        voice,
        `No receipts from batch "${ref.batchId}", Chief.`,
        `No receipts found for batch "${ref.batchId}".`,
      );
    }
    return {
      targets: batch.filter((r) => r.status === "trapped"),
      alreadyRestored: batch.filter((r) => r.status === "restored").map((r) => r.trapId),
    };
  }

  // --all: the panic button — everything currently trapped. Restored
  // receipts aren't addressed at all, so they are not no-ops here.
  const trapped = receipts.filter((r) => r.status === "trapped");
  if (trapped.length === 0) {
    refuse(
      voice,
      "Nothing's trapped, Chief — the vault owes you nothing.",
      "No trapped receipts — nothing to restore.",
    );
  }
  return { targets: trapped, alreadyRestored: [] };
}

/** Hash the file at an absolute path, returning undefined when it doesn't exist. */
async function tryHashAbsolute(absolutePath: string): Promise<string | undefined> {
  try {
    return await hashIndexedFile(path.dirname(absolutePath), path.basename(absolutePath));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

/**
 * The engine seam (spec): `restore(repoRoot, ref, opts) -> RestoreResult`.
 * Copies each resolved file from the vault back to its original path,
 * hash-verified on both ends, and flips the in-repo receipt to
 * `status: "restored"` with `restoredAt`. Never runs a git command — the
 * Chief commits the flipped receipt.
 *
 * Occupied-path handling: a destination holding different bytes refuses
 * without `force`. When the ref addresses one receipt (trap-id or path) that
 * refusal is a hard error before anything mutates; when it addresses many
 * (`batchId`/`all`) the occupied file is skipped with a reason and the rest
 * proceed — the panic button must not die on its first squatter.
 */
export async function restore(
  repoRoot: string,
  ref: RestoreRef,
  opts: RestoreOptions = {},
): Promise<RestoreResult> {
  const root = await resolveRepoRoot(repoRoot);
  const config = opts.config ?? (await loadConfig(root));
  const voice = config.voice;
  const receipts = await loadReceipts(root);
  const { targets, alreadyRestored } = resolveRef(receipts, ref, voice);
  const skipOccupied = "batchId" in ref || "all" in ref;
  const now = (opts.now ?? (() => new Date()))();

  const restored: TrapReceipt[] = [];
  const skipped: RestoreSkip[] = [];

  for (const receipt of targets) {
    // 1. Prove the vault copy still holds the trapped bytes.
    const vaultFileAbs = path.resolve(root, receipt.vaultPath);
    const vaultHash = await tryHashAbsolute(vaultFileAbs);
    if (vaultHash === undefined) {
      refuse(
        voice,
        `The vault copy for "${receipt.trapId}" is gone, Chief — ${receipt.vaultPath} is missing.`,
        `Vault copy missing for "${receipt.trapId}" at ${receipt.vaultPath}.`,
      );
    }
    if (vaultHash !== receipt.contentHash) {
      refuse(
        voice,
        `The vault copy for "${receipt.trapId}" doesn't match its receipt, Chief — someone touched the vault. Not restoring corrupted bytes.`,
        `Vault copy hash mismatch for "${receipt.trapId}" — refusing to restore.`,
      );
    }

    // 2. Refuse (or skip) an original path occupied by different content.
    const destAbs = path.join(root, ...receipt.originalPath.split("/"));
    const destHash = await tryHashAbsolute(destAbs);
    if (destHash !== undefined && destHash !== receipt.contentHash && !opts.force) {
      if (skipOccupied) {
        skipped.push({
          trapId: receipt.trapId,
          originalPath: receipt.originalPath,
          reason: `path occupied by a different file — restore it alone with --force`,
        });
        continue;
      }
      refuse(
        voice,
        `"${receipt.originalPath}" is occupied by a different file, Chief — --force to overwrite it.`,
        `"${receipt.originalPath}" exists with different content — use --force to overwrite.`,
      );
    }

    // 3. Copy (not move) back, then prove the written bytes.
    await mkdir(path.dirname(destAbs), { recursive: true });
    await copyFile(vaultFileAbs, destAbs);
    const writtenHash = await tryHashAbsolute(destAbs);
    if (writtenHash !== receipt.contentHash) {
      refuse(
        voice,
        `Restored "${receipt.originalPath}" came back with the wrong hash, Chief — something is interfering with the write.`,
        `Written file hash mismatch for "${receipt.originalPath}" — restore failed verification.`,
      );
    }

    // 4. Flip the authoritative in-repo receipt; the vault copy stays as its
    //    trap-time snapshot (append-only vault, nothing rewritten there).
    const flipped = trapReceiptSchema.parse({
      ...receipt,
      status: "restored",
      restoredAt: now.toISOString(),
    });
    await writeFile(
      path.join(receiptsDir(root), `${flipped.trapId}.json`),
      `${JSON.stringify(flipped, null, 2)}\n`,
    );
    restored.push(flipped);
  }

  return { restored, alreadyRestored, skipped };
}
