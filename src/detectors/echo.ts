import type { Detector } from "../detector.js";
import { allDocStructures, docStructureOf, type DocStructure } from "../doc-graph.js";
import type { Evidence } from "../schema.js";

/**
 * ECHO — a duplicate of another doc: competing copies of the same guidance.
 * It requires substantial normalized body-content overlap. Both sides of an
 * undeclared duplicate pair are reported; a Chief-declared copy relationship
 * suppresses only that exact canonical/derivative pair.
 */

/** Case- and whitespace-insensitive comparison key for titles and headings. */
function normalizeText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * How strongly two same-title docs structurally resemble each other. This is
 * retained for Radar's context-bloat check; it is not ECHO evidence.
 *
 * - "identical-headings" — same title, same heading set: the strongest
 *   structural match this detector can make (STRONG evidence).
 * - "overlapping-headings" — same title and at least half of each doc's
 *   headings appear in the other: still competing copies (STRONG evidence).
 * - "title-only" — same title but no headings on one or both sides, so
 *   there is no structure to compare: the weakest match (WEAK evidence).
 */
export type EchoMatch =
  | { kind: "identical-headings" }
  | { kind: "overlapping-headings"; /** Normalized headings the two docs share. */ shared: number }
  | { kind: "title-only" };

/**
 * Compare two doc heading structures. Pure — exported for the context-bloat
 * check, where the engine seam is too coarse.
 *
 * A shared title is always required; with no title match there is no ECHO.
 * Docs sharing only a generic title (e.g. "Setup") are protected from
 * false positives not by a stoplist but structurally: when both docs have
 * headings, those headings must substantially agree. When one side has no
 * headings there is nothing to disagree with, so a same-title match is
 * deliberately still a (WEAK) echo — a headingless stub competing with a
 * real doc is exactly the ambiguity the Chief should be asked about.
 */
export function compareDocStructures(a: DocStructure, b: DocStructure): EchoMatch | null {
  if (a.title === null || b.title === null) return null;
  if (normalizeText(a.title) !== normalizeText(b.title)) return null;

  const headingsA = new Set(a.headings.map(normalizeText));
  const headingsB = new Set(b.headings.map(normalizeText));
  const shared = [...headingsA].filter((h) => headingsB.has(h)).length;

  if (headingsA.size === 0 || headingsB.size === 0) {
    return { kind: "title-only" };
  }

  if (shared === headingsA.size && shared === headingsB.size) {
    return { kind: "identical-headings" };
  }
  // "Substantially overlapping": at least half of each doc's headings also
  // appear in the other. Requiring it of both sides keeps a small doc from
  // echoing every large doc it shares a couple of section names with. This
  // is a structural match predicate inside one detector — not a score or a
  // verdict threshold (ADR-0002); the verdict still comes only from the
  // ordinal confidence the match kind declares.
  if (shared > 0 && shared * 2 >= headingsA.size && shared * 2 >= headingsB.size) {
    return { kind: "overlapping-headings", shared };
  }
  return null;
}

export interface EchoContentMatch {
  matchingBlocks: number;
  containment: number;
}

/** Compare substantive normalized body blocks; headings only nominate, never prove ECHO. */
export function compareDocContent(a: DocStructure, b: DocStructure): EchoContentMatch | null {
  const smaller = a.blocks.length <= b.blocks.length ? a.blocks : b.blocks;
  const larger = a.blocks.length <= b.blocks.length ? b.blocks : a.blocks;
  if (smaller.length === 0) return null;

  const unmatched = new Map<string, number>();
  for (const block of larger) unmatched.set(block, (unmatched.get(block) ?? 0) + 1);
  let matchingBlocks = 0;
  for (const block of smaller) {
    const count = unmatched.get(block) ?? 0;
    if (count > 0) {
      matchingBlocks++;
      unmatched.set(block, count - 1);
    }
  }
  const containment = matchingBlocks / smaller.length;
  return matchingBlocks >= 3 && containment >= 0.8 ? { matchingBlocks, containment } : null;
}

function isDeclaredCopyPair(a: string, b: string, ctx: Parameters<Detector["examine"]>[1]): boolean {
  return ctx.references.copyRelationships.some((copy) =>
    ((copy.canonical === a && copy.derivative === b) || (copy.canonical === b && copy.derivative === a)),
  );
}

export const echoDetector: Detector = {
  label: "ECHO",
  examine(entry, ctx) {
    const own = docStructureOf(ctx.docGraph, entry.path);
    if (own === null) return [];

    const evidence: Evidence[] = [];

    for (const [counterpartPath, other] of allDocStructures(ctx.docGraph)) {
      if (counterpartPath === entry.path) continue;

      if (isDeclaredCopyPair(entry.path, counterpartPath, ctx)) continue;
      if (compareDocStructures(own, other) === null) continue;
      const match = compareDocContent(own, other);
      if (match !== null) evidence.push({
        rule: "substantive-content-overlap",
        confidence: "STRONG",
        rationale: `${match.matchingBlocks} substantive blocks overlap with "${counterpartPath}" (${Math.round(match.containment * 100)}% containment of the smaller document)`,
      });
    }

    return evidence;
  },
};
