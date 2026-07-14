# MVP 5 — Codex port

## Problem Statement

Gunk Buster's deterministic engine and Claude Code distribution already exist, but a Chief working in Codex cannot install the same workflows as one coherent product. The current skills and advisory hook live under Claude-specific paths, the MCP server is wired with a Claude-specific plugin-root variable, and mutation guidance assumes the `gunk` CLI is already available. A Codex user would have to discover and configure each surface manually, which defeats the purpose of an agent ecosystem port.

MVP 5 makes Gunk Buster locally installable and usable in Codex CLI, the Codex desktop app, and the Codex IDE extension without duplicating product logic or creating a second engine. The port must preserve the read-only MCP boundary and Chief approval for every mutation.

## Solution

Ship a repository-hosted Codex plugin that bundles four Gunk Buster skills, the five existing read-only MCP tools, and the non-blocking edit advisory hook. Installers add the repository's marketplace, install the plugin, and begin a fresh Codex task; they do not manually edit Codex configuration or register an MCP server.

Move portable plugin assets into platform-neutral locations and make the Claude Code and Codex manifests thin adapters over those shared assets. The Codex port does not introduce a new engine, new detector behavior, or a mutating MCP tool.

The plugin alone provides read-only diagnosis and warnings. Chief-approved mutation workflows continue to require a separately installed `gunk` CLI. The skills explain that prerequisite when it is absent instead of reaching into Codex's internal plugin cache.

## User Stories

1. As a Chief using Codex CLI, I want to install Gunk Buster from this repository, so that I can use its workflows without configuring each component manually.
2. As a Chief using the Codex desktop app, I want the same plugin to appear through a repository marketplace, so that installation is consistent with Codex's plugin model.
3. As a Chief using the Codex IDE extension, I want the installed skills and tools available in a fresh task, so that repository hygiene fits my editor workflow.
4. As a Codex user, I want one marketplace-add and plugin-install path, so that I never have to edit `config.toml` to register Gunk Buster.
5. As a Codex user, I want the plugin to launch its bundled MCP server, so that the tool path does not depend on my clone's current directory.
6. As a Codex user, I want `gunk_scan`, `gunk_radar`, `gunk_pile`, `gunk_report`, and `gunk_verify` available after installation, so that I can inspect context gunk through deterministic tools.
7. As a Codex user, I want all MCP calls to recompute fresh, so that the port cannot silently serve stale scan or radar state.
8. As a Chief, I want the MCP surface to remain read-only, so that installing the plugin cannot trap, restore, or rewrite files without my approval.
9. As a Codex user, I want a `gunk-scan` skill, so that Codex knows when to establish a structural-gunk baseline and how to read the results.
10. As a Codex user, I want a `gunk-radar` skill, so that Codex knows when to audit agent-context claims and preview mechanical fixes.
11. As a Chief, I want a `gunk-trap` skill, so that Codex recommends the correct human-run mutation command without inventing mutating MCP tools.
12. As a Chief, I want a `gunk-restore` skill, so that Codex recommends the correct recovery form and verifies the result afterward.
13. As a Chief without the CLI installed, I want mutation guidance to state the missing prerequisite and installation path, so that a plugin-cache implementation detail is never presented as a stable command.
14. As a Chief with the CLI installed, I want mutation guidance to use the ordinary `gunk` command, so that approval remains visible in my terminal.
15. As a maintainer, I want Claude Code and Codex to consume one canonical copy of each skill, so that their product guidance cannot drift.
16. As a maintainer, I want the advisory hook's executable logic shared between ports, so that stale-target warnings behave consistently.
17. As a Codex user editing a GHOST, RELIC, or DUMP target from the latest persisted scan, I want a non-blocking warning, so that I reconsider stale context before relying on it.
18. As a Codex user editing a healthy target, I want no advisory output, so that the plugin does not add noise to ordinary work.
19. As a Codex user without a persisted scan, I want the hook to silently no-op, so that editing never forces a scan.
20. As a Codex user, I want the hook always to allow the edit, so that an advisory can never become load-bearing enforcement.
21. As a Claude Code user, I want the existing plugin to keep working after assets move, so that the Codex port causes no distribution regression.
22. As a maintainer, I want a stale-build check covering the bundled MCP executable, so that a plugin installation cannot silently run code older than its source.
23. As a maintainer, I want plugin installation tested through an isolated Codex home, so that tests catch marketplace, manifest, path-resolution, and MCP-wiring failures together.
24. As a maintainer, I want Windows and POSIX path cases covered automatically, so that the portable layout does not accidentally encode one path separator.
25. As a Windows 11 user, I want CLI, desktop, and IDE smoke tests performed on the supported MVP platform, so that "works in Codex" is demonstrated in the environment where the product is being built.
26. As a future macOS or Linux user, I want manifests and Node scripts written portably, so that later certification does not require redesign.
27. As a product owner, I want a Codex Context Benchmark using identical prompts in fresh sessions, so that the milestone measures agent behavior rather than file presence.
28. As a product owner, I want the benchmark to record whether Codex activates `gunk-scan` without an explicit invocation, so that skill discoverability is observable.
29. As a product owner, I want MVP 4 bookkeeping reconciled before MVP 5 implementation begins, so that the new milestone starts from an honest baseline.
30. As a product owner, I want the Claude plugin tool-allowlist limitation to remain open independently, so that the Codex port does not hide or incorrectly claim to solve it.

