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
| 1 | Codex CLI | pre-plugin | 1m 35s | 61.2K used / 258K | reasoning medium | No (plugin absent) | Codex 0.144.4; gpt-5.6-luna; session `019f63cb-39e7-7291-9804-f17b2d2d44fd`; repository `/mnt/c/Users/gmeil/Github/aiboarding`. |
| 2 | Codex CLI | post-plugin | 1m 59s | 57.6K used / 258K | reasoning medium | No | Codex 0.144.4; gpt-5.6-luna; session `019f63f3-2fd3-7982-aa22-024c8f004df1`; automatically selected `gunk-radar`, but `gunk --version` failed because the separate CLI was not installed. |
| 3 | Codex desktop | pre-plugin | pending | pending | pending | pending | pending |
| 4 | Codex desktop | post-plugin | pending | pending | pending | pending | pending |
| 5 | Codex IDE | pre-plugin | pending | pending | pending | pending | pending |
| 6 | Codex IDE | post-plugin | pending | pending | pending | pending | pending |

Do not declare a benchmark delta until each compared pair uses the identical prompt in fresh sessions and has recorded all measurements that the surface makes available. Report the raw values, pairwise deltas, and whether automatic `gunk-scan` activation occurred.

### Codex CLI result

- Wall-clock delta: +24 seconds post-plugin (+25.3%).
- Context-usage delta: -3.6K tokens post-plugin (-5.9%).
- Automatic `gunk-scan` activation: no.
- Other automatic plugin behavior: Codex selected the `gunk-radar` skill without the plugin being named explicitly. The skill correctly detected that the separately installed `gunk` CLI was unavailable, so no deterministic radar diagnostic ran.
- Comparability: both runs used fresh sessions, Codex 0.144.4, gpt-5.6-luna with medium reasoning and automatic summaries, the same repository, and the byte-identical benchmark prompt.

### Explicit Codex CLI skill smoke tests

These are functional smoke tests, not additional Context Benchmark rows. Both ran in fresh Codex CLI sessions against `/mnt/c/users/gmeil/github/aiboarding` with Codex 0.144.4 and gpt-5.6-luna at medium reasoning.

| Skill | Session | Wall-clock time | Context usage | Skill discovery | Canonical MCP invocation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| `gunk-scan` | `019f65ae-b618-72f0-b9c8-ec4f5423da71` | 2m 03s | 41.8K used / 258K | Passed | Failed through the Codex tool surface | `gunk_scan` was not exposed to the session. Codex manually located the installed plugin cache and launched bundled `dist/mcp.js` over JSON-RPC using Windows Node from WSL, producing 23 structural findings. This proves the bundled server can run, but not that normal installed-tool wiring works. |
| `gunk-radar` | `019f65ae-a184-7351-bd7a-943c2e2b9ff8` | 1m 05s | 62K used / 258K | Passed | Failed | Neither `gunk_radar` nor the separately installed `gunk` CLI was available. Codex returned a manual fallback audit rather than canonical Radar findings. |

Observed limitation: in these WSL-backed Codex CLI sessions, the plugin skills were discoverable but its MCP tools were absent from the session tool list. Direct plugin-cache execution is not a supported substitute for `${PLUGIN_ROOT}` MCP registration. This prevents the Codex CLI smoke lifecycle from being considered complete until the installed MCP surface is exposed and both skills invoke it normally. Both sessions reported that no files were modified, but the supplied transcripts did not include matching before-and-after `git status` captures.

#### Retest after installing Node in WSL

Installing Node did not clear the MCP acceptance gate. Interactive WSL resolves `node` through NVM as `/home/gmeilus/.nvm/versions/node/v26.5.0/bin/node`, while a non-interactive login shell does not resolve `node`. The installed plugin remains registered with the portable command `node ${PLUGIN_ROOT}/dist/mcp.js`.

