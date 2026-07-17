# Security policy

## Supported versions

Gunk Buster is pre-1.0. Security fixes are applied to the latest released version and the `main` branch. Older development snapshots are not supported.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability or include private repository content in a report.

Prefer GitHub's **Report a vulnerability** flow under the repository's Security tab. If private vulnerability reporting is unavailable, email `gmeilus@outlook.com` with:

- affected version or commit;
- impact and realistic attack scenario;
- minimal reproduction;
- whether the issue affects the CLI, MCP server, plugin, hook, vault, or receipt handling;
- any suggested mitigation.

You should receive an acknowledgement within seven days. Coordinated disclosure timing will be agreed after the report is reproduced and assessed.

## Security boundaries

The five MCP tools are read-only. MCP verification suppresses repository-configured shell commands; those run only through the explicitly invoked CLI workflow. Trap, restore, batch bust, interactive ask, and Radar fixes remain Chief-approved CLI workflows. Advisory hooks never block edits. See the complete [safety model](docs/SAFETY.md).