## Implementation Decisions

- MVP 5 is a Codex distribution port over the existing deterministic CLI core. It adds no detector, verdict, finding, persistence, or mutation behavior.
- The supported Codex surfaces are Codex CLI, the Codex desktop app, and the Codex IDE extension.
- The plugin bundles exactly four skills: `gunk-scan`, `gunk-radar`, `gunk-trap`, and `gunk-restore`.
- The plugin bundles exactly five MCP tools: `gunk_scan`, `gunk_radar`, `gunk_pile`, `gunk_report`, and `gunk_verify`.
- The MCP server remains stateless and read-only under ADR-0006 and ADR-0007. Trap, bust, ask, restore, and radar fix remain outside MCP.
- The plugin bundles the existing non-blocking edit advisory behavior. It warns from persisted scan state and always permits the edit.
- Portable assets become platform-neutral. Skills and hook logic have one canonical source; Claude Code and Codex keep only the platform-specific manifests and event wiring they require.
- The repository exposes a repo-scoped Codex marketplace pointing to the repository-root plugin. The local acceptance path is adding that marketplace, installing `gunk-buster`, and starting a fresh task.
- Installation must not require manual MCP registration or direct edits to Codex configuration.
- Plugin installation does not install the `gunk` CLI globally. Mutation skills treat the CLI as an explicit prerequisite, report its absence clearly, and provide the documented installation guidance.
- Skills use platform-neutral language such as "terminal command" rather than assuming a Bash tool name.
- No Codex-specific auditor or bundled subagent ships in MVP 5. The Codex plugin surface has no required equivalent to the Claude `gunk-auditor` profile.
- Windows 11 is the manually certified operating system for MVP 5. Implementations remain path-portable and automated tests cover Windows and POSIX path forms.
- MVP 4 closeout precedes MVP 5 implementation: freshly verify merged work, reconcile issues #26–#36, document the `gunk-auditor` enforcement caveat, and keep #37 open.
- The missing historical MVP 4 Context Benchmark is tracked independently and does not block Codex-port implementation.

## Testing Decisions

- The primary automated seam is the installed bundle contract, not individual manifest fields in isolation.
- Given the repository marketplace and an isolated Codex home, the contract test resolves the plugin as Codex would and verifies skill discovery, MCP startup, all five MCP calls, hook behavior, and absence of manual MCP configuration.
- MCP behavior is asserted through externally visible tool results against fixture repositories, following the existing MCP fixture tests.
- Hook behavior is asserted from Codex-shaped lifecycle input: warn for a stale GHOST/RELIC/DUMP edit target, stay silent for other targets or missing state, and never block.
- Shared-asset tests verify both platform manifests resolve the same canonical skills and hook logic rather than duplicated copies.
- Build-freshness coverage verifies the bundled MCP executable matches the source used to produce it.
- Path tests exercise Windows and POSIX forms without tying assertions to implementation-specific normalization helpers.
- Manual smoke tests run in fresh Codex CLI, desktop, and IDE sessions on Windows 11. Each covers marketplace installation, skill discovery, an MCP invocation, the advisory hook, and uninstall/reinstall behavior.
- The Context Benchmark runs the same prompt in fresh pre-plugin and post-plugin Codex sessions, records wall-clock time and context usage, and records whether `gunk-scan` activated without explicit naming.
- Tests assert public behavior and installation outcomes; they do not snapshot internal Codex cache layout or depend on undocumented cache paths.

## Out of Scope

- Publication to the public Plugins Directory.
- Workspace-wide plugin sharing or administrative rollout.
- A Codex-specific auditor, agent profile, or subagent.
- Codex-only detectors, findings, commands, or mutation behavior.
- Mutating MCP tools or non-interactive Chief approval.
- Installing the CLI globally as a plugin side effect.
- Manual macOS or Linux certification for this milestone.
- Copilot distribution.
- Fixing Claude Code's plugin-scoped subagent tool-allowlist limitation.
- Closing issue #37 before the upstream limitation is resolved or a different product disposition is chosen.

## Further Notes

- The official Codex plugin model supports manifests, skills, MCP configuration, hooks, and repository marketplaces, so the port can remain a thin distribution shell.
- Public distribution can follow after the local repository marketplace and all three Codex surfaces are proven.
- The MVP 5 benchmark is a completion requirement. The missing MVP 4 benchmark remains valuable historical evidence but is not a dependency edge for implementation.
