import { compareDocStructures } from "../detectors/echo.js";
import { docStructureOf } from "../doc-graph.js";
import type { AuditFile, RadarCheck, RadarContext } from "../radar-check.js";
import type { ClaimFinding } from "../schema.js";

/**
 * Context bloat (#12, docs/specs/mvp-2-radar.md "4. Context bloat") —
 * agent-context files only. Long ordinary docs are legitimate; long
 * always-loaded agent context is not, so this check never looks at
 * `entry.kind === "doc"` files at all (acceptance: ordinary docs are never
 * bloat candidates regardless of size or heading similarity).
 *
 * Two independent rules, each producing its own claim finding when it
 * fires:
 *
 * 1. Word count exceeds `radar.bloatWordBudget` -> WEAK (a threshold breach
 *    is a smell, not proof).
 * 2. Heading structure substantially duplicates the root README, reusing
 *    the existing ECHO `compareDocStructures` comparator rather than
 *    reimplementing structure comparison -> STRONG (duplication is
 *    demonstrable).
 *
 * A file can trigger both; they get two separate findings rather than one
 * finding with two evidence entries, because the claim-finding schema
 * carries one `expected`/`actual` pair per finding and the two rules make
 * different claims ("under budget" vs. "structurally distinct from the
 * README"). Both rules only ever locate a whole-file property (a total word
 * count, a whole heading skeleton), never a specific line, so by convention
 * every context-bloat finding is anchored at line 1.
 *
 * Every finding is BAIT — hardcoded rather than routed through
 * `labelFor(entry.kind)`, since this check only ever examines
 * `entry.kind === "agent-context"` files, which `labelFor` always maps to
 * BAIT anyway (spec: "Findings are therefore always BAIT").
 */

/**
 * A dead-simple, deterministic word count: whitespace-separated tokens over
 * the raw file content (markdown syntax and all). No NLP, no markdown-aware
 * stripping of headings/code fences — the budget is about how much text an
 * agent loads into context, and every character of the file is loaded
 * regardless of whether it is prose or a `#`.
 */
function countWords(content: string): number {
  const trimmed = content.trim();
  if (trimmed === "") return 0;
  return trimmed.split(/\s+/).length;
}

function wordBudgetFinding(file: AuditFile, wordCount: number, budget: number): ClaimFinding {
  return {
    type: "claim",
    path: file.entry.path,
    line: 1,
    label: "BAIT",
    check: "context-bloat",
    evidence: [
      {
        rule: "word-budget-exceeded",
        confidence: "WEAK",
        rationale: `word count (${wordCount}) exceeds the ${budget}-word budget for always-loaded agent context`,
      },
    ],
    expected: `≤ ${budget} words`,
    actual: `${wordCount} words`,
  };
}

function readmeDuplicationFinding(file: AuditFile, readmePath: string): ClaimFinding {
  return {
    type: "claim",
    path: file.entry.path,
    line: 1,
    label: "BAIT",
    check: "context-bloat",
    evidence: [
      {
        rule: "duplicates-readme-structure",
        confidence: "STRONG",
        rationale: `heading structure substantially duplicates ${readmePath}`,
      },
    ],
    expected: `structure distinct from ${readmePath}`,
    actual: `heading structure substantially duplicates ${readmePath}`,
  };
}

export const contextBloatCheck: RadarCheck = {
  name: "context-bloat",
  examine(ctx: RadarContext): ClaimFinding[] {
    if (!ctx.config.radar.checks.contextBloat) return [];

    const readme = ctx.surface.find((file) => file.entry.path === "README.md");
    const readmeStructure = readme === undefined ? null : docStructureOf(ctx.docGraph, readme.entry.path);

    const findings: ClaimFinding[] = [];

    for (const file of ctx.surface) {
      if (file.entry.kind !== "agent-context") continue;

      const wordCount = countWords(file.content);
      if (wordCount > ctx.config.radar.bloatWordBudget) {
        findings.push(wordBudgetFinding(file, wordCount, ctx.config.radar.bloatWordBudget));
      }

      if (readme !== undefined && readmeStructure !== null) {
        const ownStructure = docStructureOf(ctx.docGraph, file.entry.path);
        const match = ownStructure === null ? null : compareDocStructures(ownStructure, readmeStructure);
        // "title-only" (same title, no headings on one or both sides) is the
        // ECHO comparator's weakest match kind, with nothing structural to
        // compare — not the "substantial" duplication rule 2 asks for, so
        // only the two heading-bearing match kinds count here.
        if (match !== null && match.kind !== "title-only") {
          findings.push(readmeDuplicationFinding(file, readme.entry.path));
        }
      }
    }

    return findings;
  },
};
