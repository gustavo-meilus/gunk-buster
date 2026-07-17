---
name: gunk-restore
description: Use when Chief wants a trapped file back — recommends the exact gunk restore CLI form (trap-id, path, --batch, or --all), never an MCP tool, then teaches calling gunk_verify to confirm the restore left nothing broken.
---

# gunk-restore: CLI-invocation guidance for undoing a trap

`gunk restore` is the **only** way to bring a trapped file back. It is a
**CLI command run in a terminal, approved by the human Chief** —
not an MCP tool. There is no `gunk_restore` MCP tool, and none should ever be
invented or assumed to exist (ADR-0006: the MCP server ships read-only —
`scan`, `radar`, `pile`, `report`, `verify` only — because `trap`/`bust`/
`ask`/`restore`/`fix` are the human-approved mutation surface). If you find
yourself reaching for a tool call to restore on Chief's behalf, stop —
suggest the CLI command instead.

## Confirm the separately installed CLI prerequisite

Before recommending a restore command, determine whether `gunk` resolves
through the environment's normal command lookup. Use the terminal capability
available on the current platform; do not assume a particular shell. Confirm
the resolved command by running `gunk --version`.

### CLI available

If `gunk --version` succeeds, recommend the stable `gunk restore ...` command
documented below. Never invoke an executable through an installation-directory
path.

### CLI unavailable

If command lookup or `gunk --version` fails, tell Chief that the separately
installed prerequisite is missing. Give `npm install --global gunk-buster`
and the supported install guide,
`https://github.com/gustavo-meilus/gunk-buster/blob/main/docs/INSTALL.md#cli-from-npm`,
then say to retry `gunk --version`. Do not present restore as currently
runnable or install anything on Chief's behalf.

Installing the plugin exposes guidance and read-only MCP tools; it does not
install the mutation CLI or change the Chief-approval boundary.

Restore is byte-identical recovery of a trapped file from its receipt (the
vault keeps its own copy; nothing is removed from the vault).

## Decision guide

Exactly **one** of these four forms is given per invocation — never combine
them (the CLI throws if zero or more than one is set):

- **A specific trap-id Chief mentioned** (e.g. from a receipt or `gunk pile`'s
  TRAPPED group) → `gunk restore <trap-id>`. Trap-ids look like
  `2026-07-13T10-22-05Z-...`.
- **A specific original path Chief wants back** (they know the file, not the
  trap-id) → `gunk restore <path>`. If more than one trapped receipt matches
  that path, the CLI refuses and lists the candidate trap-ids — restore by
  trap-id instead.
- **Undoing one whole `bust`/`ask` session** → `gunk restore --batch
  <batchId>`. Restores every still-trapped receipt from that one run.
- **Putting everything back** → `gunk restore --all`. The panic button —
  restores everything currently trapped.

`--force` overwrites an occupied original path whose content differs from
the receipt. Without it, a single-target restore (trap-id or path) refuses
outright on an occupied path; a multi-target restore (`--batch`/`--all`)
skips just that receipt (leaving it trapped) and proceeds with the rest —
say so if you expect a conflict, and suggest `--force` (or a solo retry on
that one trap-id) as the follow-up.

## Always state the evidence

Name the trap-id, path, batch-id, or "everything" driving the suggestion —
whichever one Chief pointed at. Don't just emit the command.

## After suggesting or running a restore, call `gunk_verify`

`gunk_verify` is fully read-only and deliberately suppresses the repo's own
`verify.commands`; CLI `gunk verify` runs those configured commands only in
the explicitly invoked terminal workflow. Neither runs the restore itself —
verification only checks the *delta*: did this mutation leave damage behind?
It answers "did the restore break anything?", never "is the repo perfect?"
(that's `gunk_scan`'s job).

Call it with `{ repoRoot }` after a restore and read `passed`:

- `passed: false` is the one failure signal that isn't about ordinary
  findings — something in `damage` needs attention: a broken link or
  agent-context mention still pointing at a path that's *still* trapped
  (relevant for a `--batch`/`--all` restore that skipped an occupied-path
  receipt — that skip is exactly what shows up here as unresolved damage),
  or a non-zero exit from a configured `verify.commands` entry.
- `gitStatus` and `preexistingBrokenLinks` are informational, not failure —
  expect the restored file to show up as a pending change Chief still needs
  to commit (along with the receipt flipped to `restored`).

If `passed: false`, point at the specific `damage` entries and their
`restoreCommand`/skip reason rather than just reporting the boolean.

## Vocabulary (must match CONTEXT.md exactly)

- **Restore**: byte-identical recovery of a trapped file from its receipt —
  never say "undo", "revert", or "recover" alone.
- **Receipt**: the tracked in-repo record of a trap: evidence, original
  path, restore command.
- **Vault**: the external containment directory, never inside the repo —
  restore copies from it, never moves or empties it.
- **Chief**: the human owner who approves every risky action — never "the
  user" or "the boss".
