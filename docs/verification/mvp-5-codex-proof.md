# MVP 5 Codex proof record

Status: **evidenced on Codex CLI and Codex desktop**. The automated installed-bundle contract, the Codex CLI path, the Codex desktop smoke lifecycle, and the shipped pre-plugin/post-plugin Context Benchmark on version 0.1.1 (runs 1 and 2b) are evidenced below. The IDE lifecycle is waived by maintainer decision. The benchmark establishes that the plugin activates automatically on an unnamed prompt; it is a single-run functional check and deliberately makes no performance claim. Desktop benchmark rows 3-4 remain open pending a maintainer decision, since desktop sessions consume the same account quota and expose no token telemetry.

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
| Codex desktop app | Passed | Fresh desktop tasks against `aiboarding` with plugin 0.1.1, run 2026-07-16: (1) the unnamed prompt "check this repo for stale context" activated the gunk workflow (1m 32s) and the tool trace shows Codex-managed "Gunk Buster integração" Gunk radar MCP invocations — not a plugin-cache launch — returning a canonical Radar result (116 dead-path claims: 17 BAIT, 99 MOLD; empty fix plan) with no files modified; (2) a scan run persisted 27 findings (12 GHOST, 8 ECHO, 7 RELIC; 4 PROPOSE, 23 ASK_CHIEF) with no files modified; (3) after uninstall, a fresh session showed no Gunk Buster integration and fell back to manual auditing, evidencing removal; (4) after reinstall, a fresh session (36s) again produced canonical gunk findings (17 BAIT, 99 MOLD, 7 RELIC, 8 duplicate fixtures) with no files changed, evidencing the reinstall cycle; (5) the stale-target edit advisory was exercised interactively — a persisted flagged target produced a non-blocking warning and the edit applied, while an unflagged file edited silently (maintainer-attested; transcript not captured in this record). Limitation: the desktop app exposes task names and timestamps rather than session IDs; those are the recorded identifiers. |
| Codex IDE extension | Waived (maintainer decision, 2026-07-16) | The maintainer accepted the Codex desktop pass as sufficient coverage and descoped the dedicated IDE lifecycle run. This is a scope decision, not a certification: no fresh Codex IDE task transcript exists, and desktop evidence does not demonstrate the IDE extension's tool exposure or hook wiring. If IDE-specific issues surface, this row must be revisited. |

The IDE surface is waived by maintainer decision (see its row). The shipped pre/post Context Benchmark on version 0.1.1 is complete for the Codex CLI surface (runs 1 and 2b below); the desktop benchmark rows remain a maintainer decision.

## Context Benchmark worksheet

Run this worksheet in fresh Codex sessions. Keep the prompt byte-identical between the pre-plugin and post-plugin runs, use the same repository checkout, and record wall-clock time from sending the prompt until the answer is complete. Record `/context` or the equivalent available context-usage view immediately afterward. If a surface does not expose a measurement, write `not available` rather than estimating.

Prompt used for every run:

```text
Explain all that this repository contains, including its purpose, important documentation, agent instructions, available commands, and any concerns you would want resolved before making a change.
```

| Run | Surface | Plugin state | Wall-clock time | Context usage | Thinking effort | `gunk-scan` activated without explicit naming? | Transcript / notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Codex CLI | pre-plugin | 1m 35s | 61.2K used / 258K | reasoning medium | No (plugin absent) | Codex 0.144.4; gpt-5.6-luna; session `019f63cb-39e7-7291-9804-f17b2d2d44fd`; repository `/mnt/c/Users/gmeil/Github/aiboarding`. |
| 2 | Codex CLI | post-plugin (0.1.0) | 1m 59s | 57.6K used / 258K | reasoning medium | No | Superseded by run 2b. Codex 0.144.4; gpt-5.6-luna; session `019f63f3-2fd3-7982-aa22-024c8f004df1`; automatically selected `gunk-radar`, but `gunk --version` failed because the separate CLI was not installed. Retained as 0.1.0 evidence only. |
| 2a | Codex CLI | post-plugin (0.1.1) | 2m 02s | 317.7K input / 58.1K uncached | reasoning medium | **Invalid run** | Session `019f6ca2-0b0c-74d2-a76e-ecd68c3b6c65`. Harness launched from a login shell where `node` did not resolve, so Codex could not start the plugin MCP server and no gunk tool was ever exposed. The session completed successfully while actually measuring the pre-plugin condition. Excluded from all conclusions; see the harness validity guard below. |
| 2b | Codex CLI | post-plugin (0.1.1) | 1m 49s | 408.7K input / 57.4K uncached | reasoning medium | No — but `gunk_radar` did | **Run of record.** Codex 0.144.4; gpt-5.6-luna; session `019f6ca8-35d8-76a0-9d8c-76b589718a15`; commit `251b54b`; `node` resolved via NVM. Codex invoked the Codex-managed MCP tool `gunk-buster/gunk_radar` without the prompt naming the plugin. Exit 0; worktree unchanged. |
| 3 | Codex desktop | pre-plugin | pending | pending | pending | pending | pending |
| 4 | Codex desktop | post-plugin | pending | pending | pending | pending | pending |
| 5 | Codex IDE | pre-plugin | waived | waived | waived | waived | Waived with the IDE smoke lifecycle by maintainer decision (2026-07-16). |
| 6 | Codex IDE | post-plugin | waived | waived | waived | waived | Waived with the IDE smoke lifecycle by maintainer decision (2026-07-16). |

