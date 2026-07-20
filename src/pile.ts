import { z } from "zod";
import {
  claimFindingSchema,
  CLAIM_LABELS,
  fileFindingSchema,
  isActive,
  isExcepted,
  LABELS,
  linkFindingSchema,
  brokenReferenceFindingSchema,
  radarResultSchema,
  scanResultSchema,
  VERDICTS,
  type RadarResult,
  type ScanResult,
  type TrapReceipt,
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
 * The synthetic group receipts with `status: "trapped"` render under
 * (docs/specs/mvp-3-trap.md "Reporting") — a vaulted file is never shown
 * under its old live label (GHOST etc.) again.
 */
export const TRAPPED_GROUP_LABEL = "TRAPPED" as const;

/**
 * Every label a pile group can carry: the scan schema's labels, the
 * synthetic link group, the radar schema's claim labels, and the synthetic
 * trapped group. Derived from LABELS/CLAIM_LABELS so a new label added to
 * either schema flows through with no change here.
 */
export const GROUP_LABELS = [
  ...LABELS,
  LINK_GROUP_LABEL,
  ...CLAIM_LABELS,
  TRAPPED_GROUP_LABEL,
] as const;

export type GroupLabel = (typeof GROUP_LABELS)[number];

/**
 * One trapped receipt's row in the TRAPPED group (spec: "original path, the
 * label it was trapped as, trapped date, restore command") — a view
 * projection of a `TrapReceipt`, not the receipt itself: no verdict,
 * evidence, or vault path, since the pile/report view never needs them.
 */
export const trappedRowSchema = z.object({
  type: z.literal("trapped"),
  path: z.string(),
  label: z.enum(LABELS),
  trappedAt: z.iso.datetime(),
  restoreCommand: z.string(),
});

export type TrappedRow = z.infer<typeof trappedRowSchema>;

/**
 * Every finding shape a pile group can hold: scan's file/link findings,
 * radar's claim findings, and receipts' trapped rows — a disjoint union of
 * all four schemas' object shapes (zod's discriminatedUnion needs the object
 * schemas directly, not scan's and radar's own unions).
 */
export const pileFindingSchema = z.discriminatedUnion("type", [
  fileFindingSchema,
  linkFindingSchema,
  brokenReferenceFindingSchema,
  claimFindingSchema,
  trappedRowSchema,
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
  /** Visible audit rows that are intentionally excluded from active remediation groups. */
  excepted: z.array(claimFindingSchema).optional(),
});

export type PileGroup = z.infer<typeof pileGroupSchema>;
export type PileResult = z.infer<typeof pileResultSchema>;

function groupKey(finding: PileFinding): GroupLabel {
  if (finding.type === "link" || finding.type === "reference") return LINK_GROUP_LABEL;
  if (finding.type === "trapped") return TRAPPED_GROUP_LABEL;
  return finding.label;
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
 * Merge a scan (plus optional radar, plus optional receipts) into the flat
 * list of findings pile/report both group and render (spec "Reporting", same
 * merge pattern as the radar index): scan findings whose path matches a
 * `status: "trapped"` receipt are dropped (a vaulted file is never shown
 * under its old live label — "showing it as GHOST would be a lie"), then a
 * trapped row is appended per trapped receipt. `status: "restored"` receipts
 * never render — a restored file is just a repo file again, and scan
 * re-judges it. Shared by `buildPileResult` and `renderReportMarkdown` so
 * both views merge identically with no separate view seam.
 */
export function mergeFindings(
  scan: ScanResult,
  radar?: RadarResult,
  receipts?: readonly TrapReceipt[],
): PileFinding[] {
  const trapped = (receipts ?? []).filter((r) => r.status === "trapped");
  const trappedPaths = new Set(trapped.map((r) => r.originalPath));
  const liveScanFindings = scan.findings.filter((f) => !trappedPaths.has(f.path));
  const trappedRows: TrappedRow[] = trapped.map((r) => ({
    type: "trapped",
    path: r.originalPath,
    label: r.label,
    trappedAt: r.trappedAt,
    restoreCommand: r.restoreCommand,
  }));
  return [
    ...liveScanFindings,
    ...(radar?.findings.filter(isActive) ?? []),
    ...trappedRows,
  ];
}

/**
 * Build the schema-versioned `gunk pile` document from a persisted
 * ScanResult, optionally merging in a persisted RadarResult (#13) and the
 * repo's trap receipts (#23) — BAIT/MOLD and TRAPPED groups appear alongside
 * the scan groups when passed. Omitting `radar` reproduces MVP 1 behavior
 * byte-for-byte: no `radarScannedAt` field, and no claim-finding groups.
 * Omitting `receipts` (or passing none with `status: "trapped"`) means no
 * TRAPPED group and no scan findings dropped.
 */
export function buildPileResult(
  scan: ScanResult,
  radar?: RadarResult,
  receipts?: readonly TrapReceipt[],
): PileResult {
  return pileResultSchema.parse({
    schemaVersion: 1,
    scannedAt: scan.scannedAt,
    ...(radar ? { radarScannedAt: radar.scannedAt } : {}),
    repoRoot: scan.repoRoot,
    groups: groupFindings(mergeFindings(scan, radar, receipts)),
    ...(radar
      ? { excepted: radar.findings.filter(isExcepted) }
      : {}),
  });
}
