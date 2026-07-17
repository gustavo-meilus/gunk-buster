---
name: gunk-trap
description: Use when Chief wants to trap, bust, or ask about stale files (gunk) that gunk-buster has judged — recommends the exact gunk trap/bust safe/ask CLI command for a finding, never an MCP tool.
---

# gunk-trap: CLI-invocation guidance for mutating gunk findings

`gunk trap`, `gunk bust safe`, and `gunk ask` are the **only** ways to act on a
gunk-buster finding. They are **CLI commands run in a terminal,
approved by the human Chief** — not MCP tools. There is no `gunk_trap`,
`gunk_bust`, or `gunk_ask` MCP tool, and none should ever be invented or
assumed to exist (ADR-0006: the MCP server ships read-only — `scan`, `radar`,
`pile`, `report`, `verify` only — because those three commands are exactly
the human-approved mutation surface, gated by an interactive TTY prompt or an
explicit `--yes` a human types). If you find yourself reaching for a tool
call to trap, bust, or ask on Chief's behalf, stop — suggest the CLI command
instead.

## Confirm the separately installed CLI prerequisite

Before recommending a mutation command, determine whether `gunk` resolves
through the environment's normal command lookup. Use the terminal capability
available on the current platform; do not assume a particular shell. Confirm
the resolved command by running `gunk --version`.

### CLI available

If `gunk --version` succeeds, recommend the stable `gunk trap ...`,
`gunk bust safe`, or `gunk ask` command documented below. Never invoke an
executable through an installation-directory path.

### CLI unavailable

If command lookup or `gunk --version` fails, tell Chief that the separately
installed prerequisite is missing. Give `npm install --global gunk-buster`
and the supported install guide,
`https://github.com/gustavo-meilus/gunk-buster/blob/main/docs/INSTALL.md#cli-from-npm`,
then say to retry `gunk --version`. Do not present trap, bust, or ask as
currently runnable or install anything on Chief's behalf.

Installing the plugin exposes guidance and read-only MCP tools; it does not
install the mutation CLI or change the Chief-approval boundary.

## How you get here

You typically arrive at a specific finding by having just seen it via
`gunk_pile`/`gunk_scan`/`gunk_radar` output (or `gunk pile`/`gunk scan`/`gunk
radar` on the CLI), or because Chief pointed at a path directly. Either way,
before suggesting a command, know which finding(s) you're talking about and
their verdict — SAFE, PROPOSE, or ASK_CHIEF (the verdict ladder; KEEP means
do nothing). Never suggest a mutation command without naming the finding and
verdict behind it.

## Decision guide

- **One specific finding** (a single path Chief is looking at, of any
  verdict) → suggest `gunk trap <path>`. State the path and its verdict.
  Note that ASK_CHIEF's confirmation is always mandatory — `--yes` never
  skips it; SAFE/PROPOSE confirmations can be pre-approved with `--yes`.
- **A batch of SAFE-verdict findings** (several findings all judged SAFE) →
  suggest `gunk bust safe`. Name (or count) the SAFE findings driving the
  suggestion. `bust` only supports the `safe` tier — never suggest `gunk
  bust` for PROPOSE or ASK_CHIEF findings.
- **PROPOSE and/or ASK_CHIEF findings that need a human decision one at a
  time** → suggest `gunk ask`. Make clear this walks PROPOSE findings, then
  ASK_CHIEF findings, interactively — `[t]rap`, `[k]eep`, `[s]kip`, `[q]uit`
  — and that **Chief runs this session personally**; you cannot complete it
  on Chief's behalf.

## Always state the evidence

When you suggest a command, say *why*: which finding (path), which label
(GHOST/DUMP/ECHO/RELIC — informational, describes the kind of gunk) and,
decisively, which verdict (SAFE/PROPOSE/ASK_CHIEF) is driving the choice of
`trap` vs `bust safe` vs `ask`. Don't just emit the command.

## Useful flags (from the real CLI — don't guess others)

- `gunk trap <path>`: `--yes` (skip SAFE/PROPOSE confirmation only), `--force`
  (override an uncommitted-changes guard), `--json` (print the Receipt
  document).
- `gunk bust safe`: `--yes` (pre-approve the one batch confirmation;
  required under `--json`, since there's no TTY to prompt).
- `gunk ask`: no `--json` — it refuses, since it's interactive by
  definition.

All three auto-run `gunk verify` afterward; a `passed: false` there is the
only failure exit not tied to findings themselves.

## Vocabulary (must match CONTEXT.md exactly)

- **Verdict**: SAFE, PROPOSE, ASK_CHIEF, or KEEP — what should happen to a
  finding.
- **Trap**: move a file to the external vault with a tracked receipt — never
  say "delete", "archive", or "trash".
- **Bust**: batch-trap all SAFE-verdict findings behind Chief approval.
- **Ask**: interactive walk of PROPOSE, then ASK_CHIEF findings — trap,
  keep, skip, or quit, one at a time.
- **Chief**: the human owner who approves every risky action — never "the
  user" or "the boss".
- A **label** (GHOST/DUMP/ECHO/RELIC) describes the kind of gunk; a
  **verdict** prescribes the action. Don't confuse the two when explaining a
  suggestion.
