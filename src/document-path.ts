import path from "node:path";
import type { Code, InlineCode, Root, TableCell } from "mdast";
import { visit } from "unist-util-visit";

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
const MIME_TYPE = /^(?:application|audio|example|font|haptics|image|message|model|multipart|text|video|x-[A-Za-z0-9!#$&^_.+-]+)\/[A-Za-z0-9!#$&^_.+-]+$/i;
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

// The resolution base is trivially a live directory (the source document is
// indexed inside it), so it must be excluded from the walk — otherwise every
// unanchored, extension-less token would inherit its cue from the document's
// own directory regardless of what the token names.
function hasLiveAncestor(target: string, base: string, inventory: RepositoryInventory): boolean {
  let current = path.posix.dirname(target);
  while (current !== "." && current !== "" && current !== base) {
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
  if (MIME_TYPE.test(forward)) return null;
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
    hasLiveAncestor(resolvedTarget, base, inventory);
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

export interface ExplicitPathMention {
  token: string;
  line: number;
}

// Outer punctuation a token can pick up from surrounding prose-like
// separators inside a code span/block (commas, colons, quotes, parens) is
// trimmed before it is judged against the path grammar. Deliberately
// excludes glob/placeholder characters (*?[]<>{}$) and "/" so callers'
// guards still see them intact.
const LEADING_PUNCTUATION = /^['",;:()]+/;
const TRAILING_PUNCTUATION = /['",;:.()]+$/;

function tokenize(text: string): string[] {
  return text
    .split(/\s+/)
    .map((raw) => raw.replace(LEADING_PUNCTUATION, "").replace(TRAILING_PUNCTUATION, ""))
    .filter((token) => token.length > 0);
}

/**
 * Walk one document's mdast tree and collect every whitespace-separated
 * token inside an inline code span or a fenced/indented code block, plus one
 * token per table cell (its whole normalized content, not whitespace-split —
 * a cell is a single claim, not a command line), each tagged with its
 * 1-indexed source line. This is the one shared extractor Scan and Radar
 * both consume for explicit path mentions (spec: "Document path contract") —
 * prose is never mined, only these unambiguous structures.
 *
 * Line numbers: mdast's `position.start.line` for a fenced code block is the
 * opening-fence line, so content lines start one below it; an indented code
 * block has no fence line to skip. The two are told apart by comparing the
 * block's own line span (`end.line - start.line - 1`) against its actual
 * content-line count — they only agree for a fenced block.
 */
export function extractExplicitPathMentions(tree: Root): ExplicitPathMention[] {
  const mentions: ExplicitPathMention[] = [];

  visit(tree, (node) => {
    if (node.type === "inlineCode") {
      const value = (node as InlineCode).value;
      const line = node.position?.start.line ?? 1;
      for (const token of tokenize(value)) mentions.push({ token, line });
      return;
    }

    if (node.type === "code") {
      const codeNode = node as Code;
      const start = codeNode.position?.start.line ?? 1;
      const end = codeNode.position?.end.line ?? start;
      const lines = codeNode.value.split("\n");
      const isFenced = end - start - 1 === lines.length;
      const firstContentLine = isFenced ? start + 1 : start;

      lines.forEach((lineText, index) => {
        for (const token of tokenize(lineText)) {
          mentions.push({ token, line: firstContentLine + index });
        }
      });
      return;
    }

    if (node.type === "tableCell") {
      const cell = node as TableCell;
      const values: string[] = [];
      visit(cell, (child) => {
        if (child.type === "text" || child.type === "inlineCode") values.push((child as { value: string }).value);
      });
      const line = cell.position?.start.line ?? 1;
      const cellTokens = tokenize(values.join(""));
      // Spec: a table cell only counts when its normalized content is one
      // path-shaped token — a cell with prose or multiple words is not mined.
      const [token] = cellTokens;
      if (token !== undefined && cellTokens.length === 1) mentions.push({ token, line });
    }
  });

  return mentions;
}
