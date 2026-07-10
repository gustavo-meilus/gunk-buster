> **RAW MATERIAL — NOT AUTHORITATIVE.** Part of the original idea mesh for Gunk Buster.
> Decisions live in `CONTEXT.md`, `ROADMAP.md`, `docs/adr/`, and `docs/specs/`. Where this file disagrees with those, this file is wrong.

Chief, I read the current platform docs, the reference repos, the uploaded schema, and the competitive landscape. The best version of this product is **not** “another skill pack.” It should be a **deterministic CLI-first repo-context hygiene tool** with skills, subagents, MCP, hooks, and plugins as distribution surfaces.

The product should be:

# Gunk Buster

**One-line pitch:**
**Gunk Buster finds stale repo residue before your AI eats it.**

**Category:**
**AI Context Gunk Control** — a repo hygiene layer for files, docs, plans, agent instructions, generated artifacts, stale specs, and AI-readable residue that misleads coding agents.

**Core positioning:**
Most cleanup tools remove “mess.” Gunk Buster removes **hallucination bait**: stale instructions, dead docs, obsolete specs, old plans, broken agent files, duplicate guidance, abandoned generated artifacts, and misleading context that AI coding tools still read.

---

## 1. What the current AI coding platforms teach us

### Claude Code

Claude Code is currently the strongest platform for this kind of product because its extensibility model already includes **skills, plugins, subagents, hooks, MCP servers, and custom slash commands**. Claude Code skills are directories with a `SKILL.md`; the skill body is only loaded when needed, and Claude’s implementation adds invocation control, subagent execution, and dynamic context on top of the open Agent Skills format. ([Claude][1])

Claude Code plugins are the right package layer for a “Gunk Buster” ecosystem because a plugin can bundle skills, commands, hooks, subagents, and MCP server configuration. The official guidance also explicitly frames plugins as the next step after project instructions, skills, MCP, subagents, and hooks. ([Claude][2])

Claude subagents are especially relevant: they have their own context window, custom system prompt, tool access, permissions, and can preserve the main conversation context while doing specialized work. Claude’s built-in Explore and Plan agents are read-only and isolated, which maps perfectly to Gunk Buster’s “scan before bust” philosophy. ([Claude][3])

### Codex CLI

Codex CLI should be treated as a first-class target. It reads layered `AGENTS.md` files from global, repo, and nested directories, with closer files taking precedence. That means Gunk Buster must inspect not only `AGENTS.md`, but also instruction layering conflicts and stale local overrides. ([OpenAI Desenvolvedores][4])

Codex now also supports skills using the Agent Skills pattern: a skill folder contains `SKILL.md` plus optional scripts, references, assets, agents, and `openai.yaml`; only metadata is initially loaded, and the full skill is loaded when invoked or inferred. Codex plugins can bundle skills, apps, MCP servers, and hooks, while Codex subagents are available but explicitly spawned. ([OpenAI Desenvolvedores][5])

### GitHub Copilot CLI

Copilot CLI is also a strong target because it already reads multiple instruction surfaces: global Copilot instructions, repo `.github/copilot-instructions.md`, `.github/instructions/**/*.instructions.md`, `AGENTS.md`, `Copilot.md`, `GEMINI.md`, and `CODEX.md`. Repo instructions take precedence, so stale repo-local instructions are high-risk gunk. ([GitHub Docs][6])

Copilot supports skills as folders with `SKILL.md` in locations like `.github/skills`, `.claude/skills`, `.agents/skills`, and personal skill directories. It also supports custom agents that run in separate subagent context windows, and plugins that can package agents, skills, hooks, MCP configs, and integrations. ([GitHub Docs][7])

### Open Agent Skills standard

The shared pattern across these tools is clear: **a skill is a small folder with `SKILL.md`, metadata, instructions, and optional resources/scripts**. The major design principle is progressive disclosure: only short metadata is loaded first, the full `SKILL.md` loads when activated, and larger resources load only when needed. ([Agent Skills][8])

That means Gunk Buster should ship both:

