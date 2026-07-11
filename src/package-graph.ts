import path from "node:path";
import { readIndexedFile, type FileEntry } from "./file-index.js";

/**
 * The package-manifest graph — command-claim checks' (#10) counterpart to
 * the doc graph: every `package.json` in the file index (root + workspaces),
 * its scripts, and the two ground-truth signals for "which package manager
 * does this repo really use" (the root's `packageManager` field, and
 * root-level lockfiles). Built once per radar run so both command-claim
 * checks share one read of the manifests.
 */

export const PACKAGE_MANAGERS = ["npm", "pnpm", "yarn", "bun"] as const;
export type PackageManagerName = (typeof PACKAGE_MANAGERS)[number];

/** Root-level lockfile basename -> the package manager it signals. */
const LOCKFILE_MANAGERS: Readonly<Record<string, PackageManagerName>> = {
  "pnpm-lock.yaml": "pnpm",
  "package-lock.json": "npm",
  "yarn.lock": "yarn",
  "bun.lockb": "bun",
};

export interface PackageManifest {
  /** Repo-relative (forward-slash) path of this package.json. */
  path: string;
  /** This manifest's `scripts` keys. */
  scripts: ReadonlySet<string>;
}

export interface PackageGraph {
  /** Every readable, parseable package.json in the file index. */
  manifests: readonly PackageManifest[];
  /** The union of every manifest's script names (root + workspaces). */
  scriptUnion: ReadonlySet<string>;
  /** The root package.json's raw `packageManager` field (e.g. "pnpm@9.1.0"), or null when absent. */
  packageManagerField: string | null;
  /** The package manager(s) signaled by a root-level lockfile — one entry per lockfile file present. */
  lockfiles: readonly PackageManagerName[];
}

function isPackageManagerName(value: string): value is PackageManagerName {
  return (PACKAGE_MANAGERS as readonly string[]).includes(value);
}

/** Parse the manager name out of a `packageManager` field value, e.g. "pnpm@9.1.0" -> "pnpm". Null when unrecognized. */
function parseManagerName(field: string): PackageManagerName | null {
  const name = field.split("@")[0] ?? "";
  return isPackageManagerName(name) ? name : null;
}

/**
 * Build the package graph: read and parse every `package.json` in the file
 * index (malformed JSON is skipped, never a tool error — a broken manifest
 * elsewhere in the repo must not take down the whole radar run), and record
 * the root-level lockfile signals. Only root-level lockfiles count (a
 * workspace-nested lockfile is not a repo-wide signal).
 */
export async function buildPackageGraph(
  repoRoot: string,
  fileIndex: readonly FileEntry[],
): Promise<PackageGraph> {
  const manifestEntries = fileIndex.filter(
    (entry) => path.posix.basename(entry.path) === "package.json",
  );

  const manifests: PackageManifest[] = [];
  let packageManagerField: string | null = null;

  for (const entry of manifestEntries) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readIndexedFile(repoRoot, entry.path));
    } catch {
      continue; // malformed manifest — excluded from the graph, not a tool error
    }
    if (typeof parsed !== "object" || parsed === null) continue;
    const obj = parsed as Record<string, unknown>;

    const scripts = new Set<string>();
    if (typeof obj.scripts === "object" && obj.scripts !== null) {
      for (const key of Object.keys(obj.scripts as Record<string, unknown>)) scripts.add(key);
    }
    manifests.push({ path: entry.path, scripts });

    if (entry.path === "package.json" && typeof obj.packageManager === "string") {
      packageManagerField = obj.packageManager;
    }
  }

  const scriptUnion = new Set<string>();
  for (const manifest of manifests) {
    for (const script of manifest.scripts) scriptUnion.add(script);
  }

  const lockfiles = fileIndex
    .filter((entry) => !entry.path.includes("/") && entry.path in LOCKFILE_MANAGERS)
    .map((entry) => LOCKFILE_MANAGERS[entry.path] as PackageManagerName);

  return { manifests, scriptUnion, packageManagerField, lockfiles };
}

export interface TruePackageManager {
  manager: PackageManagerName;
  confidence: "CERTAIN" | "STRONG";
  rule: "packageManager-field" | "lone-lockfile";
}

/**
 * Ground truth for the repo's true package manager, strict precedence
 * (docs/specs/mvp-2-radar.md "Package-manager drift"):
 *
 * 1. The root package.json's `packageManager` field, if present and
 *    recognized -> CERTAIN.
 * 2. Else exactly one root-level lockfile -> STRONG.
 * 3. Else (no signal, or multiple lockfiles) -> null. A tool built to kill
 *    misleading context never guesses.
 *
 * Pure and exported so the precedence rules are unit-testable directly —
 * the engine seam is too coarse to exercise every combination.
 */
export function resolveTruePackageManager(graph: PackageGraph): TruePackageManager | null {
  if (graph.packageManagerField !== null) {
    const manager = parseManagerName(graph.packageManagerField);
    if (manager !== null) {
      return { manager, confidence: "CERTAIN", rule: "packageManager-field" };
    }
  }

  const uniqueLockfiles = [...new Set(graph.lockfiles)];
  if (uniqueLockfiles.length === 1) {
    return { manager: uniqueLockfiles[0] as PackageManagerName, confidence: "STRONG", rule: "lone-lockfile" };
  }

  return null;
}
