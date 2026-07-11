import { readFile } from "node:fs/promises";
import path from "node:path";
import { outboundReferencesOf, type DocGraph } from "./doc-graph.js";
import type { FileEntry } from "./file-index.js";

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
  const wordish = /[A-Za-z0-9_-]/;
  let index = text.indexOf(relPath);
  while (index !== -1) {
    const before = index === 0 ? "" : (text[index - 1] as string);
    const after =
      index + relPath.length >= text.length ? "" : (text[index + relPath.length] as string);
    if (!wordish.test(before) && !wordish.test(after)) return true;
    index = text.indexOf(relPath, index + 1);
  }
  return false;
}

/** Backslash-authored mentions ("docs\guide.md") should match the index's forward-slash paths. */
function normalizeText(text: string): string {
  return text.replace(/\\/g, "/");
}

function addMentions(
  text: string,
  candidatePaths: readonly string[],
  into: Set<string>,
): void {
  const normalized = normalizeText(text);
  for (const candidate of candidatePaths) {
    if (into.has(candidate)) continue;
    if (mentionsPath(normalized, candidate)) into.add(candidate);
  }
}

async function readRepoFile(repoRoot: string, relPath: string): Promise<string> {
  return readFile(path.join(repoRoot, ...relPath.split("/")), "utf8");
}

function isWorkflowFile(relPath: string): boolean {
  if (!relPath.startsWith(".github/workflows/")) return false;
  const ext = path.posix.extname(relPath).toLowerCase();
  return ext === ".yml" || ext === ".yaml";
}

/**
 * Collect every path mentioned by `package.json` scripts. Script text is
 * matched against repo-relative paths and, for a nested package.json,
 * against paths relative to its own directory (a script runs from there).
 * A file that is not valid JSON degrades to a plain mention scan of its
 * raw text — still no crash, and erring toward "referenced".
 */
async function packageScriptMentions(
  repoRoot: string,
  packageJsonPath: string,
  candidatePaths: readonly string[],
  into: Set<string>,
): Promise<void> {
  const raw = await readRepoFile(repoRoot, packageJsonPath);

  let scripts: Record<string, unknown> | undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    scripts =
      typeof parsed === "object" && parsed !== null
        ? ((parsed as { scripts?: Record<string, unknown> }).scripts ?? {})
        : {};
  } catch {
    addMentions(raw, candidatePaths, into); // unparseable manifest — fall back to text scan
    return;
  }

  const scriptText = Object.values(scripts)
    .filter((value): value is string => typeof value === "string")
    .join("\n");
  if (scriptText === "") return;

  addMentions(scriptText, candidatePaths, into);

  const packageDir = path.posix.dirname(packageJsonPath);
  if (packageDir === ".") return;
  const normalized = normalizeText(scriptText);
  for (const candidate of candidatePaths) {
    if (into.has(candidate) || !candidate.startsWith(`${packageDir}/`)) continue;
    if (mentionsPath(normalized, candidate.slice(packageDir.length + 1))) into.add(candidate);
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

  for (const entry of fileIndex) {
    if (entry.kind === "agent-context") {
      addMentions(await readRepoFile(repoRoot, entry.path), candidatePaths, agentContextReferenced);
      for (const ref of outboundReferencesOf(docGraph, entry.path)) {
        if (!ref.external && ref.resolved !== null && !ref.broken) {
          agentContextReferenced.add(ref.resolved);
        }
      }
    } else if (path.posix.basename(entry.path) === "package.json") {
      await packageScriptMentions(repoRoot, entry.path, candidatePaths, packageScriptReferenced);
    } else if (isWorkflowFile(entry.path)) {
      addMentions(await readRepoFile(repoRoot, entry.path), candidatePaths, ciReferenced);
    }
  }

  return { agentContextReferenced, packageScriptReferenced, ciReferenced };
}
