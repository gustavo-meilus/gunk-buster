import path from "node:path";
import type { Code, InlineCode, Root } from "mdast";
import ignore from "ignore";
import { remark } from "remark";
import { visit } from "unist-util-visit";
import { EXTERNAL_SCHEME, outboundReferencesOf } from "../doc-graph.js";
import { labelFor, type RadarCheck, type RadarContext } from "../radar-check.js";
import type { ClaimFinding } from "../schema.js";

/**
 * Dead paths (#11, docs/specs/mvp-2-radar.md "3. Dead paths"): a path-shaped
 * token inside a code span or fenced code block that names neither a
 * git-tracked file nor a git-tracked directory is a claim the current repo
 * contradicts. Conservative by design — a false BAIT accusation is
 * expensive:
 *
 *  - a token only qualifies as "path-shaped" when it contains a `/` or ends
 *    in a recognized file extension (prose words never qualify);
 *  - any guard hit (glob characters, placeholder syntax, a URL scheme, a
 *    `.gitignore` match) skips the token outright, no matter how path-shaped
 *    it looks;
 *  - confidence is always STRONG, never CERTAIN — a path-shaped token isn't
 *    provably a claim about *this* repo, unlike a resolved markdown link;
 *  - a token already reported by MVP 1's broken-link check for the same
 *    file is never double-reported here.
 *
 * No suggestion is ever attached (spec) — there is no deterministic rewrite
 * for "this path doesn't exist."
 */

/**
 * Extensions common enough across ecosystems that a bare filename mention
 * (no `/`) is still recognizably path-shaped. Extends the file index's own
 * doc/asset/generated extension sets (never redefines them) with the
 * source/config extensions a doc is likely to name in a code span.
 */
const KNOWN_PATH_EXTENSIONS = new Set([
  // docs
  ".md",
  ".mdx",
  ".markdown",
  // assets
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".webp",
  ".ico",
  // generated/tool residue
  ".log",
  ".tsbuildinfo",
  // source & config, common across ecosystems
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".jsonc",
  ".yml",
  ".yaml",
  ".toml",
  ".ini",
  ".cfg",
  ".py",
  ".rb",
  ".go",
  ".rs",
  ".java",
  ".kt",
  ".c",
  ".h",
  ".cpp",
  ".hpp",
  ".cs",
  ".php",
  ".sh",
  ".bash",
  ".zsh",
  ".css",
  ".scss",
  ".html",
  ".xml",
  ".txt",
  ".sql",
  ".lock",
  ".env",
  ".vue",
  ".svelte",
  ".graphql",
  ".proto",
]);

/** Glob characters — any hit skips the token (spec guard 1). */
export function hasGlobChars(token: string): boolean {
  return /[*?[]/.test(token);
}

/**
 * Placeholder syntax — `<…>`, `{…}`, `$VAR` (spec guard 2). `$` alone is not
 * enough (e.g. a literal price in a changelog code span); it only counts
 * as a placeholder when followed by an identifier character, the shape of
 * an environment-variable reference.
 */
export function hasPlaceholderSyntax(token: string): boolean {
  return /[<>{}]/.test(token) || /\$[A-Za-z_]/.test(token);
}

/** A URL scheme (http:, mailto:, ...) — reuses doc-graph's single definition so "external" never drifts (spec guard 3). */
export function hasUrlScheme(token: string): boolean {
  return EXTERNAL_SCHEME.test(token);
}

/** The lowercased extension of a token's final path segment, or "" when it has none (or is a dotfile with nothing before the dot). */
function extensionOf(token: string): string {
  const base = token.split("/").pop() ?? token;
  const dotIndex = base.lastIndexOf(".");
  if (dotIndex <= 0) return "";
  return base.slice(dotIndex).toLowerCase();
}

/** Is `token` path-shaped: contains a `/`, or ends in a known file extension (spec)? */
export function isPathShaped(token: string): boolean {
  return token.includes("/") || KNOWN_PATH_EXTENSIONS.has(extensionOf(token));
}

// Outer punctuation a token can pick up from surrounding prose-like
// separators inside a code span/block (commas, colons, quotes, parens) is
// trimmed before guard checks. Deliberately excludes glob/placeholder
// characters (*?[]<>{}$) and "/" so the guards above see them intact.
const LEADING_PUNCTUATION = /^['",;:()]+/;
const TRAILING_PUNCTUATION = /['",;:.()]+$/;

function tokenize(text: string): string[] {
  return text
    .split(/\s+/)
    .map((raw) => raw.replace(LEADING_PUNCTUATION, "").replace(TRAILING_PUNCTUATION, ""))
    .filter((token) => token.length > 0);
}

interface PathMention {
  token: string;
  line: number;
}

/**
 * Walk one document's mdast tree and collect every whitespace-separated
 * token inside an inline code span or a fenced/indented code block, each
 * tagged with its 1-indexed source line. Mentions are only counted inside
 * code (spec) — prose is where placeholders and hypotheticals live.
 *
 * Line numbers: mdast's `position.start.line` for a fenced code block is the
 * opening-fence line, so content lines start one below it; an indented code
 * block has no fence line to skip. The two are told apart by comparing the
 * block's own line span (`end.line - start.line - 1`) against its actual
 * content-line count — they only agree for a fenced block.
 */
function extractPathMentions(content: string): PathMention[] {
  const tree = remark().parse(content) as Root;
  const mentions: PathMention[] = [];

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
    }
  });

  return mentions;
}

