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
  /**
   * Present, and always `"chief"`, when this finding's verdict was
   * overridden to KEEP by a matching keep decision (docs/specs/mvp-3-trap.md
   * "Keep decisions") — distinguishes a Chief ruling from any other reason
   * a finding might carry the KEEP verdict.
   */
  keptBy: z.literal("chief").optional(),
});

export const linkFindingSchema = z.object({
  type: z.literal("link"),
  path: z.string(),
  target: z.string(),
  evidence: z.array(evidenceSchema),
});

export const brokenReferenceFindingSchema = z.object({
  type: z.literal("reference"),
  path: z.string(),
  target: z.string(),
  source: z.string(),
  selector: z.string(),
  line: z.int().positive().optional(),
  evidence: z.array(evidenceSchema),
});

export const referenceDiagnosticSchema = z.object({
  code: z.enum(["source-glob-empty", "malformed-source", "unevaluable-selector", "non-string-match"]),
  source: z.string(),
  path: z.string().optional(),
  selector: z.string().optional(),
  message: z.string(),
});

export const findingSchema = z.discriminatedUnion("type", [
  fileFindingSchema,
  linkFindingSchema,
  brokenReferenceFindingSchema,
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
  diagnostics: z.array(referenceDiagnosticSchema).optional(),
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
  /** SHA-256 of the source document's indexed bytes at Radar time. */
  contentHash: z.string().regex(/^sha256:[0-9a-f]{64}$/).optional(),
  /** ACTIVE findings need remediation; an EXCEPTED claim remains auditable only. */
  disposition: z.enum(["ACTIVE", "EXCEPTED"]).optional(),
  /** Required context for an EXCEPTED finding; absent for active findings. */
  exceptionReason: z.string().min(1).optional(),
});

/** A single Chief-approved exception, scoped to one persisted Radar claim. */
export const claimExceptionSchema = z.object({
  path: z.string(),
  line: z.int().positive(),
  check: z.string(),
  token: z.string().min(1),
  contentHash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  reason: z.string().min(1),
  decidedAt: z.iso.datetime(),
});

