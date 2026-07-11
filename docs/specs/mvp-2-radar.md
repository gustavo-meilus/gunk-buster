# MVP 2 — Radar

The semantic-audit milestone: `gunk radar`. Still read-only — it emits findings plus a patch plan, never an applied patch (mutation waits for MVP 3). Vocabulary per `CONTEXT.md`; decisions here are binding — where the `reference/` docs disagree, they are wrong.

**Fully deterministic.** "Semantic" means cross-referencing claims in docs against hard repo facts (manifests, lockfiles, the file tree, script names) — never NLU, never an LLM, no network (ADR-0004). Same input → same findings, fixture-testable.

## Commands

| Command | Behavior |
| --- | --- |
| `gunk radar` | Runs the four claim checks over the audit surface, persists `.gunk-buster/radar.json`, prints findings |
| `gunk radar --fix-plan` | Additionally renders the aggregated suggestions as a checklist |
| `gunk pile` / `gunk report` | Merge `radar.json` in when it exists — BAIT/MOLD groups appear alongside the scan groups |

`--json` works as in MVP 1 (machine output, no persona strings). Chief voice by default, `voice: "professional"` to disable — same convention as scan.

## Audit surface

Agent-context files **and** ordinary docs — both already in the file index. The label falls out of the file kind:

- Finding in an **agent-context** file → **BAIT** (agent-context content that misleads)
- Finding in an **ordinary doc** → **MOLD** (a stale doc whose claims are contradicted by the current repo)

## Finding shape

A new finding type alongside `file` and `link`: the **claim finding**. It locates a wrong claim at a line; the remedy is an *edit*, not a trap.

```json
{
  "type": "claim",
  "path": "CLAUDE.md",
  "line": 12,
  "label": "BAIT",
  "check": "package-manager-drift",
  "evidence": [
    { "rule": "pm-mismatch", "confidence": "CERTAIN", "rationale": "CLAUDE.md says `npm install`; package.json packageManager is pnpm@9" }
  ],
  "expected": "pnpm install",
  "actual": "npm install",
  "suggestion": { "replace": "npm install", "with": "pnpm install" }
}
```

- Reuses the Evidence contract `{rule, confidence, rationale}` (ADR-0002).
- **No trap verdict** — claim findings live outside the verdict lattice; SAFE/PROPOSE/ASK_CHIEF answer "safe to trap?", which does not apply here.
- **No protections** — claim findings bypass both hard and soft protections, like link findings. A false claim in a recently-edited or sensitive file is exactly as false; protections exist to prevent unsafe removal, and nothing is removed.
- `suggestion` is present only when a deterministic fix exists; findings without one just locate the problem.

## Checks

Four checks. Mentions are only counted inside inline code and fenced code blocks — prose is where placeholders and hypotheticals live.

### 1. Package-manager drift (`package-manager-drift`)

Ground truth for the repo's true package manager, strict precedence:

1. `packageManager` field in the root `package.json` → authoritative; mismatching mentions are **CERTAIN**.
2. Else exactly one lockfile (`pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`, `bun.lockb`) → mismatching mentions are **STRONG**.
3. Else (multiple lockfiles, or no signal) → **the check emits nothing**. A tool built to kill misleading context never guesses.

A mention is a package-manager invocation (`npm install`, `yarn add …`, `pnpm dlx …`) in a code span/block naming a manager other than the true one. Suggestion: the same invocation rewritten to the true manager.

### 2. Dead commands (`dead-command`)

Script invocations (`npm run X`, `pnpm X`, `yarn X`, `bun run X`) resolved against the **union of scripts from every `package.json` in the file index** (root + workspaces). A command is dead only if its script exists in **no** manifest — deliberately permissive so monorepo docs never get false positives; no `--filter`/`-w` routing in MVP 2. The package manager's built-in subcommands (`install`, `add`, `exec`, `dlx`, `test`, …) are whitelisted. A missing script is a hard fact → **CERTAIN**. No suggestion unless a rewrite is unambiguous.

### 3. Dead paths (`dead-path`)

