import { z } from "zod";
import {
  findingSchema,
  LABELS,
  scanResultSchema,
  VERDICTS,
  type Finding,
  type ScanResult,
  type Verdict,
} from "./schema.js";

/**
 * `gunk pile` — the grouped human view of findings (CONTEXT.md "Pile"), read
 * straight from the persisted scan index. Grouping is generic over whatever
 * labels appear in `findings`: today only DUMP exists, but GHOST/ECHO/RELIC
 * and future link findings (ticket #4) group the same way with no changes
 * here. Link findings have no `label` or `verdict` in the schema yet, so
 * they collapse into one synthetic "LINK" group with an empty verdict tally.
 */

export const LINK_GROUP_LABEL = "LINK" as const;

/**
 * Every label a pile group can carry: the schema's labels plus the synthetic
 * link group. Derived from LABELS so a new label added to the scan schema
 * flows through with no change here.
 */
export const GROUP_LABELS = [...LABELS, LINK_GROUP_LABEL] as const;

export type GroupLabel = (typeof GROUP_LABELS)[number];

export const pileGroupSchema = z.object({
  label: z.enum(GROUP_LABELS),
  count: z.int().nonnegative(),
  verdictCounts: z.partialRecord(z.enum(VERDICTS), z.int().nonnegative()),
  findings: z.array(findingSchema),
});

export const pileResultSchema = z.object({
  schemaVersion: z.literal(1),
  scannedAt: scanResultSchema.shape.scannedAt,
  repoRoot: z.string(),
  groups: z.array(pileGroupSchema),
});

export type PileGroup = z.infer<typeof pileGroupSchema>;
export type PileResult = z.infer<typeof pileResultSchema>;

function groupKey(finding: Finding): GroupLabel {
  return finding.type === "file" ? finding.label : LINK_GROUP_LABEL;
}

function tallyVerdicts(findings: readonly Finding[]): Partial<Record<Verdict, number>> {
  const counts: Partial<Record<Verdict, number>> = {};
  for (const finding of findings) {
    if (finding.type !== "file") continue;
    counts[finding.verdict] = (counts[finding.verdict] ?? 0) + 1;
  }
  return counts;
}

/** Pure grouping: by label for file findings, one synthetic group for link findings. */
export function groupFindings(findings: readonly Finding[]): PileGroup[] {
  const byLabel = new Map<GroupLabel, Finding[]>();
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

/** Build the schema-versioned `gunk pile` document from a persisted ScanResult. */
export function buildPileResult(scan: ScanResult): PileResult {
  return pileResultSchema.parse({
    schemaVersion: 1,
    scannedAt: scan.scannedAt,
    repoRoot: scan.repoRoot,
    groups: groupFindings(scan.findings),
  });
}
