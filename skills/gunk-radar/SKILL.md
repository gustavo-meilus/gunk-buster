---
name: gunk-radar
description: Use when auditing agent-context files (AGENTS.md, CLAUDE.md, etc.) or docs for semantic gunk — broken commands, dead paths, claims contradicted by the repo — calls gunk_radar (and previews its fix plan), never applies a fix itself.
---

# gunk-radar: semantic-claim-auditing judgment via `gunk_radar`

`gunk_radar` is the MCP tool for Radar: the semantic audit of docs and
agent-context files — deterministic cross-referencing of claims against repo
facts, never NLU. Reach for it whenever you're auditing AGENTS.md, CLAUDE.md,
README.md, or any doc/agent-context file for content that could mislead an
agent: a wrong command, a dead path, a claim the repo no longer backs up.
`gunk_radar` always recomputes fresh — it never reads or writes
`.gunk-buster/radar.json` — so calling it is safe and free of side effects.

## Calling `gunk_radar`

Input is `{ repoRoot, config?, includeFixPlan? }`. Start with a plain call
(`includeFixPlan` omitted or `false`) to get the `RadarResult` — the claim
findings themselves.

When a claim finding carries a mechanical `suggestion` (a deterministic edit,
not a guess) and you want to preview which findings would be fixed, call
`gunk_radar` again with `includeFixPlan: true`. This returns the `--fix-plan`
checklist (a `FixPlanResult`) **instead of** the `RadarResult` — the two are
a discriminated return, not both at once. Either way it's a pure
computation: no write happens, no matter which shape comes back.

## Applying a fix is CLI/human-approved only

Never call an MCP tool to apply a fix, and never claim to have applied one.
There is no `gunk_fix` MCP tool — this is the same ADR-0006 reasoning as
trap/bust/ask (see the `gunk-trap` skill): the MCP server ships read-only,
and the only way to act on a suggestion-carrying claim finding is the CLI,
run by Chief:

Before recommending the fix, determine whether `gunk` resolves through the
environment's normal command lookup. Use the terminal capability available on
the current platform; do not assume a particular shell. Confirm it with
`gunk --version`.

### CLI available

If `gunk --version` succeeds, use only the stable command:

```
gunk radar --fix
```

### CLI unavailable

If command lookup or `gunk --version` fails, tell Chief that the separately
installed prerequisite is missing. Provide `npm install --global gunk-buster`
and say to retry `gunk --version`; do not install it or present the fix as
currently runnable.

This applies every suggestion-carrying claim finding behind one Chief
confirmation (or `--yes` to pre-approve it), then auto-runs verify. `--force`
overrides an uncommitted-changes guard, same as `trap`.

Your job is to **suggest** that command and name which findings it will act
on (the ones with a `suggestion`) — never to say you've fixed anything
yourself.

## `--fix` needs a persisted radar.json first

`gunk radar --fix` does not recompute Radar — it loads back a **prior**
`gunk radar` run from `.gunk-buster/radar.json`. If that file doesn't exist
yet (no `gunk radar` has been run and persisted in this repo), the CLI
refuses: "no radar, no fix." That refusal is the correct behavior, not a bug
to route around — if you hit it, suggest running `gunk radar` first (which
persists its own index), then `gunk radar --fix`. Don't try to substitute
`gunk_radar` MCP output as a stand-in; the CLI only trusts its own persisted
file.

## Vocabulary (must match CONTEXT.md exactly)

- **Radar**: the semantic audit — deterministic cross-referencing of claims
  against repo facts, never NLU. Distinct from Scan's structural audit.
- **Claim finding**: a line-located finding that a claim in a doc is
  contradicted by a repo fact. Carries evidence, expected/actual, and
  optionally a mechanical `suggestion`. The remedy is an edit, never a trap.
  Claim findings live **outside the verdict lattice** — there's no
  SAFE/PROPOSE/ASK_CHIEF/KEEP here; that vocabulary belongs to Scan's
  findings, not Radar's.
- **BAIT**: agent-context content that misleads — a wrong command, a dead
  path, a false claim.
- **MOLD**: a stale doc whose claims are contradicted by the current repo.
- BAIT and MOLD are Radar's two labels — don't reach for GHOST/DUMP/ECHO/
  RELIC (Scan's labels) when describing a Radar finding.
