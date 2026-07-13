import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    cli: "src/cli.ts",
    index: "src/index.ts",
    mcp: "src/mcp.ts",
  },
  format: ["esm"],
  target: "node20",
  platform: "node",
  clean: true,
  dts: false,
  sourcemap: false,
});
