# Install Gunk Buster

Gunk Buster has two deliberately separate installation surfaces:

- The **agent plugin** provides skills, read-only MCP diagnostics, and advisory edit warnings.
- The **CLI** provides the deterministic engine plus Chief-approved mutation commands.

Installing the plugin does not install the CLI and never grants an MCP tool permission to trap, restore, or edit files.

## Requirements

- Git repository to inspect
- Node.js 20 or later for the CLI and bundled MCP server
- A supported agent host for plugin workflows
- `pnpm` through Corepack only when installing the CLI from source

## Codex

Add this repository as a marketplace and install the plugin:

```text
codex plugin marketplace add gustavo-meilus/gunk-buster
codex plugin add gunk-buster@gunk-buster
```

Start a fresh Codex task after installation. The plugin contributes:

- `gunk-scan`, `gunk-radar`, `gunk-trap`, and `gunk-restore` skills;
- `gunk_scan`, `gunk_radar`, `gunk_pile`, `gunk_report`, and `gunk_verify` read-only MCP tools;
- a non-blocking advisory hook for files flagged by the latest persisted scan.

No manual `config.toml` or MCP registration is required.

Remove the plugin with:

```text
codex plugin remove gunk-buster@gunk-buster
```

Reinstall it to update to the current repository marketplace version.

## Claude Code

```text
/plugin marketplace add gustavo-meilus/gunk-buster
/plugin install gunk-buster@gunk-buster
```

Restart the session after installation. Remove it through Claude Code's plugin manager.

The bundled `gunk-auditor` requests a read-only allowlist. Current host behavior for plugin-loaded subagents does not enforce that allowlist as a structural boundary; see [Safety](SAFETY.md#claude-auditor-limitation).

## CLI from source

The public npm package has not been published yet. Until it is, the supported CLI installation path is a local clone:

```bash
git clone https://github.com/gustavo-meilus/gunk-buster.git
cd gunk-buster
corepack enable
pnpm install --frozen-lockfile
pnpm build
npm install --global .
```

Verify the executable:

```bash
gunk --version
gunk --help
```

To update, pull the repository, rebuild, and reinstall:

```bash
git pull --ff-only
pnpm install --frozen-lockfile
pnpm build
npm install --global .
```

Remove the global CLI with:

```bash
npm uninstall --global gunk-buster
```

## Development checkout

Run the CLI directly without a global install:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm build
node dist/cli.js --help
```

Quality checks:

```bash
pnpm typecheck
pnpm test
pnpm build
```

## Platform status

| Surface | Status |
| --- | --- |
| Windows 11 CLI | Tested |
| Codex CLI | Installed-bundle contract and interactive activation verified |
| Codex desktop | Install/remove/reinstall and fresh-task smoke verified |
| Codex IDE | Distributed by the same plugin; dedicated lifecycle run waived |
| Claude Code | Implemented; auditor allowlist limitation documented |
| macOS/Linux | Portable implementation, not manually certified for the MVP |

For the full evidence record, see [MVP 5 Codex proof](verification/mvp-5-codex-proof.md).
