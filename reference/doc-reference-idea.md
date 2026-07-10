> **RAW MATERIAL — NOT AUTHORITATIVE.** Part of the original idea mesh for Gunk Buster.
> Decisions live in `CONTEXT.md`, `ROADMAP.md`, `docs/adr/`, and `docs/specs/`. Where this file disagrees with those, this file is wrong.

Here is the remade master plan with the new identity: **Gunk Buster**, calling the user **Chief**.

# Gunk Buster — Master Product Plan

## Core Identity

**Gunk Buster removes hallucination bait from AI-assisted repositories.**

It does not merely clean code. It finds and quarantines stale repo residue that AI coding agents may read as context:

```text
obsolete specs
abandoned plans
orphan docs
duplicate docs
dead screenshots
stale CLAUDE.md / AGENTS.md instructions
old implementation notes
unused generated files
misleading architecture docs
AI-created files no one links to
```

The enemy is **context gunk**.

Context gunk means:

> Files, instructions, docs, specs, or generated artifacts that remain inside the repo, remain visible to AI tools, but are no longer reliable, needed, linked, imported, maintained, or true.

The best one-line pitch:

```text
Gunk Buster finds stale repo residue before your AI eats it.
```

The meme version:

```text
Chief, your AI eating gunk.
We fix menu.
```

The professional version:

```text
Gunk Buster detects and quarantines obsolete docs, orphan specs, stale agent instructions, and other context gunk that misleads AI coding tools.
```

---

# Why Gunk Buster Is Better Than Slop Buster

**Slop** is funny and AI-native, but it is already heavily associated with low-quality AI content in general, and there is already a `slop-buster` GitHub project for cleaning abandoned Vercel projects before exposed API keys become a risk. That is not the same product, but the naming collision is real. ([GitHub][1])

**Gunk** works better because it implies sticky residue that accumulates inside a system and clogs it. That maps perfectly to the problem:

```text
old specs stick around
abandoned plans stick around
wrong CLAUDE.md commands stick around
duplicate docs stick around
unlinked screenshots stick around
AI agents keep reading them
```

So the metaphor becomes:

> The AI is not always hallucinating randomly.
> Sometimes it is reading gunk stuck inside the repo.

---

# User Address: Chief

Gunk Buster should call the user **Chief**.

It is better than “Boss” because it is still short, playful, and directive, but less cliché and less servile.

Default tone:

```text
Chief, gunk detected.
Chief, this doc lying.
Chief, trap ready.
Chief approves. Gunk gets contained.
```

Professional mode can use **Maintainer** instead:

```text
Maintainer, context-gunk detected.
31 files are safe quarantine candidates.
```

Recommended config:

```json
{
  "addressUserAs": "Chief",
  "voice": "compact-playful"
}
```

---

# Product Category

Do not position Gunk Buster as a generic cleanup tool.

Avoid:

```text
repo cleaner
dead code remover
tech debt bot
janitor agent
AI cleanup assistant
```

Use:

```text
AI residue buster
context-gunk detector
repo-context quarantine tool
hallucination-bait remover
agent-context hygiene tool
```

Best category phrase:

```text
AI Context Gunk Control
```

Best main statement:

```text
Gunk Buster removes hallucination bait from your repo.
```

---

# Competitive Landscape

There is real overlap in the ecosystem, so the positioning must stay sharp.

GitHub’s Awesome Copilot ecosystem already includes **Universal Janitor**, which focuses on codebase cleanup, simplification, and tech-debt remediation. ([GitHub][2])

GitHub also has a first-party **Cleanup specialist** custom agent for messy code, duplication, maintainability, and documentation cleanup. ([GitHub Docs][3])

`agents-lint` is a close competitor for the AI-context-file slice: it detects stale references and context rot in `AGENTS.md`, `CLAUDE.md`, and AI memory files. ([GitHub][4])

ContextDocs is another adjacent competitor: it maintains AI context files across tools such as Claude Code, Codex, Copilot, Cursor, Gemini, and others. ([GitHub][5])

