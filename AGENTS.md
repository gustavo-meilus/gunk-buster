# Gunk Buster

Gunk Buster finds stale repo residue — hallucination bait — before AI coding agents eat it. Deterministic CLI-first tool; agent surfaces (skills, plugins, MCP) are thin shells over the CLI core.

Project status: pre-code. `reference/` holds the raw idea mesh (non-authoritative). Decisions land in `CONTEXT.md`, `ROADMAP.md`, `docs/adr/`, and `docs/specs/` as the spec-driven flow produces them. Work is tracked on GitHub Issues under four MVP milestones (scan → radar → trap → agent ecosystem); the tool is local-only, so there is no guard/CI milestone.

## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues, worked via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` at the repo root plus `docs/adr/`. See `docs/agents/domain.md`.
