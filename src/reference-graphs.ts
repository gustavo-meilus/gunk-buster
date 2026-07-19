import path from "node:path";
import { parse as parseJsonWithPointers } from "json-source-map";
import { outboundReferencesOf, type DocGraph } from "./doc-graph.js";
import { DOC_EXTENSIONS, readIndexedFile, type FileEntry } from "./file-index.js";
import { deduplicateAssertions, type ReferenceAssertion } from "./reference-assertions.js";

/**
 * Reference graphs 4–6 of the scan (see docs/specs/mvp-1-scan.md): the
 * agent-context graph (what AGENTS.md, CLAUDE.md, .cursorrules, .claude/**
 * and the rest of the discovery list reference), package-script refs
 * (files mentioned by package.json scripts), and CI refs (files mentioned
 * by workflow files). Together with the doc graph these complete the
 * reference surface: a file any of them reaches is not unreferenced and
 * therefore can never be GHOST (issue #5 — these are reference surfaces,
 * not soft protections).
 *
 * Discovery is delegated to the file index: every file it classified
 * "agent-context" (the full spec list — AGENTS.md, CLAUDE.md, GEMINI.md,
 * .cursorrules, .cursor/rules/**, .github/copilot-instructions.md,
 * .claude/**, .agents/**, .codex/**, .opencode/**, .aider.conf.yml) is an
 * agent-context source here, so the two can never drift.
 *
 * Non-markdown sources (.cursorrules, YAML workflows, script strings) have
 * no link syntax to parse, so references are detected as path mentions:
 * a candidate path counts as referenced when it appears in the source text
 * at a path-token boundary. Markdown agent-context files additionally
 * contribute their resolved doc-graph links, which covers relative links
 * ("../guide.md") that a repo-relative mention scan cannot see.
 */
export interface ReferenceGraphs {
  /** Repo-relative paths referenced by any agent-context file. */
  agentContextReferenced: ReadonlySet<string>;
  /** Repo-relative paths mentioned by any package.json script. */
  packageScriptReferenced: ReadonlySet<string>;
  /** Repo-relative paths mentioned by any CI workflow file. */
  ciReferenced: ReadonlySet<string>;
  assertions: readonly ReferenceAssertion[];
  referenced: ReadonlySet<string>;
  /** Valid Chief-declared canonical/derivative pairs, which alone suppress ECHO. */
  copyRelationships: readonly import("./reference-assertions.js").ValidCopyRelationship[];
}

/**
 * Does `text` mention `relPath` as a path token? A plain substring test
 * would let "docs/a.md" match inside "other-docs/a.mdx", so the character
 * on each side of the match must not extend the path word (letters,
 * digits, `_`, `-`). `/` and `.` are allowed neighbors on purpose:
 * "./docs/a.md", "/docs/a.md", and a sentence ending "see docs/a.md."
 * are all genuine mentions. Where the heuristic errs it errs toward
 * "referenced" — a false rescue keeps a live file out of the pile, while
 * a false orphan is the trust-killing kind of mistake.
 */
export function mentionsPath(text: string, relPath: string): boolean {
  return mentionLocations(text, relPath).length > 0;
}

function mentionLocations(text: string, relPath: string): number[] {
  const wordish = /[A-Za-z0-9_-]/;
  const locations: number[] = [];
  let index = text.indexOf(relPath);
  while (index !== -1) {
    const before = index === 0 ? "" : (text[index - 1] as string);
    const after =
      index + relPath.length >= text.length ? "" : (text[index + relPath.length] as string);
    if (!wordish.test(before) && !wordish.test(after)) locations.push(index);
    index = text.indexOf(relPath, index + 1);
  }
  return locations;
}

/** Backslash-authored mentions ("docs\guide.md") should match the index's forward-slash paths. */
function normalizeText(text: string): string {
  return text.replace(/\\/g, "/");
}

function isWorkflowFile(relPath: string): boolean {
  if (!relPath.startsWith(".github/workflows/")) return false;
  const ext = path.posix.extname(relPath).toLowerCase();
  return ext === ".yml" || ext === ".yaml";
}

/**
 * Collect every path mentioned by `package.json` scripts, as repo-relative
 * mentions (MVP 1 is a single-package world — ADR-0003 — so scripts run
 * from the repo root; per-package relative resolution can land with
 * workspaces in MVP 4 if ever needed). Invalid JSON emits no assertions;
 * built-in sources never fall back to scanning malformed raw text.
 */
