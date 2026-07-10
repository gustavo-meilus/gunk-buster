# Context-only scope — no code analysis, ever

Gunk Buster's candidate universe is permanently limited to agent-readable context: docs, doc-referenced assets, agent-context files, and generated artifacts. It never analyzes code — no import graphs, no dead-code detection, no AST parsing — and code files are hard-protected so no detector can ever mark one as a candidate. We chose this because the product thesis is LLM context optimization and ambiguity reduction, not repo cleanup: dead-code tools (knip, vulture, etc.) already own code analysis, a half-built import graph is the fastest source of trust-killing false positives, and the narrow lane ("AI context safety") is the defensible category positioning.

## Consequences

- MVP 3's `verify` checks links, agent-context refs, and git status only — no import verification, because nothing importable is ever trapped.
- The stack needs no parser infrastructure (no tree-sitter, no per-language AST tooling).
- "Unimported .ts file" is invisible to Gunk Buster by design; we point users at dead-code tools instead.