Path-shaped tokens inside code spans/blocks that look like relative repo paths — must contain a `/` after any leading `/` is stripped — checked against **git-tracked files and directories**. A bare filename (`CLAUDE.md`) never qualifies: dogfooding showed generic filename mentions are not provably claims about *this* repo and were the dominant false-positive source. Stripping the leading `/` first, then re-testing, means a slash-command (`/deploy-now`) or a lone `/` never qualifies either, while a root-anchored path (`/src/index.ts`) still resolves like its relative twin. Guards (any hit → token skipped):

- glob characters (`*`, `?`, `[`)
- placeholder syntax (`<…>`, `{…}`, `$VAR`)
- URL schemes
- tokens matching a `.gitignore` pattern (an ignored path is probably a build product, not a claim)

Always **STRONG**, never CERTAIN — a path-shaped token is not provably a claim about this repo. No suggestion.

### 4. Context bloat (`context-bloat`)

**Agent-context files only** — long docs are legitimate; long always-loaded agent context is not. Two independent rules:

1. Word count exceeds `radar.bloatWordBudget` (default 2500) → **WEAK** (a threshold breach is a smell, not proof).
2. Heading structure substantially duplicates the README, per the existing ECHO structure comparator → **STRONG** (duplication is demonstrable).

No suggestion.

### Deferred (explicitly NOT in MVP 2)

Stale-architecture claims, conflicting instructions across files, tool leakage, old-plan bait. Deterministic versions of these are false-positive generators; they wait until a design exists that can carry honest confidence.

## Output contract

`.gunk-buster/radar.json` — mirrors the scan envelope, owns its own `schemaVersion` (starts at 1), covered by the existing `.gunk-buster/.gitignore` (ephemeral, per-machine). Scan and radar never write each other's files; the two indexes may be stale independently, each with an honest timestamp.

```json
{
  "schemaVersion": 1,
  "scannedAt": "…",
  "repoRoot": "…",
  "counts": { "byLabel": { "BAIT": 3, "MOLD": 1 }, "byCheck": { "dead-command": 2, "package-manager-drift": 2 } },
  "findings": [ { "type": "claim", "…": "…" } ]
}
```

**Exit codes:** 0 whenever the radar succeeds, regardless of findings (ADR-0004). Non-zero only for tool errors.

## Config

New `radar` block in `gunk.config.json` (zod, strict):

```json
{
  "radar": {
    "checks": {
      "packageManagerDrift": true,
      "deadCommands": true,
      "deadPaths": true,
      "contextBloat": true
    },
    "bloatWordBudget": 2500,
    "exclude": []
  }
}
```

All checks default on; kill switches are the escape hatch for repos with deliberately unusual setups. Zero-config still works.

`radar.exclude` is a list of gitignore-style patterns removing files from the audit surface entirely — an excluded file is invisible to **every** check. It exists for repos whose docs legitimately quote paths and commands that are not repo claims: test fixtures, strategy/reference docs, specs that quote the very anti-pattern they define. Radar-only — scan's GHOST/DUMP/ECHO detection still sees excluded files. File-level only; inline suppression comments are explicitly out (they invite gunk of their own).

## Non-Node repos

Drift and dead-commands find no manifests/lockfiles and emit nothing (silent-when-unsure). Dead paths and bloat work everywhere.

## Seams and verification

- **One new engine seam: `radar(repoRoot, config) → RadarResult`** — all four checks tested through it with fixture repos, same helpers and style as the MVP 1 suites.
- **No new view seams** — `buildPileResult` / `renderReportMarkdown` extended to accept the optional radar result, tested through their existing signatures.
- **Pure sub-seams by exception only** — a `compareDocStructures`-style unit suite where a truth table earns it (extraction guards, resolution rules); extractors otherwise stay internal.

## OUT of MVP 2 (lands later)

- Any mutation — no applied patches, no `--fix`, no trap/restore (MVP 3)
- Diff/patch-file output — `--fix-plan` renders a checklist, never a `git apply`-able artifact
- Stale-architecture, conflicting-instructions, tool-leakage, old-plan-bait checks
- Workspace-aware command routing (`--filter`, `-w`, `-C`)
- Escalation from claim findings to file-level verdicts
- MCP server, skills, plugins, subagents (MVP 4)

## OUT of the product (permanent)

- Code analysis of any kind (ADR-0001)
- Per-file or repo-level numeric scoring (ADR-0002)
- CI mode, findings-as-failure exits (ADR-0004)
- LLM calls, telemetry, network anything
