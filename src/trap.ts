import { copyFile, mkdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig, type GunkConfig, type Voice } from "./config.js";
import { refuse } from "./errors.js";
import { hashIndexedFile } from "./file-index.js";
import { resolveRepoRoot, runGit } from "./git.js";
import { GUNK_BUSTER_GITIGNORE, loadScanResult } from "./scan.js";
import { trapReceiptSchema, type FileFinding, type ScanResult, type TrapReceipt } from "./schema.js";

/**
 * `gunk trap` — MVP 3's safety moat (docs/specs/mvp-3-trap.md): move one
 * scan-judged file finding to the external vault and leave a git-tracked
 * receipt behind. A pure filesystem move plus a receipt write — never a git
 * command (spec: "Gunk Buster never mutates git"; the status *read* below
 * mutates nothing). The full verdict ladder applies: SAFE/PROPOSE trap
 * behind one skippable confirmation, ASK_CHIEF only behind a mandatory
 * interactive one (`--yes`/`--json` never substitute — that is the moat),
 * KEEP refuses. Protections stay enforced in exactly one place — the scan
 * pipeline; this module only reads the verdict and protections the scan
 * already recorded.
 */

/**
 * The protection statement an ASK_CHIEF confirmation/refusal must carry
 * (spec: "states the protection that fired"). An ASK_CHIEF verdict without
 * fired protections came from weak evidence instead — say that.
 */
export function protectionSummary(finding: FileFinding): string {
  return finding.protections.length > 0 ? finding.protections.join(", ") : "weak evidence only";
}

/**
 * Find the file finding trap should act on, or refuse. Shared by the engine
 * seam and the CLI (which needs the same finding to render the confirmation
 * prompt before calling `trap()`) so the two can never disagree about what's
 * trappable.
 *
 * Refuses when: no file finding matches `relPath` (a link finding at the
 * same path is not a match — link findings are never trappable, spec), or
 * the verdict is KEEP (the Chief's ruling stands; the remedy is deleting
 * the keep entry). ASK_CHIEF findings pass through — their mandatory
 * confirmation is enforced inside `trap()` itself.
 */
export function findTrappableFinding(
  scanResult: ScanResult,
  relPath: string,
  voice: Voice,
): FileFinding {
  const finding = scanResult.findings.find((f) => f.type === "file" && f.path === relPath) as
    | FileFinding
    | undefined;

  if (!finding) {
    refuse(
      voice,
      `No file finding for "${relPath}", Chief — run "gunk scan" first.`,
      `No file finding for "${relPath}" — run "gunk scan" first.`,
    );
  }

  if (finding.verdict === "KEEP") {
    refuse(
      voice,
      `You told me to keep this one, Chief — delete the keep entry if that's changed.`,
      `"${relPath}" has a keep decision — remove it to make the file trappable.`,
    );
  }

  return finding;
}

/**
 * The git guard (spec "Git semantics"): a status *read*, never a mutation.
 * A tracked file with uncommitted changes refuses without `force` — trapping
 * it would make the vault the only holder of unversioned bytes. An untracked
 * file proceeds, but loudly: git holds no copy at all.
 */
async function guardGitState(
  root: string,
  relPath: string,
  voice: Voice,
  force: boolean,
  onWarning: ((warning: string) => void) | undefined,
): Promise<void> {
  const status = (
    await runGit(root, ["status", "--porcelain", "--untracked-files=all", "--", relPath])
  ).trim();

  if (status === "") return; // tracked and clean — HEAD holds these bytes

  if (status.startsWith("??")) {
    onWarning?.(
      voice === "professional"
        ? `Warning: "${relPath}" is untracked — git holds no copy; the vault will hold the only one.`
        : `Heads up, Chief: git never met "${relPath}" — after this, the vault holds the only copy in existence.`,
    );
    return;
  }

  if (!force) {
    refuse(
      voice,
      `"${relPath}" has uncommitted changes, Chief — commit first, or --force if the vault should hold unversioned bytes.`,
      `"${relPath}" has uncommitted changes (disk differs from HEAD) — commit first, or use --force.`,
    );
  }
}