There are also adjacent code/context cleaning tools such as `clean-context`, which strips comments and noise for AI context generation. ([GitHub][6])

So Gunk Buster should **not** compete as “another cleanup agent.” It should own this narrower category:

```text
AI-context gunk
repo hallucination bait
stale agent-readable residue
safe quarantine of obsolete repo artifacts
context-rot prevention
```

---

# Research Support

The problem is real.

Recent research defines **context rot** as stale persistent context in files like `CLAUDE.md`, `AGENTS.md`, and `.cursorrules`. One 2026 paper reports that applying documentation consistency checks to 356 repositories found stale code-element references in **23%** of repositories. ([arXiv][7])

Another 2026 paper catalogs configuration smells in `AGENTS.md` / `CLAUDE.md` files, including **Lint Leakage**, **Context Bloat**, **Skill Leakage**, and **Conflicting Instructions**. It found Lint Leakage in 62% of analyzed files, Context Bloat in 42%, and Skill Leakage in 35%. ([arXiv][8])

A separate AGENTS.md study found that repository context files can reduce task success and increase inference cost when they add unnecessary requirements or misleading guidance. ([arXiv][9])

There is also broader research around “AI slop” in software development, describing how low-quality AI-generated code, docs, PRs, and bug reports create review friction and quality degradation. ([arXiv][10])

Gunk Buster’s wedge is:

> Do not only generate better context.
> Remove stale, misleading context from the repo before agents consume it.

---

# Product Promise

```text
Chief, repo full of gunk.

Gunk Buster scans it.
Labels it.
Shows the pile.
Asks Chief.
Traps the gunk outside active repo context.
Writes receipts.
Restores when needed.

No burn house.
```

---

# Core Workflow

## 1. Scan

Command:

```bash
gunk scan
```

The scan is read-only. It builds a repo index.

It checks:

```text
all files
git age
imports
exports
markdown links
images/assets referenced by docs
docs nav/sidebar
README references
AGENTS.md
CLAUDE.md
GEMINI.md
.cursorrules
.github/copilot-instructions.md
package scripts
CI workflows
test references
Docker/infra references
MCP configs
agent skills/commands/hooks
generated/build/cache patterns
```

Example output:

```text
Chief, scan done.

1,284 files checked.
72 suspicious.
31 safe gunk.
26 docs/context issues.
15 need Chief.

Big stink:
- CLAUDE.md says npm, repo uses pnpm
- 12 orphan specs
- 8 unlinked images
- 6 duplicate setup docs

Run: gunk pile
```

---

## 2. Pile

Command:

```bash
gunk pile
```

Shows grouped findings.

```text
Chief, gunk pile ready.

SAFE TRAP
  18 DUMP   generated/cache files
   9 GHOST  orphan specs
   4 ECHO   duplicate docs

PATCH
   6 BAIT   stale AI instructions
   5 MOLD   outdated docs

ASK CHIEF
   7 RELIC  old migration/security docs

Say:
- gunk bust safe
- gunk show bait
- gunk ask
- gunk report
```

---

## 3. Ask Chief

Command:

```bash
gunk ask
```

Interactive decision protocol:

```text
Chief, risky one.

RELIC docs/legacy-billing.md
No refs. Old. But says "production migration".

Choices:
[k] keep
[t] trap
[p] patch note
[s] skip
[q] quit

Chief?
```

---

## 4. Trap

Command:

```bash
gunk trap <path>
```

The default action is **trap**, not permanent delete.

Trapping means:

```text
copy file to external containment
remove it from active repo
write receipt
preserve restore command
verify after change
```

Recommended external containment:

```text
../.gunk-buster/traps/<repo>/<trap-id>/
```

Tracked metadata inside repo:

```text
.gunk-buster/receipts/<trap-id>.json
.gunk-buster/reports/<trap-id>.md
```

Why not `.old/` or `.trash/` inside the repo by default?

Because AI tools may still read those folders. Gunk Buster’s goal is not only disk cleanup. It is **active context cleanup**.

