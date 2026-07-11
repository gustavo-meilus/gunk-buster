# Gunk Buster

Gunk Buster finds and quarantines context gunk — stale, agent-readable repo residue — before AI coding agents consume it. It optimizes LLM context and reduces ambiguity; it never analyzes code.

## Language

### Core

**Context gunk**:
Agent-readable repo content that is no longer reliable, needed, linked, or true.
_Avoid_: mess, clutter, tech debt, slop

**Hallucination bait**:
The marketing phrase for context gunk that actively misleads an agent (BAIT, MOLD).

**Candidate universe**:
The set of files Gunk Buster may ever judge: docs, doc-referenced assets, agent-context files, and generated artifacts. Code files are permanently outside it.

**Agent-context file**:
A file coding agents read as instructions — AGENTS.md, CLAUDE.md, .cursorrules, copilot-instructions, and equivalents.
_Avoid_: memory file, rules file, config file

**Chief**:
The human owner who approves every risky action.
_Avoid_: Boss, Maintainer, user

### Classification

**Detector**:
A self-contained rule that examines a candidate against the scan graphs and emits evidence.

**Evidence**:
A typed observation from a detector: rule, ordinal confidence (CERTAIN / STRONG / WEAK), and rationale.
_Avoid_: signal, score, weight

**Protection**:
A safety fact that overrides evidence. Hard protection excludes a file from candidacy before detection; soft protection caps its verdict at ASK_CHIEF.

**Verdict**:
What should happen to a finding: SAFE, PROPOSE, ASK_CHIEF, or KEEP. Produced by a pure function over evidence and protections.
_Avoid_: score, threshold, confidence band

**Finding**:
One judged item — a labeled file finding or a broken-link finding.

**Label**:
What kind of gunk a file finding is. A label describes the gunk; a verdict prescribes the action.

**LIVE**:
The healthy state: referenced, current content. Never emitted — healthy files produce no finding.

### Labels

**GHOST**:
An orphaned file — no inbound links, not in docs nav, not in README, not referenced by any agent-context file.

**DUMP**:
A generated artifact committed by mistake (build output, cache, coverage, tool residue).

**ECHO**:
A duplicate of another doc.

**RELIC**:
An orphaned file containing sensitive content (migration, security, production, legal) — historically valuable, never auto-trapped.

**BAIT** _(Radar)_:
Agent-context content that misleads — a wrong command, a dead path, a false claim.

**MOLD** _(Radar)_:
A stale doc whose claims are contradicted by the current repo.

**TRAPPED** _(Trap)_:
Moved to the vault with a receipt.

### Workflow

**Scan**:
The read-only pass that builds the graphs and produces the scan index (`.gunk-buster/scan.json`).

**Pile**:
The grouped human view of findings.

**Structural finding / semantic finding**:
Scan finds structural problems (graph facts); Radar finds semantic problems (claims contradicted by the repo).

**Claim finding** _(Radar)_:
A line-located finding that a claim in a doc is contradicted by a repo fact. Carries evidence, expected/actual, and optionally a mechanical suggestion. The remedy is an edit, never a trap — claim findings live outside the verdict lattice and bypass protections.

**Radar**:
The semantic audit of docs and agent-context files — deterministic cross-referencing of claims against repo facts, never NLU.

**Trap**:
Move a file to the external vault, outside the repo and outside agent reach, with a tracked receipt.
_Avoid_: delete, archive, trash, quarantine folder

**Vault**:
The external containment directory (`../.gunk-buster/traps/<repo>/`), never inside the repo.

**Receipt**:
The tracked in-repo record of a trap: evidence, original path, restore command.

**Restore**:
Byte-identical recovery of a trapped file from its receipt.

**Bust**:
Batch-trap all SAFE-verdict findings behind Chief approval.

**Context Benchmark**:
The before/after measurement: identical prompt in fresh agent sessions, comparing wall-clock time and `/context` token usage pre- and post-gunk-process.
