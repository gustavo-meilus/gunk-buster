## What changed

<!-- Describe the observable behavior and why it belongs in Gunk Buster. -->

## Evidence and safety

<!-- For detector changes, state the evidence rule, confidence, protections, and false-positive controls. -->

- [ ] Context-only scope is preserved; no source-code or import analysis was added.
- [ ] MCP remains read-only and mutations remain Chief-approved CLI workflows.
- [ ] No telemetry, network service, silent deletion, or Git mutation was added.

## Verification

- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] User documentation was updated when public behavior changed.