1. **A deterministic CLI/MCP engine** that does the real scanning, scoring, trapping, restoring, and verifying.
2. **Thin skills/plugins/subagents** that teach Claude, Codex, Copilot, and other agents how to call the engine safely.

---

## 2. What to borrow from the reference repos

### `obra/superpowers`

Superpowers’ core lesson is that the viral product is not just a tool; it is a **methodology**. It packages a complete agentic software-development workflow: brainstorm, spec, plan, TDD, subagent-driven execution, code review, and finishing the branch. Its README emphasizes composable skills, automatic skill triggering, and subagent-driven development. ([GitHub][9])

**Borrow:**
Gunk Buster should not just say “run cleanup.” It should define a ritual:

> Scan → Pile → Ask Chief → Trap → Verify → Report → Guard

This makes it memorable, safe, and agent-friendly.

### `JuliusBrussee/caveman`

Caveman’s strength is an instantly understandable behavioral contract: **reduce output tokens without reducing technical accuracy**. It is viral because it has a silly persona, a measurable promise, broad agent support, and honest limitations. Its repo says it “shrinks answer, not brain,” preserves code/commands/errors byte-for-byte, and reports major output-token reductions while warning that input tokens and reasoning tokens are unaffected. ([GitHub][10])

**Borrow:**
Gunk Buster needs a tiny persona protocol:

> “Chief, found gunk. Not deleting. Trapping with receipt.”

And it needs measurable outcomes:

* Gunk Score
* AI Context Risk
* Estimated token savings
* Number of stale agent files
* Number of hallucination-bait files
* Trap receipts generated
* Restore confidence

### `DietrichGebert/ponytail`

Ponytail’s strength is opinionated minimalism. It sells the fantasy of a lazy senior engineer who writes less code and removes unnecessary complexity. The repo packages the concept across Claude, Codex, Copilot CLI, Cursor, OpenCode, Gemini, and others. ([GitHub][11])

**Borrow:**
Gunk Buster should be opinionated and funny, but not childish. The persona should be:

> A gruff repo custodian who protects the Chief from AI eating old garbage.

### `mattpocock/skills`

Matt Pocock’s skills repo is the strongest reference for practical skill design. It emphasizes small, composable, engineering-specific skills and includes a `write-a-skill` skill that creates new Agent Skills using proper structure, progressive disclosure, bundled references, and scripts. It also stresses that the skill description is the key trigger surface the agent sees before loading the skill. ([GitHub][12])

**Borrow:**
Each Gunk Buster skill should be narrow, triggerable, and composable:

* `gunk-scan`
* `gunk-radar`
* `gunk-trap`
* `gunk-restore`
* `gunk-guard`
* `gunk-report`

Do not create one giant bloated skill.

---

## 3. Competitive landscape and originality

There are related projects, but none appear to own the exact product category.

Known adjacent ideas include general repo cleanup agents, dead-code cleanup, tech-debt cleanup, stale instruction linting, and AI context-file auditing. For example, `agents-lint` focuses on stale references and context rot in `AGENTS.md`, `CLAUDE.md`, and AI memory files, while “Universal Janitor” and GitHub cleanup agents focus more broadly on messy code, duplication, and maintainability. ([GitHub][13])

Recent research also supports the problem space: AGENTS-style files can suffer from context bloat, lint leakage, skill leakage, conflicting instructions, and extra inference cost when context is poorly maintained. ([arXiv][14])

So the originality angle is:

> **Gunk Buster is not a code cleaner. It is an AI-context safety tool for repo residue.**

That category is stronger than “repo cleanup.”

---

# 4. Product definition

## Gunk taxonomy

Use the taxonomy from your schema, but make three labels central:

