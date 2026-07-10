import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import ignore, { type Ignore } from "ignore";
import type { FileKind } from "./schema.js";

/**
 * File index — the first scan graph: repo-relative paths (always
 * forward-slash), sizes, and kinds. Gitignore-aware via the `ignore`
 * package; `.git/` and the tool's own `.gunk-buster/` are never indexed.
 *
 * Kind classifies the candidate universe (doc | asset | agent-context |
 * generated). Everything else — code above all — is "other": hard-protected,
 * never a candidate (ADR-0001).
 */

export type IndexedKind = FileKind | "other";

export interface FileEntry {
  path: string;
  size: number;
  kind: IndexedKind;
}

const DOC_EXTENSIONS = new Set([".md", ".mdx", ".markdown"]);

const ASSET_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".webp",
  ".ico",
]);

const AGENT_CONTEXT_NAMES = new Set([
  "AGENTS.md",
  "CLAUDE.md",
  "GEMINI.md",
  ".cursorrules",
  ".aider.conf.yml",
]);

const AGENT_CONTEXT_DIRS = new Set([
  ".claude",
  ".agents",
  ".codex",
  ".opencode",
]);

export const GENERATED_DIRS = new Set([
  "dist",
  "build",
  "out",
  "coverage",
  "node_modules",
  ".cache",
  ".next",
  ".turbo",
]);

export const GENERATED_EXTENSIONS = new Set([".log", ".tsbuildinfo"]);

/** Is `kind` one of the four candidate-universe kinds (not hard-protected "other")? */
export function isCandidateKind(kind: IndexedKind): kind is FileKind {
  return kind !== "other";
}

export interface GeneratedMatch {
  /** Whole directory matched a known build/cache/coverage output dir, vs. just the extension. */
  reason: "build-dir" | "extension";
  /** The matched directory name or extension, for a precise rationale. */
  detail: string;
}

/**
 * Why (if at all) `relPath` was classified "generated" — the DUMP detector's
 * only input, reused here so its notion of "generated" never drifts from
 * the file index's.
 */
export function generatedMatch(relPath: string): GeneratedMatch | null {
  const segments = relPath.split("/");
  const name = segments[segments.length - 1] ?? relPath;
  const dirs = segments.slice(0, -1);
  const ext = path.posix.extname(name).toLowerCase();

  const matchedDir = dirs.find((d) => GENERATED_DIRS.has(d));
  if (matchedDir !== undefined) return { reason: "build-dir", detail: matchedDir };
  if (GENERATED_EXTENSIONS.has(ext)) return { reason: "extension", detail: ext };
  return null;
}

function classifyKind(relPath: string): IndexedKind {
  const segments = relPath.split("/");
  const name = segments[segments.length - 1] ?? relPath;
  const dirs = segments.slice(0, -1);
  const ext = path.posix.extname(name).toLowerCase();

  if (
    AGENT_CONTEXT_NAMES.has(name) ||
    dirs.some((d) => AGENT_CONTEXT_DIRS.has(d)) ||
    (dirs[0] === ".cursor" && dirs[1] === "rules") ||
    relPath === ".github/copilot-instructions.md"
  ) {
    return "agent-context";
  }
  if (generatedMatch(relPath) !== null) {
    return "generated";
  }
  if (DOC_EXTENSIONS.has(ext)) {
    return "doc";
  }
  if (ASSET_EXTENSIONS.has(ext)) {
    return "asset";
  }
  return "other";
}

interface IgnoreScope {
  /** Repo-relative forward-slash dir the .gitignore lives in ("" = root). */
  base: string;
  ig: Ignore;
}

/** Deeper .gitignore files win, exactly like git. */
function isIgnored(scopes: IgnoreScope[], relPath: string): boolean {
  let ignored = false;
  for (const { base, ig } of scopes) {
    const sub = base === "" ? relPath : relPath.slice(base.length + 1);
    const match = ig.test(sub);
    if (match.ignored) ignored = true;
    else if (match.unignored) ignored = false;
  }
  return ignored;
}

async function walk(
  repoRoot: string,
  relDir: string,
  scopes: IgnoreScope[],
  entries: FileEntry[],
): Promise<void> {
  const absDir = relDir === "" ? repoRoot : path.join(repoRoot, relDir);

  let localScopes = scopes;
  try {
    const rules = await readFile(path.join(absDir, ".gitignore"), "utf8");
    localScopes = [...scopes, { base: relDir, ig: ignore().add(rules) }];
  } catch {
    // no .gitignore in this directory
  }

  const dirents = await readdir(absDir, { withFileTypes: true });
  dirents.sort((a, b) => a.name.localeCompare(b.name));

  for (const dirent of dirents) {
    if (dirent.name === ".git" || dirent.name === ".gunk-buster") continue;

    const rel = relDir === "" ? dirent.name : `${relDir}/${dirent.name}`;

    if (dirent.isDirectory()) {
      if (isIgnored(localScopes, `${rel}/`)) continue;
      await walk(repoRoot, rel, localScopes, entries);
    } else if (dirent.isFile()) {
      if (isIgnored(localScopes, rel)) continue;
      const { size } = await stat(path.join(repoRoot, rel));
      entries.push({ path: rel, size, kind: classifyKind(rel) });
    }
  }
}

/** Build the file index for a repo root (absolute path). */
export async function buildFileIndex(repoRoot: string): Promise<FileEntry[]> {
  const entries: FileEntry[] = [];
  await walk(repoRoot, "", [], entries);
  return entries;
}
