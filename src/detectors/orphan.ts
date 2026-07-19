import type { Detector, DetectorContext } from "../detector.js";
import { isNavFile, isReadmeFile } from "../doc-graph.js";
import type { FileEntry } from "../file-index.js";
import { isSensitiveEntry } from "../protections.js";
import type { Evidence } from "../schema.js";

/**
 * The orphan detectors (#5). GHOST — a doc or asset nothing references.
 * RELIC — the same orphan when its path or content carries a sensitive
 * keyword (migration/security/prod/legal/billing): historically valuable,
 * so the sensitive-keyword soft protection always caps it at ASK_CHIEF.
 *
 * "Unreferenced" is one composite STRONG evidence requiring every
 * reference graph to agree (ADR-0002: correlated "nothing points here"
 * signals are a single fact, never double-counted): no inbound links or
 * image references, not in a docs nav, not referenced by any README, not
 * referenced by any agent-context file, not referenced by any
 * package.json script or CI workflow.
 *
 * The two labels split one detection: a sensitive orphan is RELIC and only
 * RELIC — GHOST deliberately stands down so a file is never piled twice
 * for the same fact. Sensitivity here must match the soft protection's
 * notion exactly (the shared `isSensitiveEntry` composite), which is what
 * guarantees every RELIC verdict is capped at ASK_CHIEF, never SAFE.
 *
 * Only docs and assets can be orphans. Agent-context files, READMEs, and
 * nav files are the roots of the reference surface itself — they exist to
 * point at everything else, so nothing pointing at them is the healthy
 * normal state, not orphan evidence. Generated files are DUMP's business.
 */

function hasInboundFromOthers(
  inbound: ReadonlyMap<string, ReadonlySet<string>>,
  entry: FileEntry,
): boolean {
  const sources = inbound.get(entry.path);
  if (sources === undefined) return false;
  // A doc linking to itself proves nothing reaches it from outside.
  return [...sources].some((source) => source !== entry.path);
}

/**
 * The composite unreferenced predicate: evidence only when every reference
 * surface comes up empty. The rationale names each one, so the finding is
 * self-explaining (ADR-0002).
 */
export function unreferencedEvidence(entry: FileEntry, ctx: DetectorContext): Evidence[] {
  if (entry.kind !== "doc" && entry.kind !== "asset") return [];
  if (isReadmeFile(entry.path) || isNavFile(entry.path)) return [];

  const { docGraph, references } = ctx;
  const referenced =
    hasInboundFromOthers(docGraph.inboundLinks, entry) ||
    hasInboundFromOthers(docGraph.inboundImages, entry) ||
    docGraph.navReferenced.has(entry.path) ||
    docGraph.readmeReferenced.has(entry.path) ||
    references.referenced.has(entry.path);
  if (referenced) return [];

  return [
    {
      rule: "unreferenced",
      confidence: "STRONG",
      rationale:
        "no inbound links or image references from any doc, not in a docs nav, " +
        "not referenced by any README, not referenced by any agent-context file, " +
        "not referenced by any package.json script, not referenced by any CI workflow",
    },
  ];
}

/** GHOST — an orphaned doc or asset without sensitive content (see module doc). */
export const ghostDetector: Detector = {
  label: "GHOST",
  examine(entry, ctx) {
    if (isSensitiveEntry(entry.path, ctx.contents)) return []; // RELIC's business
    return unreferencedEvidence(entry, ctx);
  },
};

/** RELIC — an orphaned doc or asset with sensitive content (see module doc). */
export const relicDetector: Detector = {
  label: "RELIC",
  examine(entry, ctx) {
    if (!isSensitiveEntry(entry.path, ctx.contents)) return [];
    return unreferencedEvidence(entry, ctx);
  },
};
