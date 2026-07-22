import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import ignore from "ignore";
import { z } from "zod";
import { contextBloatCheck } from "./checks/context-bloat.js";
import { deadCommandCheck } from "./checks/dead-command.js";
import { deadPathCheck } from "./checks/dead-paths.js";
import { packageManagerDriftCheck } from "./checks/package-manager-drift.js";
import { loadConfig, type GunkConfig, type Voice } from "./config.js";
import { buildDocGraph } from "./doc-graph.js";
import { GunkError, refuse } from "./errors.js";
import { buildFileIndex, readIndexedFile, type FileEntry } from "./file-index.js";
import { buildGitIndex } from "./git-index.js";
import { resolveRepoRoot } from "./git.js";
import { GUNK_BUSTER_GITIGNORE } from "./gunk-buster-dir.js";
import { buildPackageGraph } from "./package-graph.js";
import { applyClaimExceptions, loadClaimExceptionLedger, writeClaimException } from "./claim-exceptions.js";
import { hashIndexedFile } from "./file-index.js";
import type { AuditFile, RadarCheck, RadarContext } from "./radar-check.js";
import {
  CLAIM_LABELS,
  isActive,
  radarResultSchema,
  suggestionSchema,
  type ClaimFinding,
  type ClaimLabel,
  type RadarResult,
} from "./schema.js";

export type { AuditFile, RadarCheck, RadarContext } from "./radar-check.js";
export { labelFor } from "./radar-check.js";

/**
 * Every radar check, in registration order. The walking skeleton (#9)
 * proved the seam end to end with an empty registry; each check ticket
 * (#10-#12) landed as a pure drop-in entry here. Each check self-disables
 * via its own `radar.checks.*` kill switch, so this array itself never
 * needs to branch on config.
 */
const CHECKS: readonly RadarCheck[] = [
  packageManagerDriftCheck,
  deadCommandCheck,
  deadPathCheck,
  contextBloatCheck,
];

/**
 * Build the audit surface: every doc and agent-context file in the index,
 * content pre-read once so every check reads it for free. Mirrors scan.ts's
 * readDocContents, widened to agent-context files per the radar spec.
 * `radar.exclude` patterns (gitignore-style) are applied here, so an
 * excluded file is invisible to every check at once — radar-only; scan
 * still sees these files.
 */
async function buildAuditSurface(
  repoRoot: string,
  fileIndex: readonly FileEntry[],
  exclude: readonly string[],
): Promise<AuditFile[]> {
  const excludeMatcher = ignore().add([...exclude]);
  const surface: AuditFile[] = [];
  for (const entry of fileIndex) {
    if (entry.kind !== "doc" && entry.kind !== "agent-context") continue;
    if (excludeMatcher.ignores(entry.path)) continue;
    surface.push({ entry, content: await readIndexedFile(repoRoot, entry.path) });
  }
  return surface;
}

/**
 * Read the repo root's `.gitignore` verbatim, or `""` when the repo has
 * none — never a tool error, since a missing `.gitignore` is a perfectly
 * normal repo state (mirrors loadConfig's ENOENT-is-not-an-error handling).
 */
