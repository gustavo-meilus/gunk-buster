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
  schemaVersion: z.literal(1),
  scannedAt: z.iso.datetime(),
  repoRoot: z.string(),
  counts: z.object({
    byVerdict: z.partialRecord(z.enum(VERDICTS), z.int().nonnegative()),
    byLabel: z.partialRecord(z.enum(LABELS), z.int().nonnegative()),
  }),
  findings: z.array(findingSchema),
});

export type Confidence = (typeof CONFIDENCES)[number];
export type Verdict = (typeof VERDICTS)[number];
export type Label = (typeof LABELS)[number];
export type FileKind = (typeof FILE_KINDS)[number];
export type Evidence = z.infer<typeof evidenceSchema>;
export type FileFinding = z.infer<typeof fileFindingSchema>;
export type LinkFinding = z.infer<typeof linkFindingSchema>;
export type Finding = z.infer<typeof findingSchema>;
export type ScanResult = z.infer<typeof scanResultSchema>;
