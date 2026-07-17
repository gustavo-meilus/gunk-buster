# Gunk Buster agent skills

The skills teach coding agents when and how to use the deterministic engine. They do not reimplement detectors, verdicts, persistence, or mutation policy.

- [gunk-scan](gunk-scan/SKILL.md) — establish a fresh structural baseline and inspect the pile.
- [gunk-radar](gunk-radar/SKILL.md) — audit claims in docs and agent instructions against repository facts.
- [gunk-trap](gunk-trap/SKILL.md) — recommend Chief-approved CLI mutation commands for judged findings.
- [gunk-restore](gunk-restore/SKILL.md) — recommend byte-identical recovery and verification.

The MCP surface stays read-only. Trap, bust, ask, restore, and fix remain terminal workflows approved by the Chief. See the [safety model](../docs/SAFETY.md).
