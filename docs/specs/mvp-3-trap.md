# MVP 3 — Trap

The safety moat and the first mutation: `gunk trap`, `gunk restore`, `gunk bust`, `gunk ask`, `gunk radar --fix`, `gunk verify`. Vocabulary per `CONTEXT.md`; decisions here are binding — where the `reference/` docs disagree, they are wrong. No silent delete, ever.

## Commands

| Command | Behavior |
| --- | --- |
| `gunk trap <path>` | Moves one scan-judged file to the vault, writes a receipt, runs verify |
| `gunk restore <trap-id \| path>` | Restores a trapped file byte-identically from its receipt, runs verify |
| `gunk restore --batch <batchId>` | Restores every trapped file from one bust/ask run |
| `gunk restore --all` | Restores everything currently trapped (the panic button) |
| `gunk bust safe` | Batch-traps all SAFE-verdict findings behind one Chief confirmation, runs verify |
| `gunk ask` | Walks PROPOSE then ASK_CHIEF findings interactively, runs verify after the session |
| `gunk radar --fix` | Applies radar's suggestion-carrying claim findings behind one Chief confirmation, runs verify |
| `gunk verify` | Standalone: link check, agent-context-refs check, git status, user-configured commands |

`--json` works as in MVP 1/2 on every command except `ask`, which is interactive by definition and errors politely under `--json`. Chief voice by default, `voice: "professional"` to disable. `bust` and `radar --fix` under `--json` refuse to act without `--yes`.

## Trap

### Input contract

`gunk trap <path>` acts only on file findings in the persisted `scan.json` — no finding, no trap ("run `gunk scan` first, Chief"). Protections are enforced in exactly one place: the scan pipeline. Link and claim findings are never trappable — their remedy is an edit.

### Verdict ladder

- **SAFE / PROPOSE** — trappable; single confirmation showing the evidence; `--yes` skips it.
- **ASK_CHIEF** — trappable, but the confirmation is mandatory and states the protection that fired. **No flag bypasses it** — `--yes` does not apply. Agents must surface these to the Chief; that is the moat.
- **KEEP via a keep decision** — refused ("you told me to keep this, Chief"); the remedy is deleting the keep entry.
- **Hard-protected** — never a finding, so never reaches trap (ADR-0001).

### Staleness guard

Scan records a sha256 `contentHash` on every file finding (`scan.json` `schemaVersion` bumps to **2**). At trap time the file is re-hashed; mismatch refuses with "this file changed since I judged it, Chief — re-scan." The same hash is the byte-identical proof for restore. The inbound-link race (a reference added after the scan) is not re-checked — verify's link check catches the damage and restore is one command.

### Git semantics

Gunk Buster never mutates git — no `add`, `rm`, or `commit`. A trap is a pure filesystem move plus a receipt write; the Chief commits. Human output after any mutation ends with the nudge to commit.

- Tracked file with uncommitted changes (disk ≠ HEAD): **refuse** without `--force` — trapping would make the vault the only holder of unversioned bytes.
- Untracked file: trap proceeds with a loud warning.

## Vault

External containment, outside the repo and outside agent reach:

```
<vaultRoot>/traps/<repo-dir-name>/<trap-id>/
├── receipt.json                 ← copy; the in-repo receipt is authoritative
└── <original-relative-path>     ← the file, structure preserved
```

- `vaultRoot` defaults to `../.gunk-buster` resolved from the repo root; the repo's directory name disambiguates (siblings can't collide).
- **Append-only.** Restore copies out; nothing is ever removed from the vault.
- A `vaultRoot` that resolves inside the repo refuses to trap ("a vault inside the repo is just a decoy, Chief").

### Trap identity

One file = one trap-id = one receipt. Trap-id: `<UTC timestamp>-<slug of relative path>`, e.g. `2026-07-11T14-22-05Z-docs-old-plan-md` — sortable, human-readable, collision-free (same batch differs by path; same path differs by timestamp). Receipts from one `bust`/`ask` run share a `batchId`.

## Receipts

`.gunk-buster/receipts/<trap-id>.json` — **git-tracked** (the internal `.gitignore` is updated: `receipts/` and `keeps.json` tracked; `scan.json`/`radar.json` still ignored). Own `schemaVersion` (starts at 1).

```json
{
  "schemaVersion": 1,
  "trapId": "2026-07-11T14-22-05Z-docs-old-plan-md",
  "batchId": "2026-07-11T14-22-05Z-bust",
  "status": "trapped",
  "originalPath": "docs/old-plan.md",
  "vaultPath": "../.gunk-buster/traps/my-app/2026-07-11T14-22-05Z-docs-old-plan-md/docs/old-plan.md",
  "label": "GHOST",
  "verdict": "SAFE",
  "evidence": [
    { "rule": "unreferenced", "confidence": "STRONG", "rationale": "no inbound links, not in nav, not in README, not in any agent-context file, not referenced by package scripts or CI" }
  ],
  "contentHash": "sha256:…",
  "trappedAt": "…",
  "restoreCommand": "gunk restore 2026-07-11T14-22-05Z-docs-old-plan-md"
}
```

No numeric score, ever (ADR-0002). On restore the receipt is kept and flipped: `status: "restored"` plus `restoredAt`. Receipts are the durable audit record; a restored receipt is the seed of a future "Chief overruled" signal (acting on it is not in MVP 3).

## Restore

Byte-identical recovery:

