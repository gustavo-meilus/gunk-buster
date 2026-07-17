# Gunk Buster

Gunk Buster finds stale repo residue — hallucination bait — before AI coding agents eat it. Deterministic CLI-first tool; agent surfaces (skills, plugins, MCP) are thin shells over the CLI core.

Project status: implemented through the Codex distribution port. The repository contains the TypeScript/Node CLI, deterministic engine, MCP server, skills, Claude Code and Codex plugins, hooks, tests, and built MCP output. `reference/` holds the original idea mesh and remains non-authoritative. Decisions land in `CONTEXT.md`, `ROADMAP.md`, `docs/adr/`, and `docs/specs/`. Work is tracked in GitHub Issues; the tool is local-only, so there is no remote guard/CI product surface.

## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues, worked via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` at the repo root plus `docs/adr/`. See `docs/agents/domain.md`.
