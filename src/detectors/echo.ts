import type { Detector } from "../detector.js";
import { allDocStructures, docStructureOf, type DocStructure } from "../doc-graph.js";
import type { Evidence } from "../schema.js";

/**
 * ECHO — a duplicate of another doc: competing copies of the same guidance.
 * Detection is title/heading similarity over the doc graph — fuzzy content
 * hashing is explicitly out of MVP 1 scope. Both duplicates are reported
 * (which one survives is MVP 3's business); each finding's evidence
 * rationale names the counterpart path.
 *
 * ECHO evidence is never CERTAIN: content is never compared, and both
 * copies of a pair get the same evidence — a CERTAIN (SAFE) verdict on both
 * would let a later batch trap remove every copy of the guidance at once.
 */

/** Case- and whitespace-insensitive comparison key for titles and headings. */
function normalizeText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * How strongly two same-title docs echo each other:
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
 * Compare two doc structures for duplication. Pure — exported so the
 * similarity rules can be unit-tested directly where the engine seam is too
 * coarse. Returns null when the docs are not duplicates of each other.
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

function evidenceFor(title: string, match: EchoMatch, counterpartPath: string): Evidence {
  switch (match.kind) {
    case "identical-headings":
      return {
        rule: "duplicate-title-and-headings",
        confidence: "STRONG",
        rationale: `same title "${title}" and identical headings as "${counterpartPath}"`,
      };
    case "overlapping-headings":
      return {
        rule: "duplicate-title-overlapping-headings",
        confidence: "STRONG",
        rationale: `same title "${title}" as "${counterpartPath}", sharing ${match.shared} of its headings`,
      };
    case "title-only":
      return {
        rule: "duplicate-title",
        confidence: "WEAK",
        rationale: `same title "${title}" as "${counterpartPath}" (no headings to compare)`,
      };
  }
}

export const echoDetector: Detector = {
  label: "ECHO",
  examine(entry, ctx) {
    const own = docStructureOf(ctx.docGraph, entry.path);
    if (own === null || own.title === null) return [];

    const evidence: Evidence[] = [];

    for (const [counterpartPath, other] of allDocStructures(ctx.docGraph)) {
      if (counterpartPath === entry.path) continue;

      const match = compareDocStructures(own, other);
      if (match !== null) evidence.push(evidenceFor(own.title, match, counterpartPath));
    }

    return evidence;
  },
};
