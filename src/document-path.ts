import path from "node:path";

export type DocumentPathAnchor = "document" | "repository";

export interface RepositoryInventory {
  files: ReadonlySet<string>;
  directories: ReadonlySet<string>;
}

export interface DocumentPathReference {
  sourcePath: string;
  line: number;
  normalizedToken: string;
  anchorMode: DocumentPathAnchor;
  resolvedTarget: string;
  live: boolean;
}

const URI_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]+:/;
const DRIVE_PATH = /^[A-Za-z]:[\\/]/;
const UNC_PATH = /^(?:\\\\|\/\/)/;
const EXPRESSION_SYNTAX = /[=*?\[\]{}<>$()]/;
const CLEAN_SEGMENT = /^[A-Za-z0-9._-]+$/;
const FILE_EXTENSION = /(?:^|\/)[A-Za-z0-9_-][A-Za-z0-9._-]*\.[A-Za-z0-9]{1,16}$/;

export function repositoryInventory(files: ReadonlySet<string>): RepositoryInventory {
  const directories = new Set<string>();
  for (const file of files) {
    const parts = file.split("/");
    for (let length = 1; length < parts.length; length++) {
      directories.add(parts.slice(0, length).join("/"));
    }
  }
  return { files, directories };
}

function hasLiveAncestor(target: string, inventory: RepositoryInventory): boolean {
  let current = path.posix.dirname(target);
  while (current !== "." && current !== "") {
    if (inventory.directories.has(current)) return true;
    current = path.posix.dirname(current);
  }
  return false;
}

export function resolveDocumentPath(
  sourcePath: string,
  rawToken: string,
  line: number,
  inventory: RepositoryInventory,
  explicitSyntax = false,
): DocumentPathReference | null {
  const token = rawToken.trim();
  if (
    token === "" ||
    URI_SCHEME.test(token) ||
    DRIVE_PATH.test(token) ||
    UNC_PATH.test(token) ||
    EXPRESSION_SYNTAX.test(token) ||
    token.startsWith("@")
  ) return null;

  const forward = token.replace(/\\/g, "/");
  const repositoryAnchored = forward.startsWith("/");
  const explicitlyRelative = /^(?:\.\.?\/)/.test(forward);
  const withoutAnchor = repositoryAnchored ? forward.slice(1) : forward;
  const withoutTrailing = withoutAnchor.length > 1 ? withoutAnchor.replace(/\/+$/, "") : withoutAnchor;
  const segments = withoutTrailing.split("/");

  if (
    withoutTrailing === "" ||
    segments.every((segment) => /^\d+$/.test(segment)) ||
    segments.some((segment) => segment === "" || (segment !== "." && segment !== ".." && !CLEAN_SEGMENT.test(segment)))
  ) return null;

  const base = repositoryAnchored ? "" : path.posix.dirname(sourcePath) === "." ? "" : path.posix.dirname(sourcePath);
  const resolvedTarget = path.posix.normalize(path.posix.join(base, withoutTrailing));
  if (resolvedTarget === "." || resolvedTarget === "" || resolvedTarget === ".." || resolvedTarget.startsWith("../")) return null;

  const rootAnchorCue =
    repositoryAnchored && (withoutTrailing.includes("/") || FILE_EXTENSION.test(withoutTrailing));
  const hasCue =
    explicitSyntax ||
    rootAnchorCue ||
    explicitlyRelative ||
    FILE_EXTENSION.test(withoutTrailing) ||
    hasLiveAncestor(resolvedTarget, inventory);
  if (!hasCue) return null;

  return {
    sourcePath,
    line,
    normalizedToken: withoutTrailing,
    anchorMode: repositoryAnchored ? "repository" : "document",
    resolvedTarget,
    live: inventory.files.has(resolvedTarget) || inventory.directories.has(resolvedTarget),
  };
}
