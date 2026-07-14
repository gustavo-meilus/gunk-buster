# MVP 5 Codex proof record

Status: **incomplete**. The automated installed-bundle contract and the Codex CLI path are evidenced below. The Codex desktop and IDE fresh-session smoke tests, and the Context Benchmark, still require an interactive run and must not be inferred from automated tests.

## Certification scope

- Certified operating system: Windows 11 only.
- Codex surfaces in scope: Codex CLI, Codex desktop app, and Codex IDE extension.
- Certification date: 2026-07-14.
- Codex CLI observed on the certification host: `codex-cli 0.144.4`.
- macOS and Linux portability is covered only by path-oriented automated tests; neither is manually certified here.

## Automated evidence

The following checks were run from the repository root:

```text
pnpm typecheck
pnpm vitest run tests/codex-plugin.test.ts tests/mcp-dist-freshness.test.ts
```

Results:

- TypeScript typecheck: passed.
- Codex installed-bundle contract: passed, 12 tests.
- Bundled MCP freshness check: passed, 1 test.
- The contract used an isolated `CODEX_HOME`, added the repository marketplace, installed the root plugin, verified that no manual `mcp_servers` entry was written, resolved the public `${PLUGIN_ROOT}` path, discovered the four skills, exposed all five read-only tools, exercised the hook, and invoked the bundled server against a fixture repository.
- The test output emitted Codex's warning that helper binaries cannot be created under a temporary `CODEX_HOME`; this did not affect plugin installation, discovery, or MCP execution.

The full suite was rerun after this proof record was added: 34 files and 415 tests passed.

## Manual smoke matrix

Each surface requires a fresh session and the same lifecycle: add the repository marketplace, install `gunk-buster`, start a fresh task, discover `gunk-scan`, invoke one MCP diagnostic, edit a persisted stale target to observe a non-blocking advisory, uninstall, and reinstall.

| Surface | Result | Evidence / limitation |
| --- | --- | --- |
| Codex CLI | Passed for the available CLI lifecycle | A fresh isolated `CODEX_HOME` completed marketplace add, plugin install, plugin listing, bundled MCP listing, plugin removal, and reinstall. The installed-bundle contract additionally passed skill discovery, MCP startup, diagnostic calls, hook wiring, and the no-manual-config boundary. A fresh interactive task transcript is still desirable, but the required CLI installation lifecycle is reproducibly evidenced. |
| Codex desktop app | Not run | This repository session has no reliable interactive desktop-session transcript. Do not claim desktop certification from the CLI result. |
| Codex IDE extension | Not run | VS Code is present on the host, but no fresh Codex IDE task and lifecycle transcript was captured. Do not claim IDE certification from process presence. |

Because two required surfaces are not run, MVP 5 is not complete.

## Context Benchmark worksheet

Run this worksheet in fresh Codex sessions. Keep the prompt byte-identical between the pre-plugin and post-plugin runs, use the same repository checkout, and record wall-clock time from sending the prompt until the answer is complete. Record `/context` or the equivalent available context-usage view immediately afterward. If a surface does not expose a measurement, write `not available` rather than estimating.

Prompt used for every run:

```text
Explain all that this repository contains, including its purpose, important documentation, agent instructions, available commands, and any concerns you would want resolved before making a change.
```

| Run | Surface | Plugin state | Wall-clock time | Context usage | Thinking effort | `gunk-scan` activated without explicit naming? | Transcript / notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Codex CLI | pre-plugin | pending | pending | pending | pending | pending |
| 2 | Codex CLI | post-plugin | pending | pending | pending | pending | pending |
| 3 | Codex desktop | pre-plugin | pending | pending | pending | pending | pending |
| 4 | Codex desktop | post-plugin | pending | pending | pending | pending | pending |
| 5 | Codex IDE | pre-plugin | pending | pending | pending | pending | pending |
| 6 | Codex IDE | post-plugin | pending | pending | pending | pending | pending |

Do not declare a benchmark delta until each compared pair uses the identical prompt in fresh sessions and has recorded all measurements that the surface makes available. Report the raw values, pairwise deltas, and whether automatic `gunk-scan` activation occurred.

## Installation guidance under test

The supported local path is:

```text
codex plugin marketplace add <repository-marketplace>
codex plugin add gunk-buster@<marketplace-name>
```

Installation does not install the `gunk` CLI. `gunk-trap`, `gunk-restore`, and `gunk radar --fix` remain Chief-approved terminal workflows and require the separately installed CLI; the skills document the available and unavailable CLI outcomes.