/** Resolve `trap.vaultRoot` to an absolute path, refusing a vault that resolves inside the repo. */
export function resolveVaultRoot(repoRoot: string, config: GunkConfig): string {
  const absolute = path.resolve(repoRoot, config.trap.vaultRoot);
  const relativeToRepo = path.relative(repoRoot, absolute);
  const insideRepo = relativeToRepo === "" || (!relativeToRepo.startsWith("..") && !path.isAbsolute(relativeToRepo));

  if (insideRepo) {
    refuse(
      config.voice,
      "A vault inside the repo is just a decoy, Chief — point trap.vaultRoot outside it.",
      "trap.vaultRoot resolves inside the repo — point it outside instead.",
    );
  }
  return absolute;
}

/** Sanitize a repo-relative path into a filesystem-safe, human-readable slug. */
function slugifyPath(relPath: string): string {
  return relPath
    .replace(/[/\\]/g, "-")
    .replace(/[^a-zA-Z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** "2026-07-11T14:22:05.123Z" -> "2026-07-11T14-22-05Z" — sortable and filesystem-safe. */
function trapTimestamp(now: Date): string {
  return now.toISOString().replace(/\.\d+Z$/, "Z").replace(/:/g, "-");
}

/** Trap identity (spec): `<UTC timestamp>-<slug of relative path>`. */
export function buildTrapId(relPath: string, now: Date): string {
  return `${trapTimestamp(now)}-${slugifyPath(relPath)}`;
}

/** Move `from` to `to`, falling back to copy+unlink across devices (e.g. vault on another drive). */
async function moveFile(from: string, to: string): Promise<void> {
  try {
    await rename(from, to);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EXDEV") {
      await copyFile(from, to);
      await unlink(from);
      return;
    }
    throw error;
  }
}

/** Re-hash the file at trap time, translating a missing file into a helpful refusal. */
async function currentHashOrRefuse(root: string, relPath: string, voice: Voice): Promise<string> {
  try {
    return await hashIndexedFile(root, relPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      refuse(
        voice,
        `"${relPath}" isn't on disk anymore, Chief — already trapped?`,
        `"${relPath}" is missing on disk — already trapped?`,
      );
    }
    throw error;
  }
}

export interface TrapOptions {
  /** Pre-loaded config, so callers that already have one (the CLI) don't re-read the file. */
  config?: GunkConfig;
  /** Shared by every receipt from one bust/ask run; defaults to the trap-id for a standalone trap. */
  batchId?: string;
  /** Clock injection for deterministic tests. */
  now?: () => Date;
  /**
   * The Chief personally confirmed this ASK_CHIEF finding through the
   * mandatory interactive prompt. Only the CLI's interactive flow may set it
   * — never a flag, never `--yes`, never a `--json` run (spec: no flag
   * bypasses the moat). Without it, `trap()` refuses ASK_CHIEF outright.
   */
  askChiefConfirmed?: boolean;
  /** Trap a tracked file whose disk content differs from HEAD anyway. */
  force?: boolean;
  /** Receives loud non-fatal warnings (e.g. trapping an untracked file). */
  onWarning?: (warning: string) => void;
}

/**
 * The engine seam (spec): `trap(repoRoot, path, opts) -> Receipt`. Moves one
 * SAFE-, PROPOSE-, or Chief-confirmed ASK_CHIEF-verdict file finding from
 * `<repoRoot>/<relPath>` into the
 * vault at `<vaultRoot>/traps/<repo-dir-name>/<trap-id>/<relPath>`, and
 * writes the receipt both there (a copy) and at
 * `<repoRoot>/.gunk-buster/receipts/<trapId>.json` (authoritative,
 * git-tracked). Never runs a git command — the receipt write plus the
 * internal .gitignore (unchanged: it never ignores receipts/) is the whole
 * git-visible side effect; the Chief commits.
 *
 * `relPath` must already be repo-relative, forward-slash (the same shape
 * scan.json's finding paths use) — the caller (the CLI) is responsible for
 * turning a user-supplied path into that shape.
 */
export async function trap(
  repoRoot: string,
  relPath: string,
  opts: TrapOptions = {},
): Promise<TrapReceipt> {
  const root = await resolveRepoRoot(repoRoot);
  const config = opts.config ?? (await loadConfig(root));
  const scanResult = await loadScanResult(root);
  const finding = findTrappableFinding(scanResult, relPath, config.voice);

  // The top of the verdict ladder: ASK_CHIEF is trappable, but only through
  // the mandatory interactive confirmation — agents must surface these to
  // the Chief (spec). The refusal states the protection that fired.
  if (finding.verdict === "ASK_CHIEF" && opts.askChiefConfirmed !== true) {
    refuse(
      config.voice,
      `That one's ASK_CHIEF (${protectionSummary(finding)}) — only your word gets it past me, Chief. Run "gunk trap" interactively; --yes and --json don't count here.`,
      `"${relPath}" is ASK_CHIEF (${protectionSummary(finding)}) — it requires interactive confirmation; --yes and --json do not apply.`,
    );
  }

  const currentHash = await currentHashOrRefuse(root, relPath, config.voice);
  if (currentHash !== finding.contentHash) {
    refuse(
      config.voice,
      "This file changed since I judged it, Chief — re-scan.",
      `"${relPath}" changed since the scan — re-run "gunk scan".`,
    );
  }

  // After the staleness guard on purpose: a post-scan edit gets the more
  // actionable "re-scan" refusal; this one catches the file that is dirty
  // *and* was re-scanned that way (hash matches, bytes still unversioned).
  await guardGitState(root, relPath, config.voice, opts.force ?? false, opts.onWarning);

  const vaultRoot = resolveVaultRoot(root, config);
  const now = (opts.now ?? (() => new Date()))();
  const trapId = buildTrapId(relPath, now);
  const batchId = opts.batchId ?? trapId;

  const vaultTrapDir = path.join(vaultRoot, "traps", path.basename(root), trapId);
  const vaultFileAbs = path.join(vaultTrapDir, ...relPath.split("/"));
  const sourceAbs = path.join(root, ...relPath.split("/"));

  await mkdir(path.dirname(vaultFileAbs), { recursive: true });
  await moveFile(sourceAbs, vaultFileAbs);

  const vaultPath = path.relative(root, vaultFileAbs).split(path.sep).join("/");

  const receipt = trapReceiptSchema.parse({
    schemaVersion: 1,
    trapId,
    batchId,
    status: "trapped",
    originalPath: relPath,
    vaultPath,
    label: finding.label,
    verdict: finding.verdict,
    evidence: finding.evidence,
    contentHash: finding.contentHash,
    trappedAt: now.toISOString(),
    restoreCommand: `gunk restore ${trapId}`,
  } satisfies Omit<TrapReceipt, "restoredAt">);

  const receiptJson = `${JSON.stringify(receipt, null, 2)}\n`;
  await writeFile(path.join(vaultTrapDir, "receipt.json"), receiptJson);

  const gunkBusterDir = path.join(root, ".gunk-buster");
  const receiptsDir = path.join(gunkBusterDir, "receipts");
  await mkdir(receiptsDir, { recursive: true });
  // Same constant scan/radar persist — it never ignores receipts/, so
  // writing it here (idempotently) is what makes receipts git-tracked while
  // scan.json/radar.json stay ignored, no matter which command runs first.
  await writeFile(path.join(gunkBusterDir, ".gitignore"), GUNK_BUSTER_GITIGNORE);
  await writeFile(path.join(receiptsDir, `${trapId}.json`), receiptJson);

  return receipt;
}
