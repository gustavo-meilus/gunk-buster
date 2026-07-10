# MVP 1 — Scan

The read-only milestone: `gunk scan`, `gunk pile`, `gunk report`. No mutation of any kind. Vocabulary per `CONTEXT.md`; decisions here are binding — where the `reference/` docs disagree, they are wrong.

## Commands

| Command | Behavior |
| --- | --- |
| `gunk scan` | Builds the graphs, runs detectors, persists the scan index to `.gunk-buster/scan.json`, prints a summary |
| `gunk pile` | Renders grouped findings (by label, with verdicts and evidence) from the persisted index |
| `gunk report` | Writes a markdown report to `.gunk-buster/reports/` from the persisted index |

All commands accept `--json` (machine output to stdout). Human output uses the Chief voice by default; `voice: "professional"` in the config swaps to neutral phrasing with no user address. Persona strings never appear in JSON output.

`gunk score` does not exist and never will (see ROADMAP "Permanently out of scope").

## Candidate universe

Docs (markdown), doc-referenced assets (images etc.), agent-context files, and generated artifacts. Code files are hard-protected — never candidates (ADR-0001).

## Scan graphs

1. **File index** — paths, sizes, kinds (`doc | asset | agent-context | generated`), `.gitignore`-aware.
2. **Git index** — last-touched dates (via `git log`), for the age signal and recency protection.
3. **Markdown/doc graph** — inbound/outbound links, image refs, README refs, docs nav/sidebar membership. Parsed with remark/mdast, not regex.
4. **Agent-context graph** — what AGENTS.md, CLAUDE.md, GEMINI.md, .cursorrules, `.cursor/rules/**`, `.github/copilot-instructions.md`, `.claude/**`, `.agents/**`, `.codex/**`, `.opencode/**`, `.aider.conf.yml` reference.
5. **Package-script refs** — files mentioned by `package.json` scripts (protection signal).
6. **CI refs** — files mentioned by workflow files (protection signal).

**No import graph.** MVP 1 never judges code (permanent — ADR-0001).

## Detections

Structural only — graph facts. Semantic checks (claims vs repo) are Radar's job (MVP 2).

| Detection | Label | Method |
| --- | --- | --- |
| Orphan doc/asset | GHOST | No inbound links AND not in nav AND not in README AND not in any agent-context file |
| Generated artifact committed by mistake | DUMP | Pattern match (build/cache/coverage/tool residue) |
| Duplicate doc | ECHO | Title/heading similarity (no fuzzy content hashing in MVP 1) |
| Orphaned + sensitive content | RELIC | GHOST + keyword check (migration/security/prod/legal/billing) |
| Broken markdown link | — (link finding) | Doc graph: any file → missing target, including inside agent-context files |

## Classification (ADR-0002)

No scores. Detectors emit evidence `{rule, confidence: CERTAIN | STRONG | WEAK, rationale}`; correlated reference signals collapse into composite predicates (e.g. "unreferenced" is one STRONG evidence requiring all reference graphs to agree).

**Protections** are a separate axis, never summed with evidence:

- **Hard** (excluded from candidacy before detection): code files; LICENSE, SECURITY.md, CODEOWNERS, lockfiles, package manifests, Dockerfiles, `.github/workflows/*`, `migrations/*`, `infra/*`, terraform/ansible dirs.
- **Soft** (verdict capped at ASK_CHIEF): modified within recency window (default 30 days); sensitive keywords (migration/security/prod/legal/billing).

**Verdict function** — pure, ordered, unit-testable:

```
any hard protection        → EXCLUDED (never shown)
no evidence                → KEEP
any soft protection        → capped at ASK_CHIEF
strongest evidence CERTAIN → SAFE
strongest evidence STRONG  → PROPOSE
strongest evidence WEAK    → ASK_CHIEF
```

## Output contract

`.gunk-buster/scan.json`, gated by `schemaVersion` (starts at 1). `.gunk-buster/` ships an internal `.gitignore` covering `scan.json` (ephemeral, per-machine); reports/receipts become tracked content in later milestones. Human output carries no stability promise.

```json
{
  "schemaVersion": 1,
  "scannedAt": "…",
  "repoRoot": "…",
  "counts": { "byVerdict": {}, "byLabel": {} },
  "findings": [
    {
      "type": "file",
      "path": "docs/old-plan.md",
      "kind": "doc",
      "label": "GHOST",
      "verdict": "PROPOSE",
      "evidence": [
        { "rule": "unreferenced", "confidence": "STRONG", "rationale": "no inbound links, not in nav, not in README, not in any agent-context file" }
      ],
      "protections": []
    },
    {
      "type": "link",
      "path": "README.md",
      "target": "docs/setup-old.md",
      "evidence": [{ "rule": "broken-link", "confidence": "CERTAIN", "rationale": "target does not exist" }]
    }
  ]
}
```

**Exit codes:** 0 whenever the scan succeeds, regardless of findings. Non-zero only for tool errors (not a git repo, unreadable files). Findings never fail a run in any milestone (ADR-0004).

## Config

Zero-config by default; an optional config file is read if present, never written (`gunk init` does not exist in MVP 1). Knobs: `voice`, age threshold (default 180 days), recency window (default 30 days), extra protected paths. Schema via zod.

## Stack

See ADR-0003. TypeScript, ESM, Node ≥ 20, commander, zod, remark/mdast, `ignore`, shell-out git, Vitest + fixture repos, tsup; npm package `gunk-buster`, bin `gunk`. No telemetry, no network.

## Verification

Fixture repos with known gunk and expected findings as Vitest snapshots — every detector testable in isolation. Plus the **Context Benchmark** (see ROADMAP): before/after `/context` measurements on a real repo accompany the milestone demo.

## OUT of MVP 1 (lands later)

- Any mutation — no trap, restore, patch, delete, `--fix` anything
- Radar semantic checks — wrong commands, package-manager drift, contradicted claims, context bloat, conflicting instructions (MVP 2)
- `gunk verify`, `gunk ask`, `gunk bust`, receipts, vault (MVP 3)
- MCP server, skills, plugins, subagents (MVP 4)
- `gunk init` / config scaffolding
- Fuzzy duplicate-content hashing (ECHO is title/heading similarity only)
- Token-savings estimates — the Context Benchmark measures real deltas instead

## OUT of the product (permanent)

- Code analysis of any kind (ADR-0001)
- Per-file or repo-level numeric scoring (ADR-0002)
- CI mode, GitHub Action, PR comments, findings-as-failure exits (ADR-0004)
- Telemetry, network calls, cloud anything
