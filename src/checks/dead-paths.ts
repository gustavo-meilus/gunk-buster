import type { Root } from "mdast";
import ignore from "ignore";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import { EXTERNAL_SCHEME, outboundReferencesOf } from "../doc-graph.js";
import { labelFor, type RadarCheck, type RadarContext } from "../radar-check.js";
import type { ClaimFinding } from "../schema.js";
import { extractExplicitPathMentions, repositoryInventory, resolveDocumentPath } from "../document-path.js";

/**
 * Dead paths (#11, docs/specs/mvp-2-radar.md "3. Dead paths"): a path-shaped
 * token inside a code span or fenced code block that names neither a
 * git-tracked file nor a git-tracked directory is a claim the current repo
 * contradicts. Conservative by design — a false BAIT accusation is
 * expensive:
 *
 *  - a token only qualifies as "path-shaped" when it contains a `/` after
 *    any leading `/` is stripped — a bare filename (`CLAUDE.md`), a
 *    slash-command (`/deploy-now`), or a prose word is never provably a
 *    claim about *this* repo, however file-like it looks;
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

/** Parse and delegate to the shared explicit-path-mention extractor (spec: "Document path contract"). */
function extractPathMentions(content: string): import("../document-path.js").ExplicitPathMention[] {
  const tree = remark().use(remarkGfm).parse(content) as Root;
  return extractExplicitPathMentions(tree);
}

/**
 * Normalize a raw token the same way every tracked-path/tracked-dir/broken-
 * link comparison reads it: backslashes to forward slashes (a pasted
 * Windows-style path), a leading "./" stripped, a trailing "/" stripped
 * (directory mentions), then `path.posix.normalize`d.
 */
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
    const inventory = repositoryInventory(trackedFiles);
    const gitignoreMatcher = ignore().add(ctx.rootGitignore);

    const findings: ClaimFinding[] = [];

    for (const file of ctx.surface) {
      const brokenLinkTargets = brokenLinkTargetsOf(ctx, file.entry.path);

      for (const { token, line } of extractPathMentions(file.content)) {
        // Leading "/" is stripped first, then path-shapedness re-tested on
        // the stripped form: a slash-command ("/deploy-now") or a lone "/"
        // stops qualifying, while a root-anchored path ("/src/index.ts")
        // still resolves against the git index like its relative twin.
        if (hasGlobChars(token) || hasPlaceholderSyntax(token) || hasUrlScheme(token)) continue;
        const reference = resolveDocumentPath(file.entry.path, token, line, inventory);
        if (reference === null) continue;
        const normalized = reference.resolvedTarget;

        let ignoredByGitignore = false;
        try {
          ignoredByGitignore = gitignoreMatcher.ignores(normalized);
        } catch {
          ignoredByGitignore = false; // e.g. an absolute-looking token `ignore` refuses to test
        }
        if (ignoredByGitignore) continue;

        if (reference.live) continue;
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
          actual: reference.normalizedToken,
        });
      }
    }

    return findings;
  },
};
