import type { Confidence, Evidence, Verdict } from "./schema.js";

/**
 * The verdict function (ADR-0002): pure, ordered, unit-testable, and the
 * only place a verdict is decided. Evidence and protections are never
 * summed:
 *
 *   any hard protection        -> EXCLUDED (never shown)
 *   no evidence                -> KEEP
 *   any soft protection        -> capped at ASK_CHIEF
 *   strongest evidence CERTAIN -> SAFE
 *   strongest evidence STRONG  -> PROPOSE
 *   strongest evidence WEAK    -> ASK_CHIEF
 *
 * Adding a detector never touches this function: a new detector just emits
 * evidence with a confidence tier this function already knows how to rank.
 */

/** EXCLUDED is not one of the four schema verdicts — an excluded file never becomes a finding at all. */
export type VerdictOutcome = Verdict | "EXCLUDED";

export interface ProtectionFlags {
  /** Any hard protection applies — excludes the file from candidacy entirely. */
  hard: boolean;
  /** Any soft protection applies — caps the verdict at ASK_CHIEF. */
  soft: boolean;
}

const CONFIDENCE_RANK: Record<Confidence, number> = { WEAK: 0, STRONG: 1, CERTAIN: 2 };

function strongestConfidence(evidence: readonly Evidence[]): Confidence {
  let strongest: Confidence = "WEAK";
  for (const item of evidence) {
    if (CONFIDENCE_RANK[item.confidence] > CONFIDENCE_RANK[strongest]) {
      strongest = item.confidence;
    }
  }
  return strongest;
}

export function computeVerdict(
  evidence: readonly Evidence[],
  protections: ProtectionFlags,
): VerdictOutcome {
  if (protections.hard) return "EXCLUDED";
  if (evidence.length === 0) return "KEEP";
  if (protections.soft) return "ASK_CHIEF";

  switch (strongestConfidence(evidence)) {
    case "CERTAIN":
      return "SAFE";
    case "STRONG":
      return "PROPOSE";
    case "WEAK":
      return "ASK_CHIEF";
  }
}