| Skill | Session | Wall-clock time | Context usage | Codex-managed MCP startup | Outcome |
| --- | --- | --- | --- | --- | --- |
| `gunk-scan` | `019f65dc-6cd8-7751-9bc3-5b538e24b6d3` | 3m 43s | 44.8K used / 258K | Failed during initialize handshake | Skill discovery passed. Codex again used a custom cache-path JSON-RPC client to launch `dist/mcp.js`, which returned the expected 23 structural findings. This is bundle evidence, not a successful registered-tool invocation. |
| `gunk-radar` | `019f65de-afe3-7f13-9ce6-04e708ad551d` | not recorded | 24.4K used / 258K | Failed with `No such file or directory (os error 2)` | Skill discovery passed, but neither `gunk_radar` nor the separate CLI was available. No canonical Radar result was produced. |

The inconsistent startup errors and NVM-only Node resolution indicate an environment-sensitive MCP launch path. A passing retest requires `node` to resolve in the environment Codex gives MCP subprocesses and requires Codex itself to complete the initialize handshake. A manually launched server does not satisfy this requirement.

Diagnosis on Codex CLI 0.144.4 isolated the launch variables with ephemeral Codex-managed probes:

- Absolute Node path plus literal `${PLUGIN_ROOT}/dist/mcp.js`: failed; no MCP tool call was available.
- Plain `node` plus the absolute installed `dist/mcp.js` path: passed; Codex invoked `gunk_scan` and received 23 findings.
- Absolute Node and absolute bundle paths: passed with the same canonical tool result.

Confirmed root cause: Codex registers the plugin MCP argument literally as `${PLUGIN_ROOT}/dist/mcp.js` and does not expand the placeholder before process launch. Node resolution, the bundled server, its protocol handshake, and `gunk_scan` behavior all pass when the bundle argument is an absolute installed path. The existing automated installed-bundle contract manually substitutes `${PLUGIN_ROOT}`, so it did not exercise this failing Codex-managed launch boundary.

Resolution: version 0.1.1 adopts the official Codex plugin pattern, launching `node ./dist/mcp.js` with `cwd` set to the installed plugin root (`.`). The installed-bundle contract no longer performs placeholder substitution and instead launches from the declared working directory.

#### Successful version 0.1.1 retest

After marketplace refresh and reinstall, fresh Codex CLI 0.144.4 sessions exposed and invoked the plugin-managed MCP tools normally. No plugin-cache inspection, manual JSON-RPC client, or global `gunk` CLI was needed for the read-only diagnostics.

| Skill | Session | Wall-clock time | Context usage | Canonical MCP invocation | Outcome |
| --- | --- | --- | --- | --- | --- |
| `gunk-scan` | `019f6643-6a39-7ff3-9be0-ca129e191990` | not recorded | 40.3K used / 258K | Passed | Codex called `gunk_scan`, `gunk_pile`, and `gunk_report` directly. It reported 23 structural findings and 134 combined scan/radar findings, and stated that no files were modified. |
| `gunk-radar` | `019f6644-7ec3-7420-b9b1-2e4722b52442` | not recorded | 28.1K used / 258K | Passed | Codex called `gunk_radar` directly, including a dry-run fix-plan request. It reported 111 dead-path claims (9 BAIT, 102 MOLD), an empty mechanical fix plan, and no file modifications. The absent global CLI affected only optional CLI-based mutation guidance, not the bundled read-only diagnostic. |

The explicit Codex CLI scan and radar skill smoke tests now pass on version 0.1.1. The benchmark's existing post-plugin run remains evidence for the broken 0.1.0 behavior and must be repeated against 0.1.1 before reporting the final shipped pre/post comparison.

## Installation guidance under test

The supported local path is:

```text
codex plugin marketplace add <repository-marketplace>
codex plugin add gunk-buster@<marketplace-name>
```

Installation does not install the `gunk` CLI. `gunk-trap`, `gunk-restore`, and `gunk radar --fix` remain Chief-approved terminal workflows and require the separately installed CLI; the skills document the available and unavailable CLI outcomes.
