# Changelog

All notable changes to Gunk Buster are documented here.

## Unreleased

### Changed

- Document paths in nested Markdown now resolve from the containing document. Add a leading `/` to references intended to resolve from the repository root. Scan and Radar judge liveness from the current Git index, including indexed directories implied by tracked descendants.

## [0.5.0] - 2026-07-17

Initial public release, implementing the five planned MVP stages: Scan, Radar, Trap, agent integrations, and the Codex distribution port.

### Added

- Deterministic, context-only scanning for orphaned documentation, generated residue, duplicate documentation, sensitive relics, and broken links.
- Radar checks for misleading commands, dead paths, package-manager drift, and oversized agent context.
- Evidence-based labels and verdicts without numeric repository scores.
- Human-approved trap, batch bust, ask, restore, fix, and damage-verification workflows with external vault containment and receipts.
- Read-only MCP tools for scan, radar, pile, report, and verify.
- Claude Code and Codex plugins with skills and non-blocking edit advisories.
- Installed-bundle, CLI, and desktop proof records, including automatic unnamed-prompt activation through `gunk_radar`.
- Plugin-first README, installation and CLI references, safety documentation, community health files, and project branding.

### Safety boundaries

- Application code, import graphs, AST analysis, CI enforcement, cloud processing, telemetry, numeric scores, and automatic deletion remain out of scope.
- MCP exposes diagnostics only; configured verification commands and every mutation remain explicit CLI workflows.
- Every risky mutation requires Chief approval and supports byte-identical restoration.

### Known limitations

- Windows 11 is the manually certified platform; macOS and Linux are portable but not equivalently certified.
- The Claude Code `gunk-auditor` requests a read-only allowlist, but current plugin-loaded subagent behavior does not structurally enforce it. The limitation is tracked in [issue #37](https://github.com/gustavo-meilus/gunk-buster/issues/37).
- Benchmark results are proof-of-concept observations, not universal performance guarantees; results vary by model, effort, repository, and cache behavior.
