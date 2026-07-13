import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 120_000,
    // Every suite that spawns the built CLI/MCP binary defensively rebuilds
    // in its own beforeAll (cli.test.ts, mcp.test.ts); tsup's `clean: true`
    // briefly empties dist/ mid-rebuild, so two files racing their own
    // builds in parallel workers can transiently break each other's spawn.
    fileParallelism: false,
  },
});