1. Resolve the receipt — by trap-id, by original path (most recent `status: "trapped"` receipt for that path; ambiguity errors listing candidates), `--batch`, or `--all`. The receipt's embedded `restoreCommand` always uses the trap-id form.
2. Hash the vault copy; mismatch against the receipt's `contentHash` is a hard error.
3. Refuse if the original path is occupied by a different file — no overwrite without `--force`.
4. Copy (not move) back to the original path; re-hash the written file; mismatch is a hard error.
5. Flip the receipt to `restored`; run verify.

Restoring an already-restored trap-id is a detected no-op.

## Bust

`gunk bust safe` — `safe` is a required literal argument (`gunk bust` alone errors: "bust what, Chief?"); no other tiers exist in MVP 3. Prints the full list (file, label, one-line evidence), then a single "Trap these N files, Chief? [y/N]". `--yes` pre-approves. Per-file staleness guard applies at execution: hash-mismatched files are skipped with a warning and the rest proceed.

## Ask

Walks **PROPOSE first, then ASK_CHIEF** — the tool proposes, the Chief disposes; easy calls front-loaded. Every item shows its verdict, label, and evidence. Actions: **[t]rap, [k]eep, [s]kip, [q]uit** — skip records nothing; keep writes a keep decision.

## Keep decisions

`.gunk-buster/keeps.json` — git-tracked, tool-owned (the config is read, never written — MVP 1 law). Entries: `{ path, contentHash, decidedAt }`, pinned to content: when the file changes, the decision expires and the finding legitimately resurfaces.

Scan consults it after the verdict function: a finding whose path and current hash match a keep entry is **still emitted**, with verdict `KEEP` and `keptBy: "chief"` — silence hides information; a KEEP row in the pile tells the truth.

## Radar --fix

Applies MVP 2's patch plans. Only claim findings **with a `suggestion`** are fixable; the rest just locate problems (MVP 2 law).

- Requires a persisted `radar.json` (no radar, no fix — same principle as trap's input contract).
- Per-fix staleness guard: the recorded `actual` must still be present at/near the recorded line; otherwise skip with a warning ("re-run radar").
- Batch confirmation like bust: every edit as a mini-diff (`CLAUDE.md:12 — npm install → pnpm install`), one y/N, `--yes` for non-interactive.
- **Targets must be git-clean** (tracked and unmodified); dirty or untracked files are skipped with a warning, `--force` overrides. Git is the only undo for an edit — **no receipts for edits**; receipts are trap records.

## Verify

Closes every mutation (auto-runs after trap, bust, restore, an ask session, and `radar --fix`) and exists standalone.

Checks, in order:

1. **Link check** — the doc graph's broken-link detection.
2. **Agent-context-refs check** — does any agent-context file still reference a trapped path?
3. **Git status** — reported informationally (pending deletions, untracked receipts).
4. **User commands** — `verify.commands` from config, run in order, output captured.

**Delta-focused verdict**: verify fails only on damage attributable to the mutation — any remaining reference (link or agent-context ref) to a just-trapped path, or a user command exiting non-zero. Pre-existing broken links are informational, never failure. Verify answers "did this mutation break anything?", not "is the repo perfect?" — scan answers the latter.

**Exit codes**: non-zero on verify failure (ADR-0005 — a damage signal about the tool's own action, not findings-as-failure; ADR-0004 stands). On failure, human output ends with the exact `gunk restore` command(s) that undo the damage.

## Reporting

`gunk pile` / `gunk report` grow a **TRAPPED** group sourced from receipts with `status: "trapped"` — the same merge pattern as `radar.json`. Each row: original path, the label it was trapped as, trapped date, restore command. Scan findings whose path matches a trapped receipt are dropped from their old group at render time (showing a vaulted file as GHOST would be a lie). Restored receipts don't render — a restored file is just a repo file again; scan re-judges it.

## Config

New blocks (zod, strict, all optional — zero-config still works):

```json
{
  "trap": {
    "vaultRoot": "../.gunk-buster"
  },
  "verify": {
    "commands": []
  }
}
```

Nothing else — receipt location, trap-id format, and the keeps file are the tool's own contract; knobs there create incompatible repos.

## Seams and verification

- **Engine seams**: `trap(repoRoot, path, opts) → Receipt`, `restore(repoRoot, ref, opts) → RestoreResult`, `verify(repoRoot, context) → VerifyResult` — fixture-repo tested (trap → assert vault layout + receipt; restore → assert byte-identity via hash; verify → assert delta-focus against pre-broken fixtures).
- `bust` and `ask` are thin loops over `trap` plus prompting; tested through `trap`'s seam and prompt-free `--yes`/scripted paths.
- Pile/report extended as in MVP 2 — no new view seams.
- Plus the **Context Benchmark** (see ROADMAP) accompanying the milestone demo — this is the milestone where the before/after delta finally includes real removals.

## OUT of MVP 3 (lands later)

- MCP server, skills, plugins, subagents (MVP 4)
- `gunk trap --overrule` for Chief-kept findings
- Scan treating restored receipts as a "Chief overruled" signal
- Additional bust tiers (`bust propose` etc.)
- Vault garbage collection or any vault deletion

## OUT of the product (permanent)

- Silent delete — the default terminal state of gunk is the vault, with a receipt
- Git mutation — Gunk Buster never runs `git add`/`rm`/`commit`
- Code analysis of any kind (ADR-0001)
- Per-file or repo-level numeric scoring (ADR-0002)
- CI mode, findings-as-failure exits (ADR-0004; verify's damage signal is the sole non-zero surface, ADR-0005)
- LLM calls, telemetry, network anything
