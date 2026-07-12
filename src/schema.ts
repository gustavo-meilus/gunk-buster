import { z } from "zod";

/**
 * The scan.json contract, schemaVersion 1. This zod schema is the single
 * source of truth: `ScanResult` and every finding type derive from it, and
 * `scan()` validates its own output against it before returning.
 */

export const CONFIDENCES = ["CERTAIN", "STRONG", "WEAK"] as const;
export const VERDICTS = ["SAFE", "PROPOSE", "ASK_CHIEF", "KEEP"] as const;
export const LABELS = ["GHOST", "DUMP", "ECHO", "RELIC"] as const;
export const FILE_KINDS = ["doc", "asset", "agent-context", "generated"] as const;
/** Claim-finding labels (MVP 2 — radar): BAIT for agent-context, MOLD for ordinary docs. */
export const CLAIM_LABELS = ["BAIT", "MOLD"] as const;

export const evidenceSchema = z.object({
  rule: z.string(),
  confidence: z.enum(CONFIDENCES),
  rationale: z.string(),
});

export const fileFindingSchema = z.object({
  type: z.literal("file"),
  path: z.string(),
  kind: z.enum(FILE_KINDS),
  label: z.enum(LABELS),
  verdict: z.enum(VERDICTS),
  evidence: z.array(evidenceSchema),
  protections: z.array(z.string()),
  /**
   * The staleness anchor for MVP 3 (docs/specs/mvp-3-trap.md): sha256 of the
   * file's raw bytes at scan time, formatted "sha256:<hex>". Trap re-hashes
   * against it, restore proves byte-identity with it, keep decisions pin to
   * it. Link (and any non-file) findings never carry one — they have no
   * bytes of their own to anchor.
   */
  contentHash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
});

export const linkFindingSchema = z.object({
  type: z.literal("link"),
  path: z.string(),
  target: z.string(),
  evidence: z.array(evidenceSchema),
});

export const findingSchema = z.discriminatedUnion("type", [
  fileFindingSchema,
  linkFindingSchema,
]);

export const scanResultSchema = z.object({
  schemaVersion: z.literal(2),
  scannedAt: z.iso.datetime(),
  repoRoot: z.string(),
  counts: z.object({
    byVerdict: z.partialRecord(z.enum(VERDICTS), z.int().nonnegative()),
    byLabel: z.partialRecord(z.enum(LABELS), z.int().nonnegative()),
  }),
  findings: z.array(findingSchema),
});

/**
 * A deterministic in-place rewrite for a claim finding — present only when
 * one exists (e.g. rewriting `npm install` to the repo's true package
 * manager). Findings without a safe rewrite just locate the problem.
 */
export const suggestionSchema = z.object({
  replace: z.string(),
  with: z.string(),
});

/**
 * The claim.json contract's finding type (docs/specs/mvp-2-radar.md): a
 * wrong claim located at a line, whose remedy is an edit rather than a trap.
 * Claim findings live OUTSIDE the verdict lattice — no `verdict` field, and
 * (like link findings) they bypass hard and soft protections entirely: a
 * false claim in a sensitive or recently-edited file is exactly as false.
 */
export const claimFindingSchema = z.object({
  type: z.literal("claim"),
  path: z.string(),
  line: z.int().positive(),
  label: z.enum(CLAIM_LABELS),
  /** The check that produced this finding, e.g. "package-manager-drift". */
  check: z.string(),
  evidence: z.array(evidenceSchema),
  expected: z.string(),
  actual: z.string(),
  suggestion: suggestionSchema.optional(),
});

/**
 * The radar.json contract, schemaVersion 1 — mirrors scanResultSchema but
 * owns its own schema version and counts shape (by claim label, by check
 * name) since claim findings are a disjoint universe from file/link
 * findings. Scan and radar never write each other's files.
 */
export const radarResultSchema = z.object({
  schemaVersion: z.literal(1),
  scannedAt: z.iso.datetime(),
  repoRoot: z.string(),
  counts: z.object({
    byLabel: z.partialRecord(z.enum(CLAIM_LABELS), z.int().nonnegative()),
    byCheck: z.record(z.string(), z.int().nonnegative()),
  }),
  findings: z.array(claimFindingSchema),
});

/** A trap receipt's lifecycle (docs/specs/mvp-3-trap.md): trapped, then restored. Never any other value. */
export const RECEIPT_STATUSES = ["trapped", "restored"] as const;

/**
 * The receipt contract, schemaVersion 1 (docs/specs/mvp-3-trap.md): the
 * durable, git-tracked audit record of one trap. Written twice byte-for-byte
 * — once at `.gunk-buster/receipts/<trapId>.json` (authoritative, tracked)
 * and once alongside the vaulted file (a convenience copy). `evidence` and
 * `contentHash` are carried straight over from the file finding that earned
 * the trap, so the receipt alone (no scan.json needed) proves why a file was
 * trapped and that its bytes are unchanged.
 */
export const trapReceiptSchema = z.object({
  schemaVersion: z.literal(1),
  trapId: z.string(),
  /** Shared by every receipt from one bust/ask run; a standalone `gunk trap` is its own batch of one. */
  batchId: z.string(),
  status: z.enum(RECEIPT_STATUSES),
  originalPath: z.string(),
  /** Repo-relative (forward-slash) path from the repo root to the vaulted copy, e.g. "../.gunk-buster/traps/...". */
  vaultPath: z.string(),
  label: z.enum(LABELS),
  verdict: z.enum(VERDICTS),
  evidence: z.array(evidenceSchema),
  contentHash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  trappedAt: z.iso.datetime(),
  restoreCommand: z.string(),
  restoredAt: z.iso.datetime().optional(),
});

export type ReceiptStatus = (typeof RECEIPT_STATUSES)[number];
export type TrapReceipt = z.infer<typeof trapReceiptSchema>;

export type Confidence = (typeof CONFIDENCES)[number];
export type Verdict = (typeof VERDICTS)[number];
export type Label = (typeof LABELS)[number];
export type FileKind = (typeof FILE_KINDS)[number];
export type ClaimLabel = (typeof CLAIM_LABELS)[number];
export type Evidence = z.infer<typeof evidenceSchema>;
export type FileFinding = z.infer<typeof fileFindingSchema>;
export type LinkFinding = z.infer<typeof linkFindingSchema>;
export type Finding = z.infer<typeof findingSchema>;
export type ScanResult = z.infer<typeof scanResultSchema>;
export type Suggestion = z.infer<typeof suggestionSchema>;
export type ClaimFinding = z.infer<typeof claimFindingSchema>;
export type RadarResult = z.infer<typeof radarResultSchema>;