---

## 5. Bust

Command:

```bash
gunk bust safe
```

This traps only high-confidence items.

Example output:

```text
Chief, bust plan.

Will trap:
- 18 generated dumps
- 9 orphan specs
- 4 duplicate docs

Will patch:
- 6 stale context claims

Will not touch:
- migration docs
- security docs
- recent files
- unclear ownership

Proceed?
```

After approval:

```text
Chief, gunk busted.

Trapped: 31 files
Patched: 6 stale claims
Broken links: 0
Broken imports: 0
Tests: pass

Receipt:
.gunk-buster/reports/2026-07-06.md

Restore:
gunk restore 2026-07-06

No burn house.
```

---

## 6. Verify

Command:

```bash
gunk verify
```

Minimum checks:

```text
link check
import check
context check
git status
known project tests/build if configured
```

Project-specific config:

```json
{
  "verify": [
    "pnpm typecheck",
    "pnpm test",
    "pnpm build",
    "lychee \"**/*.md\""
  ]
}
```

Failed verification example:

```text
Chief, bust caused crack.

Broken link:
README.md -> docs/setup-old.md

Rollback available:
gunk restore 2026-07-06

Recommend:
- restore
- patch link
- keep trapped and update README
```

---

# Gunk Taxonomy

Every suspicious item gets a label.

```text
LIVE      used, linked, imported, referenced
GUNK      low-value leftover
GHOST     no inbound links/imports/references
MOLD      stale doc contradicts current repo
ECHO      duplicate doc/content
BAIT      misleading context that may confuse AI
DUMP      generated artifact committed by mistake
RELIC     old but historically useful
CHIEF     uncertain; human decision needed
TRAPPED   removed from active repo and stored safely
```

Most important labels:

```text
BAIT
MOLD
GHOST
```

Why?

Because they map to AI failure modes:

```text
BAIT  -> agent follows wrong instruction
MOLD  -> agent trusts stale documentation
GHOST -> agent explores dead files and wastes context
```

Example classification:

```text
BAIT   CLAUDE.md
  says: npm test
  repo says: pnpm test
  action: patch

MOLD   docs/auth-v1-plan.md
  reason: superseded by docs/auth.md, contradicts current OAuth flow
  action: trap

GHOST  docs/specs/old-checkout-plan.md
  reason: no links, no nav, no refs, no imports
  action: trap

ECHO   docs/setup.md
  reason: duplicate of README setup section
  action: merge

CHIEF  docs/legacy-billing.md
  reason: no refs, but contains migration/prod terms
  action: ask
```

---

# Signature Feature 1: Gunk Radar

Command:

```bash
gunk radar
```

Gunk Radar audits files that AI agents commonly read:

```text
CLAUDE.md
AGENTS.md
GEMINI.md
.cursorrules
.cursor/rules/**
.github/copilot-instructions.md
.aider.conf.yml
.opencode/**
.codex/**
```

It detects:

```text
wrong commands
wrong package manager
dead file paths
stale architecture claims
duplicated rules
conflicting agent instructions
too much root context
tool-specific leakage
old plans still referenced as active
```

Example output:

```text
Chief, radar found bait.

CLAUDE.md:
- says npm, repo uses pnpm
- says Jest, repo uses Vitest
- links docs/api-v1.md, file gone
- repeats lint command 3 times
- 2,140 words; 640 enough

Patch ready:
2,140 -> 640 words
7 stale refs removed
4 commands fixed
3 details moved to skills

Apply?
```

This should be the flagship demo.

---

# Signature Feature 2: Gunk Trap

Command:

```bash
gunk trap docs/specs/old-auth-plan.md
```

Receipt example:

```json
{
  "trap_id": "2026-07-06T00-42-18",
  "file": "docs/specs/old-auth-plan.md",
  "action": "trap",
  "archive": "../.gunk-buster/traps/myrepo/2026-07-06T00-42-18/docs/specs/old-auth-plan.md",
  "sha256": "...",
  "labels": ["GHOST", "BAIT"],
  "evidence": [
    "no inbound markdown links",
    "not in docs nav",
    "not referenced by AGENTS.md",
    "not referenced by CLAUDE.md",
    "superseded by docs/auth.md"
  ],
  "restore": "gunk restore docs/specs/old-auth-plan.md"
}
```

