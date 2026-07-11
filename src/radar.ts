import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { contextBloatCheck } from "./checks/context-bloat.js";
import { deadPathCheck } from "./checks/dead-paths.js";
import { loadConfig, type GunkConfig } from "./config.js";
import { buildDocGraph, type DocGraph } from "./doc-graph.js";
import { GunkError } from "./errors.js";
import { buildFileIndex, readIndexedFile, type FileEntry } from "./file-index.js";
import { buildGitIndex, type GitIndex } from "./git-index.js";
import { resolveRepoRoot } from "./git.js";
import { GUNK_BUSTER_GITIGNORE } from "./scan.js";
import { radarResultSchema, type ClaimFinding, type ClaimLabel, type RadarResult } from "./schema.js";

/**
 * One audit-surface file: a file-index entry restricted to the doc/
 * agent-context universe, with its content pre-read once. This is the whole
 * candidate universe for radar checks (docs/specs/mvp-2-radar.md "Audit
 * surface") — the label a check's finding gets falls out of `entry.kind`
 * (agent-context -> BAIT, doc -> MOLD), so checks never decide the label
 * themselves.
 */
export interface AuditFile {
  entry: FileEntry;
  content: string;
}

/**
 * Everything a radar check may consult — the audit surface plus the same
 * repo graphs the scan builds, read-only. A check never decides labels or
 * protections: labels fall out of the audit surface's file kind, and claim
 * findings bypass protections entirely (spec).
 */
export interface RadarContext {
  surface: readonly AuditFile[];
  fileIndex: readonly FileEntry[];
  gitIndex: GitIndex;
  docGraph: DocGraph;
  config: GunkConfig;
  /**
   * Raw contents of the repo root's `.gitignore`, or `""` when none exists.
   * The dead-path check (#11) is the only consumer so far: an ignored token
   * (e.g. a build artifact path) is probably a stale build product, not a
   * claim, so it must be skipped rather than flagged. Root-level only —
   * nested `.gitignore` files are not consulted for this guard (a deliberate
   * MVP simplification; the file index itself already honors nested
   * `.gitignore` files when building the audit surface).
   */
  rootGitignore: string;
}

/**
 * A radar check examines the whole audit surface and emits zero or more
 * claim findings. This is the entire extension point (mirrors Detector for
 * scan): checks #10-#12 drop in as registry entries, nothing else changes.
 */
export interface RadarCheck {
  /** The check name every finding it emits carries in `check`. */
  readonly name: string;
  examine(ctx: RadarContext): ClaimFinding[];
}

/**
 * Every radar check, in registration order. The walking skeleton (#9)
 * proved the seam end to end with an empty registry; each check ticket
 * lands as a pure drop-in entry here.
 */
const CHECKS: readonly RadarCheck[] = [deadPathCheck, contextBloatCheck];

/**
 * The label a finding in this audit-surface file gets: agent-context ->
 * BAIT, doc -> MOLD (spec). Exported so every future check (#10-#12) derives
 * a finding's label from this one function instead of re-deciding it.
 */
export function labelFor(kind: AuditFile["entry"]["kind"]): ClaimLabel {
  return kind === "agent-context" ? "BAIT" : "MOLD";
}

/**
 * Build the audit surface: every doc and agent-context file in the index,
 * content pre-read once so every check reads it for free. Mirrors scan.ts's
 * readDocContents, widened to agent-context files per the radar spec.
 */
async function buildAuditSurface(
  repoRoot: string,
  fileIndex: readonly FileEntry[],
): Promise<AuditFile[]> {
  const surface: AuditFile[] = [];
  for (const entry of fileIndex) {
    if (entry.kind !== "doc" && entry.kind !== "agent-context") continue;
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
  const docGraph = await buildDocGraph(root, fileIndex);
  const surface = await buildAuditSurface(root, fileIndex);
  const rootGitignore = await readRootGitignore(root);

  const ctx: RadarContext = {
    surface,
    fileIndex,
    gitIndex,
    docGraph,
    config: effectiveConfig,
    rootGitignore,
  };
  const findings = CHECKS.flatMap((check) => check.examine(ctx));

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
 * Load the persisted radar index from `<repoRoot>/.gunk-buster/radar.json`.
 * Mirrors loadScanResult: `pile` and `report` read this back once they merge
 * radar findings in (spec), and never re-run radar themselves. Throws a
 * helpful GunkError when no radar has been run yet, or when the persisted
 * file fails to parse against the schema.
 */
export async function loadRadarResult(repoRoot: string): Promise<RadarResult> {
  const radarPath = path.join(repoRoot, RADAR_JSON_RELATIVE_PATH);

  let raw: string;
  try {
    raw = await readFile(radarPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new GunkError(
        `no radar index found at ${radarPath} — run "gunk radar" first`,
      );
    }
    throw new GunkError(`cannot read radar index: ${String(error)}`);
  }

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
