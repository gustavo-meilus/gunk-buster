# MVP 4 — Agent ecosystem

Distribution: an MCP server, four skills, and a Claude Code plugin bundling both plus a read-only subagent and an advisory hook. Vocabulary per `CONTEXT.md`; decisions here are binding — where `ROADMAP.md`'s one-paragraph outline is silent, this spec fills it in. The CLI stays the single source of truth; every surface here is a thin shell over the engine already exported from `src/index.ts`. Scope is Claude Code only — Codex and Copilot ports are a follow-up spec.

## Surfaces

| Surface | What it does |
| --- | --- |
| MCP server | Exposes `scan`/`radar`/`pile`/`report`/`verify` as callable tools, read-only only |
| `gunk-scan` skill | Teaches when to call the `scan`/`pile`/`report` tools |
| `gunk-radar` skill | Teaches semantic-claim-audit judgment via the `radar` tool; teaches when to suggest CLI-only `gunk radar --fix` |
| `gunk-trap` skill | CLI-invocation guidance for `trap`, `bust safe`, `ask` — no MCP tools, these are human-approved mutations |
| `gunk-restore` skill | CLI-invocation guidance for `restore`; teaches running the `verify` tool afterward |
| `gunk-auditor` subagent | Prompt-level read-only audit/report profile; its requested tool allowlist is not a security boundary in plugin-loaded Claude Code agents (see #37) |
| Edit/Write hook | Non-blocking `PreToolUse` warning when the target file is flagged stale |
| Claude Code plugin | Bundles all of the above, manifest lives in this repo |

## MCP server

### Tool list

| Tool | Wraps | Input | Output |
| --- | --- | --- | --- |
| `gunk_scan` | `scan()` | repo root (+ config) | scan result JSON |
| `gunk_radar` | `radar()` | repo root (+ config), optional `includeFixPlan` | audit findings; fix-plan preview when requested |
| `gunk_pile` | `buildPileResult()` | repo root (+ config) | grouped findings JSON |
| `gunk_report` | `renderReportMarkdown()` | repo root (+ config) | rendered markdown **string** — no file written |
| `gunk_verify` | `verify()` | repo root, `VerifyContext` | verify result JSON |

Tools are prefixed (`gunk_*`) since a client may have other MCP servers active; bare names like `scan` or `report` are too likely to collide.

`radar`'s `includeFixPlan` returns the same dry-run preview as CLI `--fix-plan` — pure computation, no filesystem write, so it's fair game for a read-only tool even though the mutation it previews (`--fix`) isn't.

### Statelessness (ADR-0007)

Every tool call recomputes fresh in-process. None of them read or write `.gunk/scan.json` / `radar.json` / receipts — the MCP server has zero knowledge of that file layout. This trades repeated compute cost for never handing an agent silently stale data.

### Mutation boundary (ADR-0006)

`trap`, `bust`, `restore`, `ask`, and `radar --fix` are never MCP tools. They stay CLI/human-only until a later spec designs a non-interactive Chief-approval protocol.

### Packaging

Same package, new `bin` entry: `gunk-mcp` → `dist/mcp.js`, built by the existing `tsup` config. No workspace split, no new dependency boundary — the MCP SDK becomes a normal dependency of `gunk-buster`.

## Skills

Four skills, matching ROADMAP's named set exactly — no more, no fewer:

- **`gunk-scan`** — wraps `gunk_scan`/`gunk_pile`/`gunk_report`; teaches "run this early and often to see what's stale."
- **`gunk-radar`** — wraps `gunk_radar` (incl. fix-plan preview); teaches semantic-claim-auditing judgment and when to suggest CLI-only `gunk radar --fix`.
- **`gunk-trap`** — CLI-invocation guidance for `trap`, `bust safe`, `ask`; no MCP tool backs any of these.
- **`gunk-restore`** — CLI-invocation guidance for `restore`; teaches running `gunk_verify` afterward to confirm nothing broke.

`verify` has no standalone skill — it's always guidance nested inside a mutation workflow, never something an agent reaches for unprompted.

## Subagent

`gunk-auditor` requests a tool allowlist of exactly `Read`, `Grep`, `Glob`, plus the 5 MCP tools, and its prompt forbids `Bash`, `Edit`, and `Write`. In plugin-loaded Claude Code agents that allowlist is not currently enforced: #37 records that the auditor could still call mutating tools. Its read-only behavior is therefore a prompt-level contract, not a structural security boundary, until the upstream platform limitation is resolved. The five MCP tools themselves remain structurally non-mutating under ADR-0006. An agent that needs to *suggest* `trap`/`restore` invocations is the main agent's job, per the `gunk-trap`/`gunk-restore` skills — not this subagent's.

## Hook

A `PreToolUse` hook on `Edit`/`Write`:

1. Reads the last **persisted** `.gunk/scan.json`/`radar.json` (no rescan — must stay fast across every edit in a session).
2. If the target file is currently labeled GHOST/RELIC/DUMP, prints an advisory line, e.g. `heads up: gunk-buster flagged this file as stale (GHOST) as of the last scan — verify before relying on it`.
3. Always exits 0 — never blocks the edit.
4. Silently no-ops if no persisted scan exists yet; it never forces a `gunk scan`.

See ADR-0007 for why this reads cached state while the MCP tools never do.

## Claude Code plugin

The plugin manifest lives at the root of this repo (no separate marketplace repo) — same "CLI is the single source of truth" principle as everything else in MVP 4. It bundles the `gunk-mcp` binary, the four skills, the `gunk-auditor` subagent, and the Edit/Write hook as one installable unit via `/plugin marketplace add <this-repo>`.

## Config

No new `gunk.config` blocks. The MCP server and hook consume whatever config and `.gunk/` state already exist (or don't) — nothing here is user-tunable beyond what MVP 1-3 already expose.

## Seams and verification

- **No new engine seam.** The MCP server and hook are pure shells over the functions already exported from `src/index.ts` (`scan`, `radar`, `buildPileResult`, `renderReportMarkdown`, `verify`).
- `gunk-mcp`'s entrypoint is fixture-repo tested: call each tool, assert the JSON/markdown shape and that no `.gunk/` file is read or written.
- The hook script is tested against a fixture `.gunk/scan.json`: warn on a GHOST-labeled edit target, silent on a LIVE target, silent no-op with no persisted scan.
- Plus the **Context Benchmark** accompanying the milestone demo (per ROADMAP) — this is the milestone where the benchmark finally measures an agent's behavior change, not just the tool's output.

## OUT of MVP 4 (lands later)

- Codex and Copilot plugin ports
- Mutating MCP tools / any non-interactive "Chief approves" protocol (ADR-0006)
- Additional subagent profiles beyond `gunk-auditor`
- Additional hook triggers beyond `PreToolUse` on `Edit`/`Write`
- Splitting the MCP server into its own package

## OUT of the product (permanent)

- Silent delete — the vault-plus-receipt contract from MVP 3 still holds; the MCP server can't bypass it because it never gets mutating tools
- Git mutation — Gunk Buster never runs `git add`/`rm`/`commit`
- Code analysis of any kind (ADR-0001)
- Per-file or repo-level numeric scoring (ADR-0002)
- CI mode, findings-as-failure exits, remote/cloud surfaces (ADR-0004)
- LLM calls, telemetry, network anything beyond the MCP stdio transport itself