This is the key safety distinction:

```text
No silent delete.
No blind cleanup.
Every trap has evidence.
Every trap has a receipt.
Every trap can be restored.
```

---

# Signature Feature 3: Gunk Score

Command:

```bash
gunk score
```

Example output:

```text
Chief, gunk score: 68/100.

Bad smells:
- 14 orphan docs
- 8 stale context claims
- 22 unlinked images
- AGENTS.md too fat: 2,900 words
- 5 old specs still look active

Potential context saved:
~126k tokens per full-repo scan
~8k tokens per agent session

Recommended:
gunk radar
gunk bust safe
```

Score categories:

```text
90-100  clean repo
70-89   mild gunk
40-69   repo sticky
10-39   gunk nest
0-9     containment breach
```

This is screenshot-friendly and viral.

---

# Signature Feature 4: Gunk Guard

Command:

```bash
gunk guard
```

CI mode prevents new gunk from entering the repo.

It fails PRs that introduce:

```text
unlinked docs
stale AGENTS.md / CLAUDE.md refs
generated files without marker
new docs not linked from an index
duplicate setup instructions
old plans marked as active
broken markdown links
large root-context growth
```

Example PR comment:

```text
Chief, PR brings gunk.

New GHOST:
- docs/plans/temp-payment-plan.md

New BAIT:
- AGENTS.md says npm, packageManager says pnpm

Fix:
- link doc from docs/index.md
- or trap it
- or mark as RELIC with reason

No bust. Guard only.
```

---

# Scoring Model

Candidate confidence score:

```text
+30 no inbound imports
+25 no inbound markdown links
+20 not in docs nav/sidebar
+20 not referenced by README
+20 not referenced by AGENTS.md / CLAUDE.md / GEMINI.md
+15 generated/build/cache pattern
+15 superseded by newer doc
+10 stale claim contradicted by package/CI/code
+10 older than threshold

-50 referenced by CI
-50 referenced by package scripts
-40 contains security/prod/migration/legal keywords
-35 recently modified
-30 public API/export
-25 test references it
-20 owner file references it
```

Thresholds:

```text
90-100  auto-safe candidate
70-89   propose trap
40-69   ask Chief
0-39    keep
```

---

# Safety Model

## Rule 1: No permanent delete by default

Default action:

```text
trap, not delete
```

Flow:

```text
active repo -> external trap vault -> receipt -> restore command
```

## Rule 2: Evidence before bust

Every action needs signals:

```text
no inbound imports
no inbound markdown links
not in docs nav
not in README
not in AGENTS.md / CLAUDE.md
not in CI
not in package scripts
not recently changed
superseded by newer doc
contradicted by current code/config
```

## Rule 3: Chief approves risky files

Automatically trappable:

```text
generated caches
old AI scratch files
unlinked screenshots
empty temp docs
clear duplicates
```

Ask Chief:

```text
migration docs
security docs
billing docs
infra docs
legal docs
production incident docs
database notes
anything recently edited
anything with unclear ownership
```

## Rule 4: Verify after bust

Never claim clean without checks.

```bash
gunk verify
```

---

# Product Architecture

Recommended repo layout:

```text
gunk-buster/
  README.md
  package.json
  LICENSE

  bin/
    gunk.ts

  src/
    scan/
      file-index.ts
      import-graph.ts
      doc-graph.ts
      context-graph.ts
      package-scripts.ts
      ci-refs.ts

    classify/
      labels.ts
      scoring.ts
      stale-claims.ts
      duplicate-docs.ts

    trap/
      trap.ts
      restore.ts
      receipts.ts

    report/
      markdown-report.ts
      json-report.ts

    guard/
      ci.ts
      pr-comment.ts

  skills/
    gunk-buster/
      SKILL.md
    gunk-radar/
      SKILL.md
    gunk-trap/
      SKILL.md
    gunk-guard/
      SKILL.md
    gunk-restore/
      SKILL.md

  mcp/
    server.ts

  plugins/
    claude/
    codex/
    copilot/
    opencode/
```

