# Roadmap

Gunk Buster ships in four MVP milestones: **scan → radar → trap → agent ecosystem**. Each milestone is a shippable unit; nothing in a later milestone is a prerequisite for the previous one being useful.

## MVP 1 — Scan

Read-only credibility. `gunk scan` indexes the candidate universe (docs, doc-referenced assets, agent-context files, generated artifacts — never code) into a versioned `.gunk-buster/scan.json`, building six graphs: file index, git index, markdown/doc graph, agent-context graph, package-script refs, and CI refs. Detectors emit typed evidence (CERTAIN / STRONG / WEAK); hard and soft protections plus a pure verdict function classify findings as SAFE / PROPOSE / ASK_CHIEF / KEEP with labels GHOST, DUMP, ECHO, RELIC, alongside broken-link findings. `gunk pile` and `gunk report` render grouped views over the persisted index. Zero-config (reads an optional config file, never writes one), exit code 0 unless the tool itself errors, Chief voice by default with a `voice: "professional"` escape, `--json` on every command. No mutation, no scoring, no token estimates. Full decision set: [docs/specs/mvp-1-scan.md](docs/specs/mvp-1-scan.md).

## MVP 2 — Radar

The flagship. `gunk radar` audits what agents actually read — AGENTS.md, CLAUDE.md, .cursorrules, copilot-instructions, and friends — for *semantic* gunk: commands that don't exist, package-manager drift, paths that are gone, claims contradicted by the repo, duplicated and conflicting instructions, context bloat. Introduces labels BAIT and MOLD. Read-only: it emits findings plus a patch plan, never an applied patch — mutation waits for MVP 3's safety machinery. Full decision set: [docs/specs/mvp-2-radar.md](docs/specs/mvp-2-radar.md).

## MVP 3 — Trap

The safety moat and the first mutation. `gunk trap` moves approved candidates to an external vault (`../.gunk-buster/traps/<repo>/<trap-id>/` — outside the repo, so agents cannot read them), writing tracked receipts that carry the evidence and a restore command. `gunk restore` restores byte-identical files; `gunk bust safe` batch-traps SAFE verdicts behind Chief approval; `gunk ask` walks ASK_CHIEF items interactively; `gunk radar --fix` applies MVP 2's patch plans. `gunk verify` closes every mutation: link check, agent-context-refs check, git status, and optional user-configured commands. Protected files are never trappable. No silent delete, ever. Full decision set: [docs/specs/mvp-3-trap.md](docs/specs/mvp-3-trap.md).

## MVP 4 — Agent ecosystem

Distribution. An MCP server exposes the CLI's operations as deterministic tools; thin skills (gunk-scan, gunk-radar, gunk-trap, gunk-restore) teach agents when to call the engine; plugins ship for Claude Code first, then Codex, then Copilot; subagent profiles are read-only by default; hooks are optional warnings, never load-bearing. The CLI stays the single source of truth — every surface is a shell over it. Full decision set: [docs/specs/mvp-4-agent-ecosystem.md](docs/specs/mvp-4-agent-ecosystem.md).

## MVP 5 — Codex port

Codex distribution. A repository marketplace installs one plugin across Codex CLI, desktop, and IDE, bundling the four skills, five read-only MCP tools, and the non-blocking edit advisory hook. Portable assets are shared with the Claude Code plugin through platform-neutral directories; platform manifests stay thin. Plugin installation requires no manual MCP configuration, while Chief-approved mutations continue to require the separately installed CLI. Windows 11 is the manually certified MVP platform, and a Codex-specific Context Benchmark is part of completion. Full decision set: [docs/specs/mvp-5-codex-port.md](docs/specs/mvp-5-codex-port.md).

## Context Benchmark

The honest metric. Instead of estimating token savings, measure them: in a fresh Claude Code session, ask "explain all that this repo contains", record wall-clock time to completion, then run `/context` and record total context tokens used and thinking effort. Run the gunk process (scan → radar → trap). Repeat the identical prompt in a fresh session and record the same metrics. Report the deltas; repeat runs to smooth session variance. This before/after protocol is manual and accompanies every milestone demo from MVP 1 onward.

## Permanently out of scope

- **Code analysis of any kind** — no import graphs, no dead-code detection, no AST parsing. Code files are hard-protected and can never be candidates ([ADR-0001](docs/adr/0001-context-only-scope.md)). Dead-code tools already own that space.
- **Numeric scoring** — no per-file scores, no repo score, no thresholds. Classification is explicit evidence → verdict ([ADR-0002](docs/adr/0002-verdict-lattice-not-scoring.md)).
- **CI / remote surfaces** — no guard mode, no GitHub Action, no PR comments. The product is local-only ([ADR-0004](docs/adr/0004-local-only.md)). Findings never cause a non-zero exit in any milestone.
- **Built-in telemetry, network calls, cloud anything.** Chief-configured CLI verification commands are ordinary local shell commands and may have their own effects; MCP verification never executes them.