| Label       | Meaning                                           | Product use              |
| ----------- | ------------------------------------------------- | ------------------------ |
| **BAIT**    | Misleading AI-readable content                    | Highest marketing value  |
| **MOLD**    | Stale but plausible docs/specs/instructions       | Common everyday gunk     |
| **GHOST**   | Orphaned files with no current references         | Safe cleanup candidate   |
| **ECHO**    | Duplicate or superseded guidance                  | Good for docs cleanup    |
| **DUMP**    | Generated/cache/export residue                    | Usually safe to trap     |
| **RELIC**   | Old artifact that may still have historical value | Ask Chief                |
| **LIVE**    | Referenced/active/current                         | Never trap automatically |
| **TRAPPED** | Moved to external vault with receipt              | Safe containment state   |

## Core workflow

```txt
gunk scan
  ↓
gunk pile
  ↓
gunk ask
  ↓
gunk trap <path>
  ↓
gunk verify
  ↓
gunk report
  ↓
gunk guard
```

The default UX should always be safety-first:

```txt
Chief, found 18 gunk candidates.

9 BAIT  - stale AI-readable instructions
5 MOLD  - outdated docs/specs
3 GHOST - unreferenced files
1 DUMP  - generated artifact

Nothing deleted. Want a safe trap plan?
```

## Non-negotiable safety rule

**Gunk Buster must never delete by default.**

Default action is **trap**, not delete.

Trap vault:

```txt
../.gunk-buster/traps/<repo>/<trap-id>/
```

In-repo receipts:

```txt
.gunk-buster/receipts/*.json
.gunk-buster/reports/*.md
```

Why external vault? Because keeping `.old`, `.trash`, `archive`, or `deprecated` folders inside the repo can still expose obsolete context to AI agents. That is the key product insight.

---

# 5. Technical architecture

## Recommended stack

Use **TypeScript + Node.js + pnpm** for the first version.

Reason: the references you gave are skill/plugin/CLI ecosystems where Node-based installation and `npx` usage are culturally natural. Caveman, Ponytail, Superpowers, and Matt Pocock’s skills all lean into easy CLI/plugin installation patterns. ([GitHub][10])

## Repo layout

```txt
gunk-buster/
  package.json
  pnpm-lock.yaml
  tsconfig.json
  vitest.config.ts

  bin/
    gunk.ts

  src/
    cli/
      commands/
        init.ts
        scan.ts
        pile.ts
        score.ts
        radar.ts
        trap.ts
        restore.ts
        verify.ts
        report.ts
        guard.ts

    scan/
      file-index.ts
      git-index.ts
      import-graph.ts
      doc-graph.ts
      context-graph.ts
      package-scripts.ts
      ci-refs.ts
      generated-patterns.ts

    classify/
      scoring.ts
      labels.ts
      explain.ts
      confidence.ts

    radar/
      context-files.ts
      stale-commands.ts
      stale-paths.ts
      conflicting-instructions.ts
      duplicated-rules.ts
      package-manager-drift.ts

    trap/
      vault.ts
      receipt.ts
      restore.ts
      manifest.ts

    verify/
      links.ts
      imports.ts
      package-scripts.ts
      git-status.ts
      project-checks.ts

    report/
      markdown.ts
      json.ts
      pr-comment.ts

    mcp/
      server.ts
      tools.ts

    config/
      schema.ts
      defaults.ts

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

  plugins/
    claude/
      plugin.json
      skills/
      agents/
      hooks/
    codex/
      plugin.json
      skills/
      hooks/
      mcp/
    copilot/
      plugin.json
      agents/
      skills/
      hooks.json
      .mcp.json

  github-action/
    action.yml

  fixtures/
    stale-agent-files/
    orphan-docs/
    generated-dumps/
    package-manager-drift/
    false-positive-protected-files/

  tests/
    unit/
    integration/
    e2e/
    evals/
```

---

# 6. Scanner design

## `gunk scan`

Build a read-only index:

```ts
type FileRecord = {
  path: string
  sizeBytes: number
  extension: string
  kind: "code" | "doc" | "agent-context" | "config" | "generated" | "asset" | "unknown"
  lastModified?: string
  gitLastTouched?: string
  inboundImports: string[]
  inboundLinks: string[]
  outboundLinks: string[]
  packageScriptRefs: string[]
  ciRefs: string[]
  contextRefs: string[]
  navRefs: string[]
  generatedSignals: string[]
}
```