Do not declare a benchmark delta until each compared pair uses the identical prompt in fresh sessions and has recorded all measurements that the surface makes available. Report the raw values, pairwise deltas, and whether automatic `gunk-scan` activation occurred.

### Codex CLI result

Comparison of record: run 1 (pre-plugin) versus run 2b (post-plugin on 0.1.1).

- Automatic plugin activation: **yes**. Codex invoked the plugin-managed MCP tool `gunk_radar` on the byte-identical prompt without the plugin, the skill, or the tool being named. This is the acceptance-relevant behavior change.
- Automatic `gunk-scan` activation specifically: **no**. Codex selected Radar rather than Scan. Both 0.1.0 (run 2) and 0.1.1 (run 2b) independently chose `gunk-radar` on this prompt and repository, so this is a consistent selection preference rather than a one-off.
- Wall-clock: 1m 35s pre versus 1m 49s post (+14s). Reported as a single-run observation, not a measured performance claim (see limitations).
- Token usage: run 2b used 408.7K input (351.2K cached, 57.4K uncached), 4,766 output, 693 reasoning. Run 1 predates the harness and has no comparable token telemetry, only a 61.2K context-window occupancy figure, so no token delta is claimed.
- Validity: exit 0 and worktree unchanged.

Note that `input_tokens` (cumulative billed input across turns, ~318–409K here) and the worksheet's "context usage" column (final context-window occupancy, ~58–61K) measure different things and must not be compared to each other.

#### Limitations of this comparison

- **Single run per condition.** Agent runs are stochastic; one run per cell cannot separate a real effect from run-to-run noise. Published agent-benchmark practice treats repeated runs (commonly 3+, reported as medians or pass@k) as a precondition for any *statistical* claim. Run 2b is therefore recorded as a **functional acceptance check** — the plugin demonstrably activates — and not as a performance measurement. The wall-clock difference above is directional only.
- **Unpaired instrumentation.** Run 1 predates the harness, so pre and post were captured with different tooling and token telemetry exists only for the post side.
- **Repository drift.** The aiboarding worktree carried 13 dirty entries at the time of the earlier runs and 16 at run 2b. The added entries include `.gunk-buster/` scan and radar artifacts left by earlier smoke tests, which are themselves repository content the agent can read. This further weakens the timing comparison against run 1.
- **No answer-quality rubric.** Nothing scores factual coverage, so a faster or cheaper run is not necessarily a better one.
- Recommended follow-up if quota allows: 5 interleaved pre/post pairs at fixed model and effort, activation scored mechanically from `events.jsonl`, plus a fixed factual checklist over `answer.md`.

#### Matched-pair observation (runs 2a and 2b)

Run 2a is invalid as a post-plugin row, but it is a well-matched control for run 2b: identical commit (`251b54b`), byte-identical worktree state (16 dirty entries), byte-identical prompt, same model, effort, harness, and host, six minutes apart. Exactly one variable differs — whether the plugin's MCP tools were exposed. Both runs had the plugin installed and its skills loaded, so this contrast isolates **tool exposure**, not plugin presence.

