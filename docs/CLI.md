# Gunk CLI reference

The CLI is a thin shell over the deterministic TypeScript engine. Run commands from anywhere inside the Git repository you want to inspect.

## Read workflow

```bash
gunk scan
gunk radar
gunk pile
gunk report
```

### `gunk scan`

Builds the structural repository graphs, finds candidate files and broken links, and persists `.gunk-buster/scan.json`.

```bash
gunk scan
gunk scan --json
```

Successful scans exit 0 whether findings exist or not. A non-zero exit means the tool could not complete the scan.

### `gunk radar`

Checks documentation and agent-context claims against repository facts, then persists `.gunk-buster/radar.json`.

```bash
gunk radar
gunk radar --json
gunk radar --fix-plan
```

`--fix-plan` previews suggestion-carrying claim findings. Applying suggestions is a separate mutation workflow.

### `gunk pile`

Loads the persisted scan, optional Radar results, and trap receipts, then groups findings by label.

```bash
gunk pile
gunk pile --json
```

Pile does not rescan. Run `gunk scan` and `gunk radar` again when the repository changes.

### `gunk report`

Writes a Markdown version of the pile to `.gunk-buster/reports/report.md`.

```bash
gunk report
gunk report --json
```

## Mutation workflow

All mutations are visible CLI operations. MCP never exposes these commands.

### `gunk trap <path>`

Moves one approved scan finding to the external vault and writes a receipt. The file must still match the hash recorded by the latest scan.

```bash
gunk trap docs/old-plan.md
```

### `gunk bust safe`

Shows every `SAFE` finding, asks for one batch confirmation, traps eligible files, and verifies the result.

```bash
gunk bust safe
gunk bust safe --yes
```

`--yes` does not bypass protection rules or mandatory `ASK_CHIEF` decisions.

### `gunk ask`

Walks `PROPOSE` findings first, then `ASK_CHIEF` findings. For each item the Chief can trap, keep, skip, or quit.

```bash
gunk ask
```

A keep decision is pinned to the current content hash and expires when the file changes.

### `gunk radar --fix`

Displays suggestion-carrying Radar edits as a single confirmation list, applies approved mechanical replacements, and verifies the result.

```bash
gunk radar --fix
gunk radar --fix --yes
```

### `gunk except <path> <check> <token> --line <line> --reason <reason>`

Records a Chief decision that one exact persisted Radar claim is legitimate.
The command verifies that the persisted finding is still active and that its
document has not changed, then writes a Git-tracked, content-pinned exception.
The claim remains visible as `EXCEPTED`, with its reason, but leaves active
counts and fix plans.

```bash
gunk except README.md package-manager-drift "npm install" --line 3 --reason "Intentional migration example"
```

Run `gunk radar` again after editing the document: the changed content expires
the exception and restores the active claim. Exceptions cannot be created from
inline comments, broad token allowlists, or whole-document exclusions.

### `gunk restore <reference>`

Restores a trapped file byte-for-byte using its receipt. Use `gunk restore --help` for accepted path and receipt reference forms.

### `gunk verify`

Checks damage attributable to the latest mutation: remaining links or agent-context references, Git status, and optional configured commands.

```bash
gunk verify
gunk verify --json
```

Pre-existing broken links are informational. Verify answers “did this mutation break anything?”, not “is this repository perfect?”

## Configuration

Gunk Buster is zero-config. When present, `gunk.config.json` may adjust:

- `ageThresholdDays` and `recencyWindowDays`;
- `protectedPaths`;
- Radar checks, exclusions, and context budget;
- external `trap.vaultRoot`;
- `verify.commands`;
- output `voice`: `chief` or `professional`.

`references.copies` declares intentional document derivatives. Each entry has
`canonical`, `derivative`, and a non-empty `reason`. When both paths exist, it
proves only the derivative live and suppresses ECHO only for that declared
pair. A missing endpoint is reported as a broken reference; it grants neither
liveness nor suppression.

The repository's current [configuration](../gunk.config.json) is a useful example of excluding fixtures, raw reference material, specs, and agent-process docs from Radar while preserving them in Git.

## Persistent files

```text
.gunk-buster/
├── scan.json       structural scan index
├── radar.json      claim findings
├── reports/        rendered reports
├── keeps.json      content-pinned Chief decisions, when present
├── claim-exceptions.json  content-pinned Radar claim decisions, when present
└── receipts/       trap and restore audit records, when present
```

The external vault defaults to a sibling location outside the repository so coding agents cannot continue reading trapped context. See [Safety](SAFETY.md).

## Machine output

Non-interactive commands support `--json` and emit versioned documents. Consumers should validate `schemaVersion` and reject newer unsupported schemas rather than guessing.

For exact options in the installed version, use:

```bash
gunk <command> --help
```