/**
 * Normalize a raw token the same way every tracked-path/tracked-dir/broken-
 * link comparison reads it: backslashes to forward slashes (a pasted
 * Windows-style path), a leading "./" stripped, a trailing "/" stripped
 * (directory mentions), then `path.posix.normalize`d.
 */
function normalizeToken(raw: string): string {
  const forward = raw.replace(/\\/g, "/");
  const withoutDotSlash = forward.startsWith("./") ? forward.slice(2) : forward;
  const withoutTrailingSlash =
    withoutDotSlash.length > 1 && withoutDotSlash.endsWith("/")
      ? withoutDotSlash.slice(0, -1)
      : withoutDotSlash;
  return path.posix.normalize(withoutTrailingSlash);
}

/** Every ancestor directory of a tracked file path ("a/b/c.ts" -> ["a", "a/b"]). */
function ancestorsOf(filePath: string): string[] {
  const segments = filePath.split("/");
  const dirs: string[] = [];
  for (let i = 1; i < segments.length; i++) {
    dirs.push(segments.slice(0, i).join("/"));
  }
  return dirs;
}

/**
 * Every directory implied by a set of tracked file paths — git has no
 * separate notion of a tracked directory, so "tracked directory" means "a
 * path prefix of some tracked file." Exported for direct unit testing
 * alongside the guard predicates.
 */
export function deriveTrackedDirs(trackedFiles: ReadonlySet<string>): Set<string> {
  const dirs = new Set<string>();
  for (const file of trackedFiles) {
    for (const dir of ancestorsOf(file)) dirs.add(dir);
  }
  return dirs;
}

/** Repo-relative targets of this file's broken markdown links — never double-reported as a dead path (spec). */
function brokenLinkTargetsOf(ctx: RadarContext, filePath: string): ReadonlySet<string> {
  return new Set(
    outboundReferencesOf(ctx.docGraph, filePath)
      .filter((ref) => !ref.external && ref.resolved !== null && ref.broken)
      .map((ref) => ref.resolved as string),
  );
}

export const deadPathCheck: RadarCheck = {
  name: "dead-path",

  examine(ctx: RadarContext): ClaimFinding[] {
    if (!ctx.config.radar.checks.deadPaths) return [];

    const trackedFiles = new Set(ctx.gitIndex.keys());
    const trackedDirs = deriveTrackedDirs(trackedFiles);
    const gitignoreMatcher = ignore().add(ctx.rootGitignore);

    const findings: ClaimFinding[] = [];

    for (const file of ctx.surface) {
      const brokenLinkTargets = brokenLinkTargetsOf(ctx, file.entry.path);

      for (const { token, line } of extractPathMentions(file.content)) {
        if (!isPathShaped(token)) continue;
        if (hasGlobChars(token) || hasPlaceholderSyntax(token) || hasUrlScheme(token)) continue;

        const normalized = normalizeToken(token);
        if (normalized === "" || normalized === "." || normalized.startsWith("..")) continue;

        let ignoredByGitignore = false;
        try {
          ignoredByGitignore = gitignoreMatcher.ignores(normalized);
        } catch {
          ignoredByGitignore = false; // e.g. an absolute-looking token `ignore` refuses to test
        }
        if (ignoredByGitignore) continue;

        if (trackedFiles.has(normalized) || trackedDirs.has(normalized)) continue;
        if (brokenLinkTargets.has(normalized) || brokenLinkTargets.has(token)) continue;

        findings.push({
          type: "claim",
          path: file.entry.path,
          line,
          label: labelFor(file.entry.kind),
          check: "dead-path",
          evidence: [
            {
              rule: "dead-path",
              confidence: "STRONG",
              rationale: `"${token}" is not a git-tracked file or directory in this repo`,
            },
          ],
          expected: "a git-tracked file or directory",
          actual: token,
        });
      }
    }

    return findings;
  },
};
