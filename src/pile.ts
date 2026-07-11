import { z } from "zod";
import {
  claimFindingSchema,
  CLAIM_LABELS,
  fileFindingSchema,
  LABELS,
  linkFindingSchema,
  radarResultSchema,
  scanResultSchema,
  VERDICTS,
  type RadarResult,
  type ScanResult,
  type Verdict,
} from "./schema.js";

/**
 * `gunk pile` — the grouped human view of findings (CONTEXT.md "Pile"), read
 * straight from the persisted scan index, plus the radar index (#13) when
 * one exists. Grouping is generic over whatever labels appear in the
 * combined findings: GHOST/DUMP/ECHO/RELIC (scan) and BAIT/MOLD (radar) all
 * group the same way with no changes here. Link findings have no `label` or
 * `verdict` in the schema, so they collapse into one synthetic "LINK" group
 * with an empty verdict tally; claim findings likewise carry no `verdict`
 * (they live outside the verdict lattice per the radar spec) so they tally
 * empty too, grouped straight under their own BAIT/MOLD label.
 */

export const LINK_GROUP_LABEL = "LINK" as const;

/**
 * Every label a pile group can carry: the scan schema's labels, the
 * synthetic link group, and the radar schema's claim labels. Derived from
 * LABELS/CLAIM_LABELS so a new label added to either schema flows through
 * with no change here.
 */
export const GROUP_LABELS = [...LABELS, LINK_GROUP_LABEL, ...CLAIM_LABELS] as const;

export type GroupLabel = (typeof GROUP_LABELS)[number];

/**
 * Every finding shape a pile group can hold: scan's file/link findings plus
 * radar's claim findings — a disjoint union of all three schemas' object
 * shapes (zod's discriminatedUnion needs the object schemas directly, not
 * scan's and radar's own unions).
 */
export const pileFindingSchema = z.discriminatedUnion("type", [
  fileFindingSchema,
  linkFindingSchema,
  claimFindingSchema,
]);

export type PileFinding = z.infer<typeof pileFindingSchema>;

export const pileGroupSchema = z.object({
  label: z.enum(GROUP_LABELS),
  count: z.int().nonnegative(),
  verdictCounts: z.partialRecord(z.enum(VERDICTS), z.int().nonnegative()),
  findings: z.array(pileFindingSchema),
});

export const pileResultSchema = z.object({
  schemaVersion: z.literal(1),
  scannedAt: scanResultSchema.shape.scannedAt,
  /**
   * The radar index's own `scannedAt`, present only when a radar result was
   * merged in (spec: "the two indexes may be stale independently, each with
   * an honest timestamp" — never backfilled or defaulted to the scan time).
   */
  radarScannedAt: radarResultSchema.shape.scannedAt.optional(),
  repoRoot: z.string(),
  groups: z.array(pileGroupSchema),
});

export type PileGroup = z.infer<typeof pileGroupSchema>;
export type PileResult = z.infer<typeof pileResultSchema>;

function groupKey(finding: PileFinding): GroupLabel {
  return finding.type === "link" ? LINK_GROUP_LABEL : finding.label;
}

function tallyVerdicts(findings: readonly PileFinding[]): Partial<Record<Verdict, number>> {
  const counts: Partial<Record<Verdict, number>> = {};
  for (const finding of findings) {
    if (finding.type !== "file") continue;
    counts[finding.verdict] = (counts[finding.verdict] ?? 0) + 1;
  }
  return counts;
}

/**
 * Pure grouping: by label for file and claim findings, one synthetic group
 * for link findings.
 */
export function groupFindings(findings: readonly PileFinding[]): PileGroup[] {
  const byLabel = new Map<GroupLabel, PileFinding[]>();
  for (const finding of findings) {
    const key = groupKey(finding);
    const existing = byLabel.get(key) ?? [];
    byLabel.set(key, [...existing, finding]);
  }

  return [...byLabel.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, groupFindingsList]) => ({
      label,
      count: groupFindingsList.length,
      verdictCounts: tallyVerdicts(groupFindingsList),
      findings: groupFindingsList,
    }));
}

/**
 * Build the schema-versioned `gunk pile` document from a persisted
 * ScanResult, optionally merging in a persisted RadarResult (#13) — BAIT and
 * MOLD groups appear alongside the scan groups when one is passed. Omitting
 * `radar` reproduces MVP 1 behavior byte-for-byte: no `radarScannedAt`
 * field, and no claim-finding groups.
 */
export function buildPileResult(scan: ScanResult, radar?: RadarResult): PileResult {
  const findings: PileFinding[] = [...scan.findings, ...(radar?.findings ?? [])];
  return pileResultSchema.parse({
    schemaVersion: 1,
    scannedAt: scan.scannedAt,
    ...(radar ? { radarScannedAt: radar.scannedAt } : {}),
    repoRoot: scan.repoRoot,
    groups: groupFindings(findings),
  });
}
