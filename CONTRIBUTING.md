# Contributing to Gunk Buster

Thanks for helping keep agent context trustworthy.

## Before opening an issue

- Search existing issues.
- Confirm the report concerns agent-readable context, not source-code analysis.
- Include the Gunk Buster version, operating system, command, smallest reproducible repository shape, expected result, and actual result.
- Remove secrets and private repository content from examples.

Use the bug or feature form in [GitHub Issues](https://github.com/gustavo-meilus/gunk-buster/issues/new/choose). Security reports follow [SECURITY.md](SECURITY.md), not the public issue tracker.

## Product boundaries

Proposals must preserve these invariants:

- context-only analysis; never code or import graphs;
- local-only operation with no telemetry;
- evidence and verdicts instead of numeric scores;
- read-only MCP;
- no silent deletion or Git mutation;
- Chief approval for every risky action;
- byte-identical restoration and verification after mutation.

Read [CONTEXT.md](CONTEXT.md), [ROADMAP.md](ROADMAP.md), and the relevant [ADR](docs/adr/README.md) before changing domain behavior.

## Development setup

Requirements: Node.js 20+ and pnpm 11 through Corepack.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
```

## Pull requests

- Keep the change focused.
- Add or update tests for behavior changes.
- Update user documentation when commands, schemas, or platform behavior change.
- Preserve unrelated work in the checkout.
- Run typecheck, tests, and build before requesting review.
- Explain the evidence and safety implications of new detectors.

The issue tracker uses `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix` as workflow states. They are unrelated to Gunk Buster file verdicts.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