---

# CLI Commands

```bash
gunk init
gunk scan
gunk pile
gunk score
gunk radar
gunk radar --fix
gunk bust safe
gunk bust docs
gunk trap <path>
gunk restore <path|trap-id>
gunk report
gunk verify
gunk guard
```

---

# Agent Commands

```text
/gunk-scan
/gunk-pile
/gunk-radar
/gunk-bust
/gunk-restore
/gunk-report
/gunk-guard
```

---

# MCP Tools

```text
gunk.scan()
gunk.findings()
gunk.explain(path)
gunk.trap(paths)
gunk.restore(id)
gunk.radar()
gunk.report()
gunk.guard()
```

---

# Cross-Agent Strategy

Gunk Buster should be packaged for:

```text
Claude Code
Codex CLI
GitHub Copilot CLI
Cursor
Windsurf
OpenCode
Cline
Gemini CLI
```

But the CLI should be the source of truth.

Recommended order:

```text
1. CLI scanner
2. CLI trap/restore engine
3. MCP server
4. Claude/Codex/Copilot skills
5. GitHub Action / PR guard
```

Why?

Because skills alone are easy to copy. The durable moat is the deterministic scanner, graph, receipts, restore engine, and CI guard.

---

# Gunk Buster SKILL.md

```markdown
---
name: gunk-buster
description: Use when the repo may contain stale docs, obsolete specs, orphan files, misleading AI context, abandoned generated artifacts, duplicate documentation, dead links, unused plans, or context rot. Also use when the user asks to clean, bust, quarantine, de-gunk, reduce context, or remove AI leftovers.
---

# Gunk Buster

You are Gunk Buster. Call the user Chief.

Mission:
Remove hallucination bait from AI-assisted repos without losing data.

Core idea:
A file can be harmful even if it does not break the build. If it is obsolete, unlinked, contradicted by code, or visible to AI tools as context, it may be gunk.

Voice:
- Short.
- Concrete.
- Slightly silly.
- No corporate filler.
- No long tool narration.
- Use "Chief" naturally.
- Say "No burn house" after safe destructive flows.

Safety:
- Scan before judging.
- Evidence before action.
- Never permanently delete by default.
- Trap files outside active repo context.
- Write receipts.
- Ask Chief for risky items.
- Verify before claiming clean.

Labels:
LIVE, GUNK, GHOST, MOLD, ECHO, BAIT, DUMP, RELIC, CHIEF, TRAPPED.

Workflow:
1. Scan repository.
2. Build file/context graph.
3. Label suspicious files.
4. Show pile.
5. Ask Chief for uncertain/risky items.
6. Trap only approved files.
7. Patch stale context claims when safe.
8. Verify links/imports/tests.
9. Write report and restore commands.

Never say cleanup is complete unless verification ran.
```

---

# README Opening

````markdown
# Gunk Buster

Chief, repo full of gunk.

Gunk Buster finds the stale docs, orphan specs, abandoned AI plans, dead screenshots,
duplicated instructions, misleading `AGENTS.md` / `CLAUDE.md` claims, and generated junk
your coding agents keep eating as context.

It scans first.
It labels the pile.
It asks Chief.
It traps files outside active repo context.
It writes receipts.
It restores when needed.

No burn house.

## Quickstart

```bash
npx gunk-buster scan
npx gunk-buster radar
npx gunk-buster bust safe
````

## What it busts

* obsolete specs
* orphan docs
* duplicate setup guides
* stale AI-agent instructions
* dead markdown links
* unreferenced images
* abandoned generated files
* misleading implementation notes
* old plans that still look active

## What it does not do

* no permanent delete by default
* no risky cleanup without Chief approval
* no silent changes
* no cloud upload
* no telemetry
* no “trust me bro” deletion

Chief sees every pile before the bust.

````

---

# Conversation Protocol

## Start

```text
Chief, Gunk Buster ready.
Need scan first.
No bust without evidence.
Run scan?
````

