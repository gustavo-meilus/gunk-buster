import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig, type GunkConfig } from "./config.js";
import { buildFileIndex } from "./file-index.js";
import { buildGitIndex } from "./git-index.js";
import { resolveRepoRoot } from "./git.js";
import { scanResultSchema, type ScanResult } from "./schema.js";

/**
 * The engine seam: run a read-only scan of the repo containing `repoRoot`
 * and return the ScanResult (exactly the scan.json document).
 *
 * Builds the scan graphs (file index, git index) and runs every detector
 * over them — there are none yet, so findings is always empty. When no
 * config is passed, the optional config file at the repo root is honored
 * (zero-config otherwise). Throws GunkError for tool errors (e.g. not a
 * git repo); findings never cause an error (ADR-0004).
 */
export async function scan(
  repoRoot: string,
  config?: GunkConfig,
): Promise<ScanResult> {
  const root = await resolveRepoRoot(repoRoot);
  const effectiveConfig = config ?? (await loadConfig(root));

  // Scan graphs. No detector consumes them yet; building them here means
  // the whole pipeline exists end to end before the first detector lands.
  const graphs = {
    fileIndex: await buildFileIndex(root),
    gitIndex: await buildGitIndex(root),
    config: effectiveConfig,
  };
  void graphs;

  return scanResultSchema.parse({
    schemaVersion: 1,
    scannedAt: new Date().toISOString(),
    repoRoot: root,
    counts: { byVerdict: {}, byLabel: {} },
    findings: [],
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