## Graphs to build

1. **File index** — all files, sizes, extensions, ignore rules.
2. **Git index** — last touched date, rename clues, churn.
3. **Import graph** — JS/TS/Python/Go/Rust first, expandable later.
4. **Markdown graph** — links, images, docs nav, README references.
5. **Context graph** — `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `CODEX.md`, `.github/copilot-instructions.md`, `.cursor/rules`, `.cursorrules`, `.aider.conf.yml`, `.opencode`, `.codex`, etc.
6. **Package graph** — package manager, scripts, framework, test runner.
7. **CI graph** — GitHub Actions, workflows, deploy scripts.
8. **Generated-artifact detection** — reports, screenshots, coverage, build outputs, old AI outputs.

---

# 7. Gunk scoring

Use your schema’s scoring model, but expose it in explainable form.

```txt
Score: 87 / 100
Label: MOLD
Confidence: high

Why:
+25 no inbound markdown links
+20 not in docs nav/sidebar
+15 superseded by newer doc
+10 stale claim contradicted by package.json
+10 older than threshold
-10 referenced by README once

Recommendation:
Trap, do not delete.
```

## Thresholds

|  Score | Action                   |
| -----: | ------------------------ |
| 90–100 | Auto-safe trap candidate |
|  70–89 | Propose trap             |
|  40–69 | Ask Chief                |
|   0–39 | Keep                     |

## Protected files

Never auto-trap:

```txt
LICENSE
SECURITY.md
CODEOWNERS
package.json
pnpm-lock.yaml
package-lock.json
yarn.lock
Cargo.toml
go.mod
pyproject.toml
Dockerfile
docker-compose.yml
.github/workflows/*
migrations/*
infra/*
terraform/*
ansible/*
docs/api/*
```

---

# 8. Gunk Radar

This is the killer feature.

## `gunk radar`

Purpose:

> Audit files that coding agents read before they act.

Target files:

```txt
AGENTS.md
CLAUDE.md
GEMINI.md
CODEX.md
Copilot.md
.github/copilot-instructions.md
.github/instructions/**/*.instructions.md
.cursor/rules/**
.cursorrules
.aider.conf.yml
.opencode/**
.codex/**
.claude/**
.agents/**
```

Checks:

| Check                   | Example finding                                        |
| ----------------------- | ------------------------------------------------------ |
| Wrong package manager   | `CLAUDE.md says npm, repo uses pnpm`                   |
| Dead path               | `AGENTS.md references src/legacy/auth.ts, missing`     |
| Stale architecture      | `docs say Express, package shows Fastify`              |
| Dead command            | `README says npm test, package has pnpm test:e2e`      |
| Conflicting instruction | `AGENTS.md says no tests, CLAUDE.md says TDD required` |
| Context bloat           | `CLAUDE.md is 9,000+ words and duplicates README`      |
| Tool leakage            | `Copilot instructions mention Cursor-only commands`    |
| Old plan bait           | `docs/plans/2024-rewrite.md still says “current plan”` |

This is where Gunk Buster becomes more original than a generic cleanup CLI.

---

# 9. Trap and restore design

## `gunk trap <path>`

Behavior:

1. Move file to external trap vault.
2. Preserve original path.
3. Preserve metadata.
4. Write receipt.
5. Update report.
6. Never rewrite source files unless explicitly requested.
7. Run verify.

Receipt example:

```json
{
  "trapId": "2026-07-06T21-44-12Z-auth-docs",
  "repo": "my-app",
  "originalPath": "docs/old-auth-plan.md",
  "vaultPath": "../.gunk-buster/traps/my-app/2026-07-06T21-44-12Z-auth-docs/docs/old-auth-plan.md",
  "label": "MOLD",
  "score": 84,
  "reason": [
    "No inbound links",
    "Superseded by docs/auth.md",
    "References deleted src/auth-old.ts"
  ],
  "checksBefore": {
    "gitClean": true,
    "imports": "pass",
    "links": "pass"
  },
  "checksAfter": {
    "imports": "pass",
    "links": "pass"
  }
}
```

## `gunk restore <trap-id>`

Must restore exactly, then run verification.

```txt
Chief, restored docs/old-auth-plan.md from trap.
Receipt preserved.
Verification clean.
```

---

# 10. MCP tools

Expose deterministic tools so agents do not improvise destructive shell commands.

```ts
gunk.scan()
gunk.findings()
gunk.explain({ path })
gunk.radar()
gunk.trap({ paths })
gunk.restore({ trapId })
gunk.report()
gunk.guard()
```

This lets Claude, Codex, and Copilot call Gunk Buster as a tool rather than guessing how to move files. Codex and Copilot both document MCP as a way to connect models to external tools and integrations. ([OpenAI Desenvolvedores][15])

---

# 11. Skills and agents

## Skill package strategy

Ship separate skills:

```txt
gunk-buster   - Main workflow
gunk-radar    - Audit AI-readable context files
gunk-trap     - Safely contain gunk
gunk-restore  - Restore trapped files
gunk-guard    - CI/PR enforcement
gunk-report   - Summarize cleanup impact
```

Each skill should be small. The description must front-load its trigger because platforms use the description to decide when to load the skill. This matches the Agent Skills and Matt Pocock guidance. ([OpenAI Desenvolvedores][5])

## Example skill description

```yaml
---
name: gunk-radar
description: Audit AI-readable repository context files for stale commands, dead paths, conflicting agent instructions, duplicated guidance, and hallucination bait. Use when the user asks whether Claude, Codex, Copilot, Cursor, or other agents may be reading bad repo context.
---
```

## Subagents

Create four agent profiles:

```txt
gunk-scanner
  Read-only repo indexing and graph construction.

gunk-radar-agent
  Audits agent-readable files and explains context risk.

gunk-trap-agent
  Prepares safe trap plans, receipts, and restore instructions.

gunk-guard-agent
  Reviews PRs for newly introduced gunk.
```

For Claude, these can be plugin subagents. Claude plugin agents support fields like name, description, model, tools, disallowed tools, skills, memory, background, and isolated worktrees. ([Claude][16])

For Copilot, custom agents can run in separate subagent context windows to keep the main context clean. ([GitHub Docs][17])

For Codex, use explicit `/agent` workflows and avoid assuming subagents will be automatically spawned. ([OpenAI Desenvolvedores][18])

---

# 12. Plugin packaging

## Claude plugin

```txt
plugins/claude/
  plugin.json
  skills/gunk-buster/SKILL.md
  skills/gunk-radar/SKILL.md
  skills/gunk-trap/SKILL.md
  agents/gunk-scanner.md
  agents/gunk-radar-agent.md
  agents/gunk-trap-agent.md
  hooks/hooks.json
```

Use hooks only for non-destructive events, such as warning when a session starts in a repo with stale context files. Claude hooks can run at lifecycle events like session start, prompt submit, and pre-tool-use. ([Claude][19])

## Codex plugin

```txt
plugins/codex/
  plugin.json
  skills/gunk-buster/SKILL.md
  skills/gunk-radar/SKILL.md
  hooks/hooks.json
  mcp/gunk-buster.json
```

Codex plugin manifests can include skills, apps, MCP servers, and hooks. Hooks require user review/trust, so do not make hooks essential for MVP functionality. ([OpenAI Desenvolvedores][20])

## Copilot plugin

```txt
plugins/copilot/
  plugin.json
  agents/gunk-scanner.agent.md
  agents/gunk-radar.agent.md
  skills/gunk-buster/SKILL.md
  skills/gunk-radar/SKILL.md
  hooks.json
  .mcp.json
```

Copilot plugins are designed to distribute reusable agents, skills, hooks, MCP server configs, and integrations. ([GitHub Docs][21])

---

# 13. Full-scale LLM handoff plan

Use this as the builder prompt for Claude Code, Codex CLI, or Copilot CLI.

```txt
You are building Gunk Buster, a TypeScript CLI-first tool for AI Context Gunk Control.

Product:
Gunk Buster finds stale repo residue before AI coding agents eat it. It scans repositories for stale AI-readable context, obsolete docs, orphaned specs, generated dumps, dead links, duplicated instructions, old active plans, and files that can mislead Claude Code, Codex CLI, Copilot CLI, Cursor, OpenCode, Gemini, and other coding agents.

Core principle:
Never delete by default. Default action is safe external trapping with receipts and restore.

Persona:
Call the user “Chief” in CLI messages. Use short, clear, slightly playful language. Do not sacrifice accuracy.

Build stack:
- TypeScript
- Node.js
- pnpm
- Vitest
- Commander or CAC for CLI
- Zod for config schema
- No telemetry by default
- Cross-platform paths

Commands to implement:
- gunk init
- gunk scan
- gunk pile
- gunk score
- gunk radar
- gunk trap <path...>
- gunk restore <trap-id>
- gunk verify
- gunk report
- gunk guard

MVP behavior:
1. gunk scan
   - Read-only.
   - Index files.
   - Detect docs, code, config, generated artifacts, and agent-context files.
   - Output JSON and human summary.

2. gunk radar
   - Inspect AI-readable files:
     AGENTS.md, CLAUDE.md, GEMINI.md, CODEX.md, Copilot.md,
     .github/copilot-instructions.md,
     .github/instructions/**/*.instructions.md,
     .cursor/rules/**,
     .cursorrules,
     .aider.conf.yml,
     .opencode/**,
     .codex/**,
     .claude/**,
     .agents/**.
   - Detect stale commands, missing paths, package-manager drift, duplicated guidance, conflicting instructions, stale “current plan” docs, and tool-specific leakage.

3. gunk score
   - Apply explainable scoring:
     +30 no inbound imports
     +25 no inbound markdown links
     +20 not in docs nav/sidebar
     +20 not README
     +20 not AGENTS/CLAUDE/GEMINI/CODEX/Copilot
     +15 generated/cache pattern
     +15 superseded by newer doc
     +10 stale claim contradicted by package/CI/code
     +10 older than threshold
   - Apply negative weights for protected files, CI refs, package scripts, security/legal files, migrations, public APIs, recent changes, and test ownership.
   - Thresholds:
     90-100 auto-safe trap candidate
     70-89 propose trap
     40-69 ask Chief
     0-39 keep

4. gunk trap
   - Move files to:
     ../.gunk-buster/traps/<repo>/<trap-id>/
   - Preserve original path.
   - Write receipts to:
     .gunk-buster/receipts/*.json
   - Never trap protected files unless --force and explicit path are provided.
   - Run verify after trap.

5. gunk restore
   - Restore exact files from receipt.
   - Preserve receipt history.
   - Run verify.

6. gunk verify
   - Check git status.
   - Check markdown links where possible.
   - Check import references where possible.
   - Run configured project checks if present in gunk config.
   - Never invent success. Report unknown checks as unknown.

7. gunk report
   - Write markdown and JSON reports to:
     .gunk-buster/reports/

8. gunk guard
   - CI mode.
   - Fail only on new high-confidence BAIT/MOLD in agent-readable files.
   - Output GitHub Actions friendly annotations.

Architecture:
Create modules:
- src/scan/file-index.ts
- src/scan/git-index.ts
- src/scan/import-graph.ts
- src/scan/doc-graph.ts
- src/scan/context-graph.ts
- src/scan/package-scripts.ts
- src/scan/ci-refs.ts
- src/classify/scoring.ts
- src/classify/explain.ts
- src/radar/context-files.ts
- src/radar/stale-commands.ts
- src/radar/stale-paths.ts
- src/radar/conflicting-instructions.ts
- src/trap/vault.ts
- src/trap/receipt.ts
- src/trap/restore.ts
- src/verify/links.ts
- src/verify/imports.ts
- src/report/markdown.ts
- src/report/json.ts
- src/mcp/server.ts

Testing:
Create fixtures:
- stale-agent-files
- package-manager-drift
- orphan-docs
- duplicate-docs
- generated-dumps
- protected-files
- trap-and-restore
- ci-guard-new-gunk

Acceptance criteria:
- Running gunk scan on fixtures produces stable JSON snapshots.
- Running gunk radar detects stale package-manager instructions.
- Running gunk trap moves files outside the repo and writes receipts.
- Running gunk restore restores files exactly.
- Protected files are never trapped by default.
- gunk guard fails only for high-confidence new gunk.
- No command deletes files by default.
- All risky actions have dry-run output.
```

---

# 14. Subagent-driven build plan

Run development like Superpowers: spec first, then plan, then subagents, then review. ([GitHub][9])

## Phase 1 — Foundation

**Architect Agent**

Deliver:

```txt
package.json
pnpm workspace
tsconfig
CLI entry
config schema
test harness
fixtures layout
```

Acceptance:

```txt
pnpm test passes
gunk --help works
gunk scan --json works on empty repo
```

## Phase 2 — Read-only scanner

**Scanner Agent**

Deliver:

```txt
file index
git index
markdown link graph
basic import graph
package script refs
CI refs
generated file patterns
```

Acceptance:

```txt
fixtures/orphan-docs produces GHOST findings
fixtures/generated-dumps produces DUMP findings
fixtures/protected-files marks protected files as keep
```

## Phase 3 — Radar

**Radar Agent**

Deliver:

```txt
context file discovery
stale path detection
stale command detection
package manager drift
conflicting instructions
duplicated guidance
context bloat warning
```

Acceptance:

```txt
CLAUDE.md says npm while repo uses pnpm → BAIT
AGENTS.md references missing path → BAIT
Copilot instructions duplicate CLAUDE.md → ECHO
old-plan.md says "current plan" but newer plan exists → MOLD
```

## Phase 4 — Trap and restore

**Trap Safety Agent**

Deliver:

```txt
external vault
receipt format
trap command
restore command
dry-run mode
force protection
```

Acceptance:

```txt
trap moves file outside repo
receipt contains original path and reason
restore restores byte-identical file
protected file cannot be trapped without --force
```

## Phase 5 — Verify and report

**Verify Agent**

Deliver:

```txt
link verification
import verification
git status check
configured command runner
markdown report
json report
```

Acceptance:

```txt
trap operation runs verification
failed verification blocks “safe” status
unknown checks are reported as unknown, not pass
```

## Phase 6 — Agent ecosystem

**Plugin Agent**

Deliver:

```txt
Agent Skills
Claude plugin
Codex plugin
Copilot plugin
MCP server
GitHub Action
```

Acceptance:

```txt
Claude skill instructs agent to call gunk scan first
Codex skill works through SKILL.md
Copilot agent profile uses gunk CLI/MCP safely
MCP exposes scan/findings/explain/trap/restore/radar/report/guard
```

---

# 15. Viral launch strategy

The viral hook should be visual and obvious:

```txt
Before:
CLAUDE.md says use npm.
Repo uses pnpm.
Old docs say Express.
Code uses Fastify.
AI keeps following ghosts.

After:
gunk radar

Chief, found hallucination bait:
- CLAUDE.md: wrong package manager
- AGENTS.md: dead path
- docs/old-plan.md: says “current plan” but is 14 months old
- .cursor/rules/api.md: references deleted API folder

Nothing deleted.
Trap plan ready.
```

## Demo script

```txt
npx gunk-buster radar
npx gunk-buster scan
npx gunk-buster pile
npx gunk-buster trap docs/old-plan.md .cursor/rules/api.md
npx gunk-buster verify
npx gunk-buster report
```

## Marketing lines

Use these:

```txt
Your AI is not hallucinating. It is eating old repo garbage.

Stop feeding Claude stale docs.

Gunk Buster finds hallucination bait before your coding agent does.

Not a cleaner. A containment unit.

Trap first. Delete never.

Chief, the repo has gunk.
```

Avoid these:

```txt
Dead code remover
Repo cleaner
Autonomous cleanup bot
Delete unused files automatically
AI janitor
```

The last one is close to competing concepts and less original than **Gunk Buster**.

---

# 16. MVP roadmap

## MVP 1 — Read-only credibility

Ship:

```txt
gunk scan
gunk pile
gunk score
gunk report
```

Goal: establish trust.

## MVP 2 — Gunk Radar

Ship:

```txt
gunk radar
gunk radar --json
gunk radar --fix-plan
```

Goal: own the AI-context category.

## MVP 3 — Safe Trap

Ship:

```txt
gunk trap
gunk restore
gunk verify
```

Goal: make cleanup safe enough for real repos.

## MVP 4 — Guard

Ship:

```txt
gunk guard
GitHub Action
PR comment report
```

Goal: prevent new gunk.

## MVP 5 — Agent ecosystem

Ship:

```txt
Claude plugin
Codex plugin
Copilot plugin
MCP server
skills pack
subagents
```

Goal: become the default companion for agentic coding setups.

---

# 17. Definition of done for v1

Gunk Buster v1 is ready when it can honestly claim:

```txt
Gunk Buster scans AI-readable repo context,
finds stale instructions and orphaned residue,
explains why each file is risky,
moves safe candidates to an external trap vault,
writes receipts,
restores exactly,
and blocks new hallucination bait in CI.
```

The key implementation principle is:

> **Agents may recommend. The CLI decides. The Chief approves.**

That is how this becomes safe, viral, and actually useful.

[1]: https://code.claude.com/docs/en/skills "Extend Claude with skills - Claude Code Docs"
[2]: https://code.claude.com/docs/en/features-overview "Extend Claude Code - Claude Code Docs"
[3]: https://code.claude.com/docs/en/subagents "Create custom subagents - Claude Code Docs"
[4]: https://developers.openai.com/codex/guides/agents-md "Custom instructions with AGENTS.md – Codex | OpenAI Developers"
[5]: https://developers.openai.com/codex/skills "Agent Skills – Codex | OpenAI Developers"
[6]: https://docs.github.com/copilot/how-tos/copilot-cli/cli-best-practices "Best practices for GitHub Copilot CLI - GitHub Docs"
[7]: https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills "Adding agent skills for GitHub Copilot CLI - GitHub Docs"
[8]: https://agentskills.io/home?utm_source=chatgpt.com "Agent Skills Overview - Agent Skills"
[9]: https://github.com/obra/superpowers "GitHub - obra/superpowers: An agentic skills framework & software development methodology that works. · GitHub"
[10]: https://github.com/juliusbrussee/caveman "GitHub - JuliusBrussee/caveman:  why use many token when few token do trick — Claude Code skill that cuts 65% of tokens by talking like caveman · GitHub"
[11]: https://github.com/DietrichGebert/ponytail "GitHub - DietrichGebert/ponytail: Makes your AI agent think like the laziest senior dev in the room. The best code is the code you never wrote. · GitHub"
[12]: https://github.com/mattpocock/skills/blob/main/README.md "skills/README.md at main · mattpocock/skills · GitHub"
[13]: https://github.com/giacomo/agents-lint?utm_source=chatgpt.com "giacomo/agents-lint"
[14]: https://arxiv.org/abs/2606.15828?utm_source=chatgpt.com "Configuration Smells in AGENTS.md Files: Common Mistakes in Configuring Coding Agents"
[15]: https://developers.openai.com/codex/mcp "Model Context Protocol – Codex | OpenAI Developers"
[16]: https://code.claude.com/docs/en/plugins-reference "Plugins reference - Claude Code Docs"
[17]: https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/create-custom-agents-for-cli "Creating and using custom agents for GitHub Copilot CLI - GitHub Docs"
[18]: https://developers.openai.com/codex/subagents "Subagents – Codex | OpenAI Developers"
[19]: https://code.claude.com/docs/en/hooks "Hooks reference - Claude Code Docs"
[20]: https://developers.openai.com/codex/plugins/build "Build plugins – Codex | OpenAI Developers"
[21]: https://docs.github.com/en/copilot/concepts/agents/about-plugins "About GitHub Copilot plugins - GitHub Docs"