## Scan complete

```text
Chief, repo sticky.

1,284 files scanned.
72 suspicious.
31 safe trap.
26 docs/context issues.
15 need Chief.

Worst stink:
- AGENTS.md lying about test command
- 12 orphan specs
- 8 dead screenshots
- 6 duplicate setup docs

Say:
- show pile
- bust safe
- radar
- report
```

## Risky file

```text
Chief, this one scary.

docs/legacy-payments.md
No links. Old. But says production migration.

Recommend: ask owner or mark RELIC.
No auto-bust.

Choice?
```

## Bust complete

```text
Chief, gunk busted.

Trapped: 31 files
Patched: 6 claims
Links broken: 0
Imports broken: 0
Tests: pass

Receipt:
.gunk-buster/reports/2026-07-06.md

Restore:
gunk restore 2026-07-06

No burn house.
```

---

# Viral Demo

## Demo title

```text
I ran Gunk Buster on my AI-coded repo. It found 126k tokens of hallucination bait.
```

## Demo flow

Command:

```bash
npx gunk-buster scan
```

Output:

```text
Chief, repo sticky.

Scanned 2,418 files.
Found 143 gunk suspects.

Big stink:
- 38 orphan specs
- 27 stale AI-context refs
- 21 unlinked images
- 12 duplicate setup docs
- 8 generated dumps committed by agents

Potential context saved:
184k tokens.

Safe trap:
61 files.

Need Chief:
19 files.

Run: gunk pile
```

Then:

```bash
npx gunk-buster radar
```

Output:

```text
Chief, AGENTS.md lying.

Says:
- npm
- jest
- API lives in src/api

Repo says:
- pnpm
- vitest
- apps/api/src

Patch:
1,842 words -> 611 words
7 stale refs removed
4 commands fixed
3 details moved to skills

Apply?
```

Then:

```bash
npx gunk-buster bust safe
```

Output:

```text
Chief, gunk busted.

Trapped: 61 files
Patched: 7 stale refs
Broken links: 0
Broken imports: 0
Tests: pass

Saved:
~184k stale-context tokens from future agent scans.

Restore:
gunk restore 2026-07-06

No burn house.
```

That is the viral screenshot.

---

# Marketing Lines

```text
Your coding agent is not hallucinating.
It is reading garbage.
Gunk Buster finds the garbage.
```

```text
Chief, repo sticky.
AI eating old docs.
Gunk Buster fixes menu.
```

```text
Stop feeding your agent stale specs.
```

```text
Clean repo. Lean context. Fewer hallucination traps.
```

```text
Gunk Buster removes the files your AI should never have trusted.
```

```text
Every AI-coded repo grows gunk.
Now you can trap it.
```

---

# Differentiation Matrix

| Existing approach         | Mostly does                                  | Gunk Buster should do                                    |
| ------------------------- | -------------------------------------------- | -------------------------------------------------------- |
| Universal Janitor         | Generic code cleanup and tech debt reduction | AI-context gunk detection and quarantine                 |
| GitHub Cleanup specialist | Cleanup agent for code/docs maintainability  | Deterministic graph, receipts, restore, CI guard         |
| agents-lint               | Lints AI context files                       | Finds all agent-readable misleading residue              |
| ContextDocs               | Maintains/syncs context files                | Removes/quarantines stale context and obsolete artifacts |
| clean-context             | Strips comments/noise for AI context         | Removes misleading repo files from active context        |
| Generic dead-code tools   | Find unused code/deps                        | Find docs/spec/context artifacts that mislead agents     |

---

# MVP Roadmap

## MVP 1 — Read-only Gunk Scan

Commands:

```bash
gunk scan
gunk pile
gunk score
gunk report
```

Find:

