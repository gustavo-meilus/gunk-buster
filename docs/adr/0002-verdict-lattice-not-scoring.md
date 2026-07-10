# Verdict lattice instead of numeric scoring

Classification uses typed evidence and a pure verdict function, not weighted scores. Detectors emit evidence with ordinal confidence (CERTAIN / STRONG / WEAK); protections are a separate axis (hard = excluded from candidacy, soft = verdict capped at ASK_CHIEF); an explicit ordered ruleset maps them to SAFE / PROPOSE / ASK_CHIEF / KEEP. There is no per-file score, no repo-level score, and no thresholds anywhere.

We rejected the additive-weights model (e.g. +25 no inbound links, −50 CI ref, bands at 90/70/40) that similar tools use, for three reasons: the weights are indefensible fake precision; correlated signals get double-counted (four "nothing points here" signals are one fact); and adding any new detector shifts the score distribution, silently moving files across thresholds — every extension would force a global recalibration that changes verdicts on repos users already scanned. The lattice extends by adding a detector that declares its own confidence tier; the verdict function never changes, and existing verdicts can only be refined by new evidence, never reshuffled.

## Consequences

- Every finding is self-explaining: "PROPOSE because unreferenced (STRONG); capped by recent-edit protection" — no opaque numbers to interpret.
- Evidence and safety are never summed: a file can be certainly gunk yet still gated behind Chief approval.
- Correlated reference signals collapse into composite predicates (e.g. "unreferenced" requires all reference graphs to agree).
