---
name: gunk-scan
description: Use when working in a repo gunk-buster covers — reach for gunk_scan, then gunk_pile and/or gunk_report, early and often to see what's currently stale, instead of guessing at repo staleness from file inspection alone.
---

# gunk-scan: reach for the read tools, early and often

`gunk_scan`, `gunk_pile`, and `gunk_report` are MCP tools that judge a repo's
context gunk (stale, agent-readable repo residue) for you. They are **read
tools, gated by `readOnlyHint: true`** — no confirmation needed, no mutation
risk. If you're about to eyeball a repo's docs and guess which ones look
stale, stop — call `gunk_scan` (and then `gunk_pile`/`gunk_report`) instead.
Never substitute your own file inspection for what these tools already
compute.

## The natural sequence

1. **`gunk_scan`** — takes `repoRoot` (required) and an optional `config`
   override; returns the scan result (the structural findings: GHOST/DUMP/
   ECHO/RELIC, each with a verdict). This is your fresh judgment of what's
   currently stale. It **always recomputes in-process on every call** — it
   never reads or writes `.gunk-buster/scan.json` (ADR-0007). There is no
   cache to go stale on you, but there's also no cache to lean on: call it
   again whenever you want current judgment, don't reuse an earlier call's
   output from memory.
2. **`gunk_pile` and/or `gunk_report`** — same inputs (`repoRoot`, optional
   `config`). Both group a fresh scan, a fresh radar pass, and the repo's
   trap receipts into the pile view: findings grouped by label, plus a
   TRAPPED group for anything already trapped. Like `gunk_scan`, both
   recompute fresh every call — neither reads or writes
   `.gunk-buster/scan.json` or `radar.json` (ADR-0007).

`gunk_scan` alone only gives you structural findings; radar's semantic
findings (BAIT/MOLD) and trap receipts only show up once you pile or report.
So the natural sequence is scan first for a quick read, then pile and/or
report when you want the fuller grouped picture.

## pile vs. report

- **`gunk_pile`** returns structured JSON (`structuredContent`, grouped by
  label). Reach for this when you're reasoning programmatically — filtering
  to a label, counting findings, deciding what to suggest next via
  `gunk-trap`.
- **`gunk_report`** returns the same grouped view rendered as a markdown
  string. Reach for this when you want a readable summary to narrate or hand
  to Chief — it's text, not a file. Unlike CLI `gunk report`, it never writes
  `.gunk-buster/reports/report.md`.

Call one, the other, or both — they're cheap, read-only, and freshly
computed each time, so there's no cost to checking both if you want the
structure to reason with and the prose to show.

## Run early and often, not once

These are not a one-time audit you run and then forget. Reach for
`gunk_scan`/`gunk_pile`/`gunk_report`:

- **At the start of working in a repo**, before you've formed any opinion
  about what's stale — establish a real baseline instead of skimming files
  and guessing.
- **Periodically as you make changes**, especially after edits that could
  orphan a doc, duplicate content, or make an agent-context claim go stale.
  Since nothing is cached, the only way to know current staleness is to call
  again.
- **Before suggesting a `gunk-trap` action** (trap/bust safe/ask) — ground
  the suggestion in a fresh finding and verdict, not a memory of an earlier
  pile.

## Vocabulary (must match CONTEXT.md exactly)

- **Scan**: the read-only pass that builds the graphs and produces the
  structural findings.
- **Pile**: the grouped human view of findings, by label, with a TRAPPED
  group.
- **Radar**: the semantic audit — claims in docs/agent-context files
  contradicted by repo facts (BAIT/MOLD).
- **Verdict**: SAFE, PROPOSE, ASK_CHIEF, or KEEP — what should happen to a
  finding; a label (GHOST/DUMP/ECHO/RELIC/BAIT/MOLD) describes the kind of
  gunk, a verdict prescribes the action. Don't confuse the two.
- **Chief**: the human owner who approves every risky action — never "the
  user" or "the boss".
