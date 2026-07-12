import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { classify, summarizeCounts, type UnhashedFileFinding } from "./classify.js";
import { loadConfig, type GunkConfig } from "./config.js";
import type { Detector } from "./detector.js";
import { dumpDetector } from "./detectors/dump.js";
import { echoDetector } from "./detectors/echo.js";
import { ghostDetector, relicDetector } from "./detectors/orphan.js";
import { buildDocGraph, findBrokenLinks } from "./doc-graph.js";
import { GunkError } from "./errors.js";
import { buildFileIndex, hashIndexedFile, readIndexedFile, type FileEntry } from "./file-index.js";
import { buildGitIndex } from "./git-index.js";
import { resolveRepoRoot } from "./git.js";
import { GUNK_BUSTER_GITIGNORE } from "./gunk-buster-dir.js";
import { loadKeeps } from "./keeps.js";
import { buildReferenceGraphs } from "./reference-graphs.js";
import { scanResultSchema, type FileFinding, type KeepEntry, type ScanResult } from "./schema.js";

/** Every detector the scan runs, in registration order. */
const DETECTORS: readonly Detector[] = [
  dumpDetector,
  echoDetector,
  ghostDetector,
  relicDetector,
];

/**
 * Pre-read doc-kind contents once for content-judging rules (RELIC, the
 * sensitive-keyword soft protection). Docs only: assets are binary,
 * generated files can be huge, and no content rule applies to either.
 */
async function readDocContents(
  repoRoot: string,
  fileIndex: readonly FileEntry[],
): Promise<ReadonlyMap<string, string>> {
  const contents = new Map<string, string>();
  for (const entry of fileIndex) {
    if (entry.kind !== "doc") continue;
    contents.set(entry.path, await readIndexedFile(repoRoot, entry.path));
  }
  return contents;
}

/**
 * Attach the staleness-anchor `contentHash` to every file finding
 * (docs/specs/mvp-3-trap.md, scan.json schemaVersion 2). Hashed once per
 * distinct path even when a file carries findings under more than one
 * label, so a single scan never reads the same bytes twice.
 */
async function withContentHashes(
  repoRoot: string,
  findings: readonly UnhashedFileFinding[],
): Promise<FileFinding[]> {
  const hashByPath = new Map<string, string>();
  for (const finding of findings) {
    if (hashByPath.has(finding.path)) continue;
    hashByPath.set(finding.path, await hashIndexedFile(repoRoot, finding.path));
  }
  return findings.map((finding) => ({
    ...finding,
    contentHash: hashByPath.get(finding.path)!,
  }));
}

/**
 * Consult the keep ledger after the verdict function has already run (spec
 * "Keep decisions"): a finding whose path and current `contentHash` match a
 * keep entry is still emitted — never silently hidden — with its verdict
 * overridden to `KEEP` and `keptBy: "chief"`. A keep entry pinned to a
 * different hash (the file changed since the Chief decided) is stale and
 * changes nothing; the finding resurfaces under its normal verdict.
 */
function applyKeepDecisions(
  findings: readonly FileFinding[],
  keeps: readonly KeepEntry[],
): FileFinding[] {
  const keepByPath = new Map(keeps.map((keep) => [keep.path, keep]));
  return findings.map((finding) => {
    const keep = keepByPath.get(finding.path);
    if (keep && keep.contentHash === finding.contentHash) {
      return { ...finding, verdict: "KEEP", keptBy: "chief" };
    }
    return finding;
  });
}

/**
 * The engine seam: run a read-only scan of the repo containing `repoRoot`
 * and return the ScanResult (exactly the scan.json document).
 *
 * Builds the scan graphs (file index, git index, doc graph, reference
 * graphs), then runs the
 * classification pipeline (ADR-0002) over them: every registered detector
 * examines every candidate, and the pure verdict function turns evidence
 * and protections into a verdict per finding. Broken markdown links are a
 * graph fact rather than a judgement call, so they bypass the verdict
 * lattice entirely and become `type: "link"` findings directly from the doc
 * graph. When no config is passed, the optional config file at the repo
 * root is honored (zero-config otherwise). Throws GunkError for tool errors
 * (e.g. not a git repo); findings never cause an error (ADR-0004).
 */
export async function scan(
  repoRoot: string,
  config?: GunkConfig,
): Promise<ScanResult> {
  const root = await resolveRepoRoot(repoRoot);
  const effectiveConfig = config ?? (await loadConfig(root));

  const fileIndex = await buildFileIndex(root);
  const gitIndex = await buildGitIndex(root);
  const docGraph = await buildDocGraph(root, fileIndex);
  const references = await buildReferenceGraphs(root, fileIndex, docGraph);
  const contents = await readDocContents(root, fileIndex);

  const hashedFindings = await withContentHashes(
    root,
    classify(
      { fileIndex, gitIndex, docGraph, references, contents, config: effectiveConfig },
      DETECTORS,
    ),
  );
  const keeps = await loadKeeps(root);
  const fileFindings = applyKeepDecisions(hashedFindings, keeps);
  const linkFindings = findBrokenLinks(docGraph);

  return scanResultSchema.parse({
    schemaVersion: 2,
    scannedAt: new Date().toISOString(),
    repoRoot: root,
    counts: summarizeCounts(fileFindings),
    findings: [...fileFindings, ...linkFindings],
  });
}

/** Where the persisted scan index lives, relative to the repo root. */
const SCAN_JSON_RELATIVE_PATH = path.join(".gunk-buster", "scan.json");

/**
 * Persist the scan index to `<repoRoot>/.gunk-buster/scan.json`. The
 * directory ships an internal .gitignore covering scan.json, radar.json
 * (#9), and the reports directory (#7) — all ephemeral/per-machine for now
 * and must never become context gunk themselves; reports become tracked
 * content only in a later milestone. The ignore content is the same
 * constant `persistRadarResult` writes so running `scan` and `radar` in
 * either order never clobbers the other's coverage of this shared file.
 */
export async function persistScanResult(result: ScanResult): Promise<string> {
  const dir = path.join(result.repoRoot, ".gunk-buster");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, ".gitignore"), GUNK_BUSTER_GITIGNORE);
  const scanPath = path.join(dir, "scan.json");
  await writeFile(scanPath, `${JSON.stringify(result, null, 2)}\n`);
  return scanPath;
}

/**
 * Load the persisted scan index from `<repoRoot>/.gunk-buster/scan.json`.
 * `pile` and `report` are read-only views over this file and never re-scan
 * (#7). Throws a helpful GunkError when no scan has been run yet, or when
 * the persisted file fails to parse against the schema (e.g. hand-edited or
 * left over from an incompatible schemaVersion).
 */
export async function loadScanResult(repoRoot: string): Promise<ScanResult> {
  const scanPath = path.join(repoRoot, SCAN_JSON_RELATIVE_PATH);

  let raw: string;
  try {
    raw = await readFile(scanPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new GunkError(
        `no scan index found at ${scanPath} — run "gunk scan" first`,
      );
    }
    throw new GunkError(`cannot read scan index: ${String(error)}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new GunkError(`invalid scan index at ${scanPath}: ${String(error)}`);
  }

  const result = scanResultSchema.safeParse(parsed);
  if (!result.success) {
    throw new GunkError(
      `invalid scan index at ${scanPath}: ${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}