async function readRootGitignore(repoRoot: string): Promise<string> {
  try {
    return await readFile(path.join(repoRoot, ".gitignore"), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw new GunkError(`cannot read .gitignore: ${String(error)}`);
  }
}

/** Tally findings into the radar.json `counts` block. */
export function summarizeRadarCounts(findings: readonly ClaimFinding[]): RadarResult["counts"] {
  const byLabel: Partial<Record<ClaimLabel, number>> = {};
  const byCheck: Record<string, number> = {};

  for (const finding of findings) {
    if (!isActive(finding)) continue;
    byLabel[finding.label] = (byLabel[finding.label] ?? 0) + 1;
    byCheck[finding.check] = (byCheck[finding.check] ?? 0) + 1;
  }

  return { byLabel, byCheck };
}

/**
 * The engine seam: run a read-only radar pass over the repo containing
 * `repoRoot` and return the RadarResult (exactly the radar.json document).
 *
 * Builds the audit surface (file index entries for docs + agent-context
 * files, with contents) plus the same repo graphs the scan builds, then runs
 * every registered check over it. Every check's claim findings bypass the
 * verdict lattice and protections entirely (spec) — there is no
 * classification pipeline here, just checks emitting findings directly, the
 * same way broken-link findings bypass it in scan. `labelFor` is the only
 * place a label is decided, so a check can never mislabel its own findings.
 * When no config is passed, the optional config file at the repo root is
 * honored (zero-config otherwise). Throws GunkError for tool errors (e.g.
 * not a git repo); findings never cause an error (ADR-0004).
 */
export async function radar(repoRoot: string, config?: GunkConfig): Promise<RadarResult> {
  const root = await resolveRepoRoot(repoRoot);
  const effectiveConfig = config ?? (await loadConfig(root));

  const fileIndex = await buildFileIndex(root);
  const gitIndex = await buildGitIndex(root);
  const docGraph = await buildDocGraph(root, fileIndex, new Set(gitIndex.keys()));
  const packages = await buildPackageGraph(root, fileIndex);
  const surface = await buildAuditSurface(root, fileIndex, effectiveConfig.radar.exclude);
  const rootGitignore = await readRootGitignore(root);

  const ctx: RadarContext = {
    surface,
    fileIndex,
    gitIndex,
    docGraph,
    packages,
    config: effectiveConfig,
    rootGitignore,
  };
  const uncheckedFindings = CHECKS.flatMap((check) => check.examine(ctx));
  const hashes = new Map<string, string>();
  for (const finding of uncheckedFindings) {
    if (!hashes.has(finding.path)) hashes.set(finding.path, await hashIndexedFile(root, finding.path));
  }
  const hashedFindings = uncheckedFindings.map((finding) => ({
    ...finding,
    contentHash: hashes.get(finding.path),
  }));
  const ledger = await loadClaimExceptionLedger(root);
  const findings = applyClaimExceptions(hashedFindings, ledger.exceptions);

  return radarResultSchema.parse({
    schemaVersion: 1,
    scannedAt: new Date().toISOString(),
    repoRoot: root,
    counts: summarizeRadarCounts(findings),
    findings,
  });
}

/** Where the persisted radar index lives, relative to the repo root. */
const RADAR_JSON_RELATIVE_PATH = path.join(".gunk-buster", "radar.json");

/**
 * Persist the radar index to `<repoRoot>/.gunk-buster/radar.json`. Shares
 * the `.gunk-buster/` directory with scan.json but never touches it — same
 * internal .gitignore mechanism (#7) covers radar.json too, and writes the
 * same constant `persistScanResult` does so `gunk radar` and `gunk scan` can
 * run in either order without either clobbering the other's coverage.
 */
export async function persistRadarResult(result: RadarResult): Promise<string> {
  const dir = path.join(result.repoRoot, ".gunk-buster");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, ".gitignore"), GUNK_BUSTER_GITIGNORE);
  const radarPath = path.join(dir, "radar.json");
  await writeFile(radarPath, `${JSON.stringify(result, null, 2)}\n`);
  return radarPath;
}

/**
 * Read `<repoRoot>/.gunk-buster/radar.json` verbatim, or `undefined` when it
 * does not exist yet — a missing radar index is a perfectly normal repo
 * state (no `gunk radar` has run there), not a tool error. Any other read
 * failure (permissions, etc.) is a tool error. Shared by `loadRadarResult`
 * (which turns "missing" into a helpful GunkError, for `gunk radar` itself
 * to read its own index back) and `tryLoadRadarResult` (which lets "missing"
 * flow through as `undefined`, for `pile`/`report` to merge radar in only
 * when it exists — spec: "when no radar index exists, both commands behave
 * EXACTLY as today").
 */