| Metric | 2a tools absent | 2b tools present | Delta |
| --- | ---: | ---: | ---: |
| Wall clock (s) | 122.4 | 108.6 | -11.3% |
| Input total | 317,728 | 408,664 | +28.6% |
| Cached input | 259,584 | 351,232 | +35.3% |
| Uncached input | 58,144 | 57,432 | -1.2% |
| Output | 5,782 | 4,766 | -17.6% |
| Reasoning | 813 | 693 | -14.8% |
| Shell commands executed | 18 | 15 | -16.7% |
| MCP tool calls | none | `gunk_radar` | — |

The direction matches the independent Dominus Pax medium-effort result in [context-cleanup-benchmarks.md](context-cleanup-benchmarks.md) (wall -12.2%, reasoning -12.1%, input +6.8%): reasoning and wall time fall, cached and total input rise, uncached input is roughly flat. Two different mechanisms — context filtering there, tool availability here — on two different repositories produced the same signature. This is corroboration, not proof; both are single-run or small-sample observations and the claim boundary in that document still governs.

Answer quality was scored against the five elements the prompt itself requests (purpose, documentation, agent instructions, commands, concerns), a rubric fixed by the prompt rather than derived after reading the answers. Both runs covered all five. The tools-present run was 34% shorter (688 vs 1,039 words) and ran fewer shell commands, yet surfaced a substantive finding the tools-absent run missed: the duplicated `cutting-a-release` skill across `.agents/skills/` and `.claude/skills/`, which run 2a saw but dismissed as local worktree context. Run 2b also critically filtered the Radar output rather than trusting it, explicitly separating intentional generated-target paths from real defects. The mechanism is consistent with the tool substituting for shell exploration. With n=1 per condition this is an observation, not a measured quality gain.

#### Why Radar rather than Scan

Both 0.1.0 (run 2) and 0.1.1 (run 2b) selected `gunk_radar` over `gunk_scan` on this prompt. The tool descriptions plausibly explain the preference: Radar advertises "wrong-claim findings", which maps closely onto the prompt's "concerns you would want resolved before making a change", while Scan advertises "stale, agent-readable repo residue". The acceptance criterion's expectation that `gunk-scan` specifically activates appears miscalibrated for this prompt; the plugin activating its most semantically apt tool is the desired behavior. This is an inferred explanation from description wording, not a tested hypothesis.

#### Harness validity guard

Run 2a exposed a silent failure mode with real cost. Codex launches the plugin MCP server as `node ./dist/mcp.js` and passes the invoking shell's environment to it. NVM initializes only in interactive shells, so a login shell (`bash -lc`, required for automation from Windows) has no `node`, the server never starts, and the session exposes no gunk tools — while still exiting 0 and producing a plausible answer. Such a run silently measures the pre-plugin condition.

This was isolated with two otherwise identical single-variable probes:

| `node` resolvable | Probe result |
| --- | --- |
| No | `TOOL-NOT-AVAILABLE`; no `mcp_tool_call` event |
| Yes | `gunk-buster/gunk_scan` called successfully with a canonical result |

Model self-reports of its own tool list were unreliable in both directions and must not be used as exposure evidence; only `mcp_tool_call` events in `events.jsonl` count.

`scripts/context-benchmark.sh` now sources NVM when `node` is missing and aborts a `post` run with exit code 4 if `node` still does not resolve, so this condition fails loudly instead of yielding an invalid benchmark.

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

### Supplemental context-cleanup experiments

Repeated CLI experiments also measured repository explanation behavior before
and after context-surface cleanup. The largest completed matrix used the messy
Dominus Pax repository (338 scan findings and 505 Radar findings) and recorded
16 successful Luna sessions across low, medium, and high effort. Results varied
by effort: low and medium reduced median reasoning, medium reduced wall time,
and high effort regressed substantially. See
[context-cleanup-benchmarks.md](context-cleanup-benchmarks.md) for raw runs,
medians, limitations, and the earlier AIBoarding and Superpipelines evidence.

These experiments test context filtering, not plugin activation. They did not
record automatic unnamed `gunk-scan` activation and therefore do not satisfy the
remaining MVP 5 Context Benchmark acceptance criterion.

## Installation guidance under test

The supported local path is:

```text
codex plugin marketplace add <repository-marketplace>
codex plugin add gunk-buster@<marketplace-name>
```

Installation does not install the `gunk` CLI. `gunk-trap`, `gunk-restore`, and `gunk radar --fix` remain Chief-approved terminal workflows and require the separately installed CLI; the skills document the available and unavailable CLI outcomes.
