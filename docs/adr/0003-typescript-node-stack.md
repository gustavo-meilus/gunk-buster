# TypeScript/Node CLI-first stack

Gunk Buster is a TypeScript, ESM-only, Node ≥ 20 CLI, distributed as npm package `gunk-buster` with binary `gunk`, run via `npx`. We chose Node over Go/Rust single-binary alternatives because the audience installs agent tooling through npm and the plugin ecosystems (Claude Code, Codex, Copilot) are npm-native — distribution friction beats binary elegance here.

Every dependency must earn its place with one clear purpose:

| Choice | Purpose |
| --- | --- |
| TypeScript, ESM, Node ≥ 20 | The findings schema and graph types are the product's contracts; static types keep them honest |
| Single package, pnpm as dev package manager | No workspace until plugins exist (MVP 4) |
| commander | CLI parsing, nothing else |
| zod | Single source of truth for the two stability-promised schemas: `scan.json` and the optional config; TS types derive from it |
| remark/mdast | The doc graph is the core asset; regex link-extraction breeds false positives |
| `ignore` | Correct `.gitignore` semantics — hand-rolling this is a known bug farm |
| Shell out to `git` (no library) | Only `log`/`ls-files` data is needed; a git library adds surface for zero gain |
| Vitest + fixture repos | Fixtures (known-gunk repos with expected findings as snapshots) are the trust mechanism |
| tsup | Bundle to one file so `npx` cold-starts fast |

Deliberately absent: parser/AST tooling (ADR-0001), config frameworks, logging frameworks, and anything network-capable — no-telemetry/no-network is a product promise enforced at the dependency level. Cross-platform paths from day one.