export const claimExceptionLedgerSchema = z.object({
  schemaVersion: z.literal(1),
  exceptions: z.array(claimExceptionSchema),
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

/**
 * One Chief keep decision (docs/specs/mvp-3-trap.md "Keep decisions"): a
 * ruling pinned to the file's content at decision time. `scan()` overrides a
 * matching finding's verdict to KEEP only while `contentHash` still matches
 * the file's current bytes — the decision expires when the content changes.
 */
export const keepEntrySchema = z.object({
  path: z.string(),
  contentHash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  decidedAt: z.iso.datetime(),
});

export type KeepEntry = z.infer<typeof keepEntrySchema>;

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

/**
 * One piece of damage attributable to a mutation (docs/specs/mvp-3-trap.md
 * "Verify"): a remaining reference — markdown link or agent-context mention —
 * to a currently trapped path, or a user-configured verify command exiting
 * non-zero. Reference damage carries the exact restore command that undoes it.
 */
export const verifyDamageSchema = z.discriminatedUnion("check", [
  z.object({
    check: z.literal("links"),
    from: z.string(),
    target: z.string(),
    trapId: z.string(),
    restoreCommand: z.string(),
  }),
  z.object({
    check: z.literal("agent-context-refs"),
    from: z.string(),
    target: z.string(),
    trapId: z.string(),
    restoreCommand: z.string(),
  }),
  z.object({
    check: z.literal("commands"),
    command: z.string(),
    exitCode: z.int(),
  }),
]);

/** One `verify.commands` entry's run: always captured, damage only when `exitCode` is non-zero. */
export const verifyCommandRunSchema = z.object({
  command: z.string(),
  exitCode: z.int(),
  output: z.string(),
});

/**
 * The verify contract, schemaVersion 1: the answer to "did this mutation
 * break anything?" — never "is the repo perfect?" (that's scan's question).
 * `passed: false` (= non-empty `damage`) is the sole non-zero exit surface in
 * the whole tool (ADR-0005); everything else here is informational context.
 */
export const verifyResultSchema = z.object({
  schemaVersion: z.literal(1),
  verifiedAt: z.iso.datetime(),
  repoRoot: z.string(),
  passed: z.boolean(),
  damage: z.array(verifyDamageSchema),
  /** Broken links whose target is not a trapped path — pre-existing breakage, never failure. */
  preexistingBrokenLinks: z.array(linkFindingSchema),
  /** `git status --porcelain` lines, informational (pending deletions, untracked receipts). */
  gitStatus: z.array(z.string()),
  commands: z.array(verifyCommandRunSchema),
  /** The exact `gunk restore` command(s) that undo the reference damage, deduped, in damage order. */
  restoreCommands: z.array(z.string()),
});

export type VerifyDamage = z.infer<typeof verifyDamageSchema>;
export type VerifyCommandRun = z.infer<typeof verifyCommandRunSchema>;
export type VerifyResult = z.infer<typeof verifyResultSchema>;

/** One SAFE finding `gunk bust safe` declined to trap — the per-file staleness or git guard fired. */
export const bustSkipSchema = z.object({
  path: z.string(),
  reason: z.string(),
});

/**
 * The bust contract, schemaVersion 1 (docs/specs/mvp-3-trap.md "Bust"): the
 * outcome of one `gunk bust safe` run — every SAFE-verdict finding either
 * trapped (sharing this run's `batchId`) or skipped with the guard's reason.
 * Verify is not embedded here — it runs once, separately, after the batch,
 * same as trap/restore.
 */
export const bustResultSchema = z.object({
  schemaVersion: z.literal(1),
  batchId: z.string(),
  trapped: z.array(trapReceiptSchema),
  skipped: z.array(bustSkipSchema),
});

export type BustSkip = z.infer<typeof bustSkipSchema>;
export type BustResult = z.infer<typeof bustResultSchema>;

/** One suggestion-carrying claim finding `gunk radar --fix` rewrote in place. */
export const fixAppliedSchema = z.object({
  path: z.string(),
  line: z.int().positive(),
  check: z.string(),
  label: z.enum(CLAIM_LABELS),
  replace: z.string(),
  with: z.string(),
});

/** One fix-plan item `gunk radar --fix` declined to apply — the staleness or git guard fired. */
export const fixSkipSchema = z.object({
  path: z.string(),
  line: z.int().positive(),
  reason: z.string(),
});

/**
 * The fix contract, schemaVersion 1 (docs/specs/mvp-3-trap.md "Radar --fix"):
 * the outcome of one `gunk radar --fix` run — every suggestion-carrying claim
 * finding either applied or skipped with the guard's reason. No receipts:
 * git is the only undo for an edit (spec). Verify is not embedded here — it
 * runs once, separately, after the batch, same as bust.
 */
export const fixResultSchema = z.object({
  schemaVersion: z.literal(1),
  applied: z.array(fixAppliedSchema),
  skipped: z.array(fixSkipSchema),
});

export type FixApplied = z.infer<typeof fixAppliedSchema>;
export type FixSkip = z.infer<typeof fixSkipSchema>;
export type FixResult = z.infer<typeof fixResultSchema>;

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
export type BrokenReferenceFinding = z.infer<typeof brokenReferenceFindingSchema>;
export type ReferenceDiagnostic = z.infer<typeof referenceDiagnosticSchema>;
export type Finding = z.infer<typeof findingSchema>;
export type ScanResult = z.infer<typeof scanResultSchema>;
export type Suggestion = z.infer<typeof suggestionSchema>;
export type ClaimFinding = z.infer<typeof claimFindingSchema>;
export type RadarResult = z.infer<typeof radarResultSchema>;
export type ClaimException = z.infer<typeof claimExceptionSchema>;
export type ClaimExceptionLedger = z.infer<typeof claimExceptionLedgerSchema>;
