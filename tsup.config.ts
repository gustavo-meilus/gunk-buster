import { defineConfig, type Options } from "tsup";

// An installed plugin copy never runs `pnpm install`, so mcp.js must resolve
// nothing from node_modules at runtime — bundle every runtime dependency in,
// unlike cli/index which keep resolving them normally. Exported so the
// drift-check test (tests/mcp-dist-freshness.test.ts) rebuilds with the exact
// same options rather than a hand-kept copy that could go stale.
export const mcpOptions: Options = {
  entry: {
    mcp: "src/mcp.ts",
  },
  format: ["esm"],
  target: "node20",
  platform: "node",
  noExternal: [/.*/],
  dts: false,
  sourcemap: false,
};

export default defineConfig([
  {
    entry: {
      cli: "src/cli.ts",
      index: "src/index.ts",
    },
    format: ["esm"],
    target: "node20",
    platform: "node",
    clean: true,
    dts: false,
    sourcemap: false,
  },
  mcpOptions,
]);