async function packageScriptMentions(
  repoRoot: string,
  packageJsonPath: string,
  candidatePaths: readonly string[],
  into: Set<string>,
  assertions: ReferenceAssertion[],
): Promise<void> {
  const raw = await readIndexedFile(repoRoot, packageJsonPath);

  let scripts: Record<string, unknown>;
  let pointers: ReturnType<typeof parseJsonWithPointers>["pointers"];
  try {
    const sourceMap = parseJsonWithPointers(raw);
    const parsed = sourceMap.data;
    pointers = sourceMap.pointers;
    scripts =
      typeof parsed === "object" && parsed !== null
        ? ((parsed as { scripts?: Record<string, unknown> }).scripts ?? {})
        : {};
  } catch {
    // Invalid built-in manifests emit no assertion and never fall back to raw text.
    return;
  }

  for (const [name, value] of Object.entries(scripts)) {
    if (typeof value !== "string") continue;
    const pointer = `/scripts/${name.replace(/~/g, "~0").replace(/\//g, "~1")}`;
    retainMentionAssertions(assertionsFromMentions("package-script", packageJsonPath, `scripts.${name}`, value, candidatePaths, (pointers[pointer]?.value.line ?? 0) + 1, true), assertions, into);
  }
}

/** Build reference graphs 4–6 for a repo (see module doc). */
export async function buildReferenceGraphs(
  repoRoot: string,
  fileIndex: readonly FileEntry[],
  docGraph: DocGraph,
): Promise<ReferenceGraphs> {
  const candidatePaths = fileIndex.map((entry) => entry.path);

  const agentContextReferenced = new Set<string>();
  const packageScriptReferenced = new Set<string>();
  const ciReferenced = new Set<string>();
  const assertions: ReferenceAssertion[] = [];

  for (const entry of fileIndex) {
    if (entry.kind === "agent-context") {
      if (!DOC_EXTENSIONS.has(path.posix.extname(entry.path).toLowerCase())) {
        const text = await readIndexedFile(repoRoot, entry.path);
        retainMentionAssertions(assertionsFromMentions("agent-context", entry.path, "path", text, candidatePaths), assertions, agentContextReferenced);
      }
      for (const ref of outboundReferencesOf(docGraph, entry.path)) {
        if (!ref.external && ref.resolved !== null && !ref.broken) {
          agentContextReferenced.add(ref.resolved);
        }
      }
    } else if (path.posix.basename(entry.path) === "package.json") {
      await packageScriptMentions(repoRoot, entry.path, candidatePaths, packageScriptReferenced, assertions);
    } else if (isWorkflowFile(entry.path)) {
      const text = await readIndexedFile(repoRoot, entry.path);
      retainMentionAssertions(assertionsFromMentions("ci", entry.path, "path", text, candidatePaths), assertions, ciReferenced);
    }
  }

  for (const ref of docGraph.references) {
    if (!ref.external && ref.resolved !== null && !ref.broken) assertions.push({ source: "document", sourcePath: ref.from, selector: ref.kind, location: ref.line, target: ref.resolved });
  }
  for (const mention of docGraph.explicitMentions) {
    if (mention.live) {
      assertions.push({ source: "document", sourcePath: mention.sourcePath, selector: "explicit-path", location: mention.line, target: mention.resolvedTarget });
      if (fileIndex.find((entry) => entry.path === mention.sourcePath)?.kind === "agent-context") agentContextReferenced.add(mention.resolvedTarget);
    }
  }
  const retained = deduplicateAssertions(assertions);
  const referenced = new Set(retained.map((assertion) => assertion.target));

  return { agentContextReferenced, packageScriptReferenced, ciReferenced, assertions: retained, referenced, copyRelationships: [] };
}

function assertionsFromMentions(source: string, sourcePath: string, selector: string, text: string, candidatePaths: readonly string[], startingLine = 1, fixedLocation = false): ReferenceAssertion[] {
  const normalized = normalizeText(text);
  return candidatePaths.flatMap((target) => mentionLocations(normalized, target).map((index) => ({
    source, sourcePath, selector, location: fixedLocation ? startingLine : startingLine + normalized.slice(0, index).split(/\r?\n/).length - 1, target,
  })));
}

function retainMentionAssertions(created: readonly ReferenceAssertion[], assertions: ReferenceAssertion[], referenced: Set<string>): void {
  assertions.push(...created);
  for (const assertion of created) referenced.add(assertion.target);
}
