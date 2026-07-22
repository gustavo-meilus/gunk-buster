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

**Reference assertion**:
A normalized, provenance-carrying relationship in which one repository source declares a candidate to be in use. Its meaning is independent of the source format or syntax that expressed it.
_Avoid_: reference surface, path mention, graph edge

**Trusted reference source**:
A built-in or Chief-configured repository source authorized to emit reference assertions. Unconfigured files and incidental path-like text are not proof that a candidate is in use.
_Avoid_: auto-discovered manifest, arbitrary mention

**Reference source definition**:
A Chief-authored declaration describing where a custom trusted reference source is found, how it identifies targets, and how those targets are resolved. It contains no executable behavior.
_Avoid_: extractor plugin, discovery script

**Document path reference**:
A path expressed by a document as a claim about repository content. An unanchored path is relative to the containing document; a leading slash anchors it at the repository root.
_Avoid_: always-root-relative path

**Path-shaped token**:
An entire normalized token that conservatively matches a repository path: a clean sequence of path segments with at least one non-numeric segment, no expression or assignment syntax, and an explicit anchor, filename-like extension, or an ancestor directory — other than the token's own resolution base — live in the current repository inventory. A slash alone does not make a token path-shaped.
_Avoid_: slash-containing token

**Current repository inventory**:
The files in the current Git index and the directories those files imply. Historical and untracked paths are outside this inventory and cannot prove that a document path reference is live.
_Avoid_: Git history, worktree inventory

**Copy relationship**:
A Chief-declared relationship from a canonical document to an intentional derivative. It proves the derivative is live and prevents only that declared pair from being classified as ECHO.
_Avoid_: duplicate suppression, copy protection, whitelist

**Explicit path mention**:
A path-shaped token in an unambiguous document structure such as a code span, code block, or path-only table cell. A resolved mention emits a reference assertion; an unresolved mention may be judged by Radar as a dead-path claim.
_Avoid_: prose path, incidental mention

**Claim exception** _(Radar)_:
A Chief decision that one exact claim finding is legitimate, scoped to its document, check, normalized token, stated reason, and approved document content. It remains visible with disposition EXCEPTED but is not actionable, and expires when the document changes.
_Avoid_: inline suppression, check disable, token whitelist

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
One judged item — a labeled file finding, broken-reference finding, or Radar claim finding.

**Broken reference**:
A target declared by a trusted reference source that cannot be resolved in the current repository inventory. It is attributed to the source relationship rather than labeled as file gunk or a Radar claim.
_Avoid_: broken link (except when specifically Markdown), GHOST, dead-path claim

**Label**:
What kind of gunk a file finding is. A label describes the gunk; a verdict prescribes the action.

**LIVE**:
The healthy state: referenced, current content. Never emitted — healthy files produce no finding.

### Labels

**GHOST**:
An orphaned file with no valid inbound reference assertions.

**DUMP**:
A generated artifact committed by mistake (build output, cache, coverage, tool residue).

**ECHO**:
A document whose normalized body content substantially overlaps another document. Similar titles or heading structures alone are not evidence of duplication.

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

**Ask**:
Interactive walk of PROPOSE, then ASK_CHIEF findings — trap, keep, skip, or quit, one at a time.

**Keep decision** _(Trap)_:
A Chief ruling, pinned to a file's content, that a finding is not gunk. Expires when the content changes.
_Avoid_: ignore, suppress, whitelist

**Context Benchmark**:
The before/after measurement: identical prompt in fresh agent sessions, comparing wall-clock time and `/context` token usage pre- and post-gunk-process.
