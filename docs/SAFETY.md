# Gunk Buster safety model

Gunk Buster treats stale context as a safety problem, not an excuse for aggressive cleanup.

## Trust boundaries

1. The deterministic engine judges only the candidate universe: docs, agent-context files, assets referenced by docs, and generated artifacts.
2. Code, lockfiles, Git internals, and configured protected paths are outside or constrained by policy.
3. MCP exposes only fresh, read-only diagnostics: scan, radar, pile, report, and verify.
4. Mutations stay in the terminal and require Chief approval.
5. Gunk Buster never stages, commits, pushes, or silently deletes files.

## Evidence before verdict

Detectors emit explicit evidence with ordinal confidence:

- `CERTAIN`: direct repository fact;
- `STRONG`: high-confidence structural evidence;
- `WEAK`: useful but insufficient evidence.

Protections then constrain the action. A sensitive or recent file can be labeled as gunk while its verdict is capped at `ASK_CHIEF`. Gunk Buster never collapses those facts into a numeric score.

## External vault

`gunk trap` moves an approved file outside the repository, by default under:

```text
../.gunk-buster/traps/<repository>/<trap-id>/
```

An in-repository `.old`, `.trash`, or `archive` directory is not containment: coding agents may still read it. Gunk Buster refuses a vault path that resolves inside the repository.

## Receipts and restoration

Every successful trap writes a receipt recording:

- original path;
- content hash;
- label and evidence;
- trap time and vault location;
- exact restore command;
- current trapped/restored status.

Before trapping, the CLI hashes the file again. If it changed since the scan, the operation refuses and asks for a fresh judgment. Restore verifies byte identity against the receipt.

## Verification

Mutation workflows finish with `gunk verify`. It checks for damage caused by the mutation:

- links to the trapped path;
- agent-context references to the trapped path;
- Git status;
- user-configured verification commands.

Existing repository problems do not become false mutation failures.

## Read-only MCP boundary

The MCP server exposes exactly five tools:

- `gunk_scan`
- `gunk_radar`
- `gunk_pile`
- `gunk_report`
- `gunk_verify`

There is no MCP tool for trap, restore, bust, ask, or fix. Agent integrations can recommend the stable CLI command, but the Chief runs and approves it.

`gunk_verify` performs only its built-in diagnostic checks over MCP. It deliberately suppresses repository-configured `verify.commands`; those shell commands run only through the explicitly invoked CLI workflow.

## Advisory hooks

Edit hooks read the latest persisted scan and warn when an agent touches a flagged file. They never force a scan, block an edit, or become a safety control. A healthy file and a repository without scan state produce no warning.

## Claude auditor limitation

The Claude Code `gunk-auditor` profile requests only read tools and explicitly forbids Bash, Edit, and Write in its instructions. Current plugin-loaded subagent behavior does not enforce that requested allowlist as a structural boundary. Therefore:

- the auditor profile is advisory, not a sandbox;
- the MCP tools remain structurally read-only;
- no README or plugin copy may claim the auditor cannot write;
- the limitation remains tracked in [issue #37](https://github.com/gustavo-meilus/gunk-buster/issues/37).

## Permanently out of scope

- code, import, AST, or dead-code analysis;
- CI enforcement, PR comments, or remote guard services;
- built-in cloud processing, network calls, or telemetry (Chief-configured CLI verification commands remain ordinary local shell commands and may have their own effects);
- automatic deletion;
- numeric repository or finding scores;
- mutating MCP tools.

These are product boundaries, not missing features. See the binding [architecture decisions](adr/README.md) and [roadmap](../ROADMAP.md).
