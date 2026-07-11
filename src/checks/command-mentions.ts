import type { Code, InlineCode, Root } from "mdast";
import { remark } from "remark";
import { visit } from "unist-util-visit";
import type { PackageManagerName } from "../package-graph.js";
import { PACKAGE_MANAGERS } from "../package-graph.js";

/**
 * The command-mention extractor shared by package-manager-drift and
 * dead-command (#10, docs/specs/mvp-2-radar.md "Checks"): mentions are
 * counted ONLY inside inline code spans and fenced code blocks — never
 * prose, which is where placeholders and hypotheticals live. Built with
 * remark/mdast (ADR-0003), never a regex over raw markdown, so a mention
 * inside a code span is never confused with the same words in a sentence.
 */

/**
 * One package-manager invocation found inside a code span or fenced code
 * block: the manager name plus up to two whitespace-split tokens that
 * follow it. `subcommand`/`arg` are generic — package-manager-drift only
 * looks at `manager`, dead-command interprets `subcommand`/`arg` per
 * manager's script-invocation convention (npm run X, pnpm X, yarn X,
 * bun run X).
 */
export interface CommandMention {
  manager: PackageManagerName;
  /** The token immediately after the manager name, e.g. "install", "run", or a bare script name. Undefined for a bare mention with no invocation ("just use npm"). */
  subcommand: string | undefined;
  /** The token after `subcommand`, e.g. the script name in "npm run build". Undefined when absent. */
  arg: string | undefined;
  /** The exact substring matched: the manager name through the last captured token. */
  raw: string;
  /** 1-indexed source line the mention appears on. */
  line: number;
}

// Manager name at a word boundary (so "npmjs" or "npm-run-all" alone never
// matches), followed by up to two more whitespace-delimited tokens.
const MENTION_RE = new RegExp(
  `\\b(${PACKAGE_MANAGERS.join("|")})\\b(?:[ \\t]+(\\S+))?(?:[ \\t]+(\\S+))?`,
  "g",
);

function mentionsInText(text: string, startLine: number): CommandMention[] {
  const mentions: CommandMention[] = [];
  const lines = text.split("\n");

  lines.forEach((lineText, index) => {
    for (const match of lineText.matchAll(MENTION_RE)) {
      const [raw, manager, subcommand, arg] = match;
      if (subcommand === undefined) continue; // bare manager name, no invocation to judge
      mentions.push({
        manager: manager as PackageManagerName,
        subcommand,
        arg,
        raw: raw as string,
        line: startLine + index,
      });
    }
  });

  return mentions;
}

/**
 * Extract every package-manager-invocation mention from one file's markdown
 * content: every `inlineCode` and fenced `code` node's text is scanned line
 * by line, with the physical source line reconstructed from mdast position
 * info (a fenced block's first content line is one past the opening fence).
 * Prose is never visited at all — a plain-text node contributes nothing.
 */
export function extractCommandMentions(content: string): CommandMention[] {
  const tree = remark().parse(content) as Root;
  const mentions: CommandMention[] = [];

  visit(tree, (node) => {
    if (node.type === "inlineCode") {
      const inlineCode = node as InlineCode;
      if (inlineCode.position) {
        mentions.push(...mentionsInText(inlineCode.value, inlineCode.position.start.line));
      }
    } else if (node.type === "code") {
      const code = node as Code;
      if (code.position) {
        mentions.push(...mentionsInText(code.value, code.position.start.line + 1));
      }
    }
  });

  return mentions;
}
