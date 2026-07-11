import type { Detector, DetectorContext } from "./detector.js";
import { isCandidateKind } from "./file-index.js";
import { classifyProtections } from "./protections.js";
import type { Evidence, FileFinding, Label, ScanResult, Verdict } from "./schema.js";
import { computeVerdict } from "./verdict.js";

/**
 * The classification pipeline (ADR-0002): run every detector over every
 * file-index candidate, then decide one verdict per (file, label) pair
 * through the single pure verdict function. Hard-protected files never
 * reach a detector at all — excluded from candidacy up front, exactly as
 * the spec orders it. The caller (the scan) builds the DetectorContext —
 * every scan graph plus config — once; this function stays pure over it.
 */
export function classify(ctx: DetectorContext, detectors: readonly Detector[]): FileFinding[] {
  const findings: FileFinding[] = [];

  for (const entry of ctx.fileIndex) {
    // Code is always hard-protected (ADR-0001) and this is the only place
    // that rule is enforced — classifyProtections below only ever runs on
    // an entry already known to be a candidate kind.
    if (!isCandidateKind(entry.kind)) continue;

    const protections = classifyProtections(entry, ctx.gitIndex, ctx.contents, ctx.config);
    if (protections.hard.length > 0) continue; // excluded from candidacy before detection

    const evidenceByLabel = new Map<Label, Evidence[]>();
    for (const detector of detectors) {
      const evidence = detector.examine(entry, ctx);
      if (evidence.length === 0) continue;
      const existing = evidenceByLabel.get(detector.label) ?? [];
      evidenceByLabel.set(detector.label, [...existing, ...evidence]);
    }

    for (const [label, evidence] of evidenceByLabel) {
      const verdict = computeVerdict(evidence, { hard: false, soft: protections.soft.length > 0 });
      // Hard protection was already ruled out above; KEEP (no evidence) can
      // never happen here either since evidenceByLabel only holds labels
      // with at least one piece of evidence. Both are unreachable in
      // practice — this guard just keeps the types honest.
      if (verdict === "EXCLUDED" || verdict === "KEEP") continue;

      findings.push({
        type: "file",
        path: entry.path,
        kind: entry.kind,
        label,
        verdict,
        evidence,
        protections: protections.soft,
      });
    }
  }

  return findings;
}

/** Tally findings into the scan.json `counts` block. */
export function summarizeCounts(findings: readonly FileFinding[]): ScanResult["counts"] {
  const byVerdict: Partial<Record<Verdict, number>> = {};
  const byLabel: Partial<Record<Label, number>> = {};

  for (const finding of findings) {
    byVerdict[finding.verdict] = (byVerdict[finding.verdict] ?? 0) + 1;
    byLabel[finding.label] = (byLabel[finding.label] ?? 0) + 1;
  }

  return { byVerdict, byLabel };
}