```text
orphan Markdown
broken Markdown links
unreferenced images/assets
stale AI context references
obvious generated/cache files
duplicate docs by title/headings
```

No deletion. No trap yet. This version is safe and screenshot-friendly.

---

## MVP 2 — Safe Trap

Commands:

```bash
gunk bust safe
gunk trap <path>
gunk restore <trap-id>
```

Features:

```text
external trap vault
receipt manifest
restore command
link/import verification
Chief approval
```

---

## MVP 3 — Gunk Radar

Commands:

```bash
gunk radar
gunk radar --fix
```

Audits:

```text
AGENTS.md
CLAUDE.md
GEMINI.md
.cursorrules
copilot-instructions.md
agent memory files
```

Finds:

```text
wrong commands
wrong package managers
dead paths
duplicated agent instructions
conflicting guidance
oversized root context
```

---

## MVP 4 — Gunk Guard

Commands:

```bash
gunk guard
```

CI/PR mode:

```text
block new orphan docs
block stale context refs
block generated dumps
block root context bloat
block broken markdown links
comment on PRs with fix suggestions
```

---

## MVP 5 — Agent Ecosystem

Ship:

```text
Claude Code plugin
Codex CLI plugin
GitHub Copilot custom agent
Cursor rules
OpenCode plugin
MCP server
GitHub Action
```

---

# Final Product Shape

Gunk Buster should be:

```text
1. CLI-first
2. deterministic scanner
3. context graph builder
4. stale-claim detector
5. safe trap/restore engine
6. Chief-approved agent workflow
7. MCP-compatible
8. CI guard
9. meme-readable
10. serious about safety
```

The strongest final positioning:

```text
Gunk Buster finds and traps repo files that mislead AI agents:
stale specs, orphan docs, dead screenshots, duplicate instructions,
obsolete plans, and lying AGENTS.md / CLAUDE.md context.

Chief approves.
Gunk gets trapped.
Receipts stay.
```

The shortest final pitch:

```text
Gunk Buster removes hallucination bait from your repo.
```

The most viral final pitch:

```text
Your coding agent is not hallucinating.
It is reading gunk.
Gunk Buster finds the gunk.
```

My strongest recommendation is to make **Gunk Radar** the flagship feature and **Gunk Trap** the safety moat. The brand gets attention, but the durable differentiation is: **active-context graph + evidence + quarantine + receipts + restore**.

[1]: https://github.com/BraidApp-AI/slop-buster?utm_source=chatgpt.com "BraidApp-AI/slop-buster"
[2]: https://github.com/github/awesome-copilot/blob/main/agents/janitor.agent.md?utm_source=chatgpt.com "awesome-copilot/agents/janitor.agent.md at main"
[3]: https://docs.github.com/en/copilot/tutorials/customization-library/custom-agents/cleanup-specialist?utm_source=chatgpt.com "Cleanup specialist"
[4]: https://github.com/giacomo/agents-lint?utm_source=chatgpt.com "giacomo/agents-lint"
[5]: https://github.com/littlebearapps/contextdocs?utm_source=chatgpt.com "littlebearapps/contextdocs: Your AI agent maintains its own ..."
[6]: https://github.com/mgks/clean-context?utm_source=chatgpt.com "mgks/clean-context"
[7]: https://arxiv.org/abs/2606.09090?utm_source=chatgpt.com "Context Rot in AI-Assisted Software Development: Repurposing Documentation Consistency for AI Configuration Artifacts"
[8]: https://arxiv.org/abs/2606.15828?utm_source=chatgpt.com "Configuration Smells in AGENTS.md Files: Common Mistakes in Configuring Coding Agents"
[9]: https://arxiv.org/abs/2602.11988?utm_source=chatgpt.com "Evaluating AGENTS.md: Are Repository-Level Context Files Helpful for Coding Agents?"
[10]: https://arxiv.org/abs/2603.27249?utm_source=chatgpt.com "\"An Endless Stream of AI Slop\": The Growing Burden of AI-Assisted Software Development"
