import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { classify, summarizeCounts } from "./classify.js";
import { loadConfig, type GunkConfig } from "./config.js";
import type { Detector } from "./detector.js";
import { dumpDetector } from "./detectors/dump.js";
import { ghostDetector, relicDetector } from "./detectors/orphan.js";
import { buildDocGraph, findBrokenLinks } from "./doc-graph.js";
import { buildFileIndex, readIndexedFile, type FileEntry } from "./file-index.js";
import { buildGitIndex } from "./git-index.js";
import { resolveRepoRoot } from "./git.js";
import { buildReferenceGraphs } from "./reference-graphs.js";
import { scanResultSchema, type ScanResult } from "./schema.js";

/** Every detector the scan runs, in registration order. */
const DETECTORS: readonly Detector[] = [dumpDetector, ghostDetector, relicDetector];

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

  const fileFindings = classify(
    { fileIndex, gitIndex, docGraph, references, contents, config: effectiveConfig },
    DETECTORS,
  );
  const linkFindings = findBrokenLinks(docGraph);

  return scanResultSchema.parse({
    schemaVersion: 1,
    scannedAt: new Date().toISOString(),
    repoRoot: root,
    counts: summarizeCounts(fileFindings),
    findings: [...fileFindings, ...linkFindings],
  });
}

/**
 * Persist the scan index to `<repoRoot>/.gunk-buster/scan.json`. The
 * directory ships an internal .gitignore covering scan.json — the scan
 * output is ephemeral, per-machine, and must never become context gunk.
 */
export async function persistScanResult(result: ScanResult): Promise<string> {
  const dir = path.join(result.repoRoot, ".gunk-buster");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, ".gitignore"), "scan.json\n");
  const scanPath = path.join(dir, "scan.json");
  await writeFile(scanPath, `${JSON.stringify(result, null, 2)}\n`);
  return scanPath;
}