async function readRadarFile(repoRoot: string): Promise<string | undefined> {
  const radarPath = path.join(repoRoot, RADAR_JSON_RELATIVE_PATH);
  try {
    return await readFile(radarPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new GunkError(`cannot read radar index: ${String(error)}`);
  }
}

/** Parse and schema-validate raw radar.json content, or throw a helpful GunkError. */
function parseRadarJson(repoRoot: string, raw: string): RadarResult {
  const radarPath = path.join(repoRoot, RADAR_JSON_RELATIVE_PATH);

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new GunkError(`invalid radar index at ${radarPath}: ${String(error)}`);
  }

  const result = radarResultSchema.safeParse(parsed);
  if (!result.success) {
    throw new GunkError(
      `invalid radar index at ${radarPath}: ${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}

/**
 * Load the persisted radar index from `<repoRoot>/.gunk-buster/radar.json`.
 * `gunk radar` itself is the only caller that needs "no index yet" treated
 * as an error (there is nothing to print back); `pile` and `report` use
 * `tryLoadRadarResult` instead. Throws a helpful GunkError when no radar has
 * been run yet, or when the persisted file fails to parse against the
 * schema.
 */
export async function loadRadarResult(repoRoot: string): Promise<RadarResult> {
  const raw = await readRadarFile(repoRoot);
  if (raw === undefined) {
    const radarPath = path.join(repoRoot, RADAR_JSON_RELATIVE_PATH);
    throw new GunkError(
      `no radar index found at ${radarPath} — run "gunk radar" first`,
    );
  }
  return parseRadarJson(repoRoot, raw);
}

/**
 * Load the persisted radar index if one exists, or `undefined` if `gunk
 * radar` has never run in this repo. `pile` and `report` (#13) use this
 * instead of `loadRadarResult` so a missing radar index is simply "nothing
 * to merge in" rather than a tool error — the spec requires their output to
 * stay byte-identical to MVP 1 when no radar index exists, which a thrown
 * error would break. A corrupt or schema-invalid radar.json still throws:
 * only "never ran" is silent.
 */
export async function tryLoadRadarResult(repoRoot: string): Promise<RadarResult | undefined> {
  const raw = await readRadarFile(repoRoot);
  if (raw === undefined) return undefined;
  return parseRadarJson(repoRoot, raw);
}

/**
 * `gunk radar --fix-plan`'s document contract: one checklist item per claim
 * finding that carries a deterministic `suggestion` (spec: "Only findings
 * that CARRY a suggestion appear"). No diffs, nothing applied — mutation is
 * MVP 3, so an item is a suggested edit, never something the tool already
 * did.
 */
export const fixPlanItemSchema = z.object({
  path: z.string(),
  line: z.int().positive(),
  label: z.enum(CLAIM_LABELS),
  check: z.string(),
  expected: z.string(),
  actual: z.string(),
  suggestion: suggestionSchema,
});

export const fixPlanResultSchema = z.object({
  schemaVersion: z.literal(1),
  scannedAt: radarResultSchema.shape.scannedAt,
  repoRoot: z.string(),
  items: z.array(fixPlanItemSchema),
});

export type FixPlanItem = z.infer<typeof fixPlanItemSchema>;
export type FixPlanResult = z.infer<typeof fixPlanResultSchema>;

/**
 * Build the `gunk radar --fix-plan` checklist from a RadarResult: a pure
 * filter-and-project over findings that carry a `suggestion`, in finding
 * order. Findings without one just locate the problem (spec) and are
 * excluded here rather than appearing with an empty suggestion.
 */
export function buildFixPlan(radar: RadarResult): FixPlanResult {
  const items = radar.findings
    .filter((finding): finding is ClaimFinding & { suggestion: NonNullable<ClaimFinding["suggestion"]> } =>
      isActive(finding) && finding.suggestion !== undefined,
    )
    .map((finding) => ({
      path: finding.path,
      line: finding.line,
      label: finding.label,
      check: finding.check,
      expected: finding.expected,
      actual: finding.actual,
      suggestion: finding.suggestion,
    }));

  return fixPlanResultSchema.parse({
    schemaVersion: 1,
    scannedAt: radar.scannedAt,
    repoRoot: radar.repoRoot,
    items,
  });
}

/** What `gunk except` pins: the exact persisted claim to except, and why. */
export interface ExceptClaimInput {
  path: string;
  check: string;
  token: string;
  line: number;
  reason: string;
}

export interface ExceptClaimResult {
  result: RadarResult;
  /** The one finding that changed, already carrying its EXCEPTED disposition — callers never re-derive it with their own copy of the match predicate. */
  finding: ClaimFinding;
}

/**
 * Find the persisted, active claim finding `gunk except` should pin, or
 * refuse. Exact match on path, line, check, and token (spec: the pin scope
 * is precise) — an already-EXCEPTED finding is never a match, since
 * excepting an exception makes no sense.
 */
function findExceptableFinding(persisted: RadarResult, input: ExceptClaimInput, voice: Voice): ClaimFinding {
  const finding = persisted.findings.find(
    (candidate) =>
      candidate.path === input.path &&
      candidate.line === input.line &&
      candidate.check === input.check &&
      candidate.actual === input.token &&
      candidate.disposition !== "EXCEPTED",
  );

  if (finding === undefined || finding.contentHash === undefined) {
    refuse(
      voice,
      "That exact active persisted Radar claim is not on the board, Chief.",
      "no matching active persisted Radar claim found.",
    );
  }

  return finding;
}

/**
 * The engine seam for `gunk except`: pin a content-scoped exception to one
 * exact persisted Radar claim finding (ADR-0010), persist the updated radar
 * index, and return it alongside the specific finding that changed.
 *
 * `input.path` must already be repo-relative, forward-slash (the same shape
 * radar.json's finding paths use) — the caller (the CLI) is responsible for
 * turning a user-supplied path into that shape.
 */
export async function exceptClaim(
  repoRoot: string,
  input: ExceptClaimInput,
  opts: { config?: GunkConfig } = {},
): Promise<ExceptClaimResult> {
  const root = await resolveRepoRoot(repoRoot);
  const config = opts.config ?? (await loadConfig(root));
  const reason = input.reason.trim();
  if (reason === "") {
    refuse(config.voice, "An exception needs a reason, Chief.", "exception reason must not be empty.");
  }

  const persisted = await loadRadarResult(root);
  const finding = findExceptableFinding(persisted, input, config.voice);

  const currentHash = await hashIndexedFile(root, finding.path);
  if (currentHash !== finding.contentHash) {
    refuse(
      config.voice,
      "That claim's document changed; run gunk radar again, Chief.",
      "persisted Radar claim is stale; run gunk radar again.",
    );
  }

  const decidedAt = new Date().toISOString();
  await writeClaimException(root, {
    path: finding.path,
    check: finding.check,
    token: finding.actual,
    contentHash: finding.contentHash,
    reason,
    decidedAt,
  });

  const exceptedFinding: ClaimFinding = { ...finding, disposition: "EXCEPTED", exceptionReason: reason };
  const updated: RadarResult = {
    ...persisted,
    findings: persisted.findings.map((candidate) => (candidate === finding ? exceptedFinding : candidate)),
  };
  updated.counts = summarizeRadarCounts(updated.findings);
  await persistRadarResult(updated);

  return { result: updated, finding: exceptedFinding };
}
