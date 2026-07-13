#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import packageJson from "../package.json" with { type: "json" };
import { configSchema } from "./config.js";
import { scan } from "./scan.js";
import { scanResultSchema } from "./schema.js";

/**
 * The MCP server is a thin shell over the engine seam, same spirit as the
 * CLI: tool registration plus a call into `scan()`, nothing else. Tools are
 * `gunk_`-prefixed (docs/specs/mvp-4-agent-ecosystem.md) so a client running
 * other MCP servers never collides on a bare name like `scan`.
 */

const server = new McpServer({ name: "gunk-buster", version: packageJson.version });

server.registerTool(
  "gunk_scan",
  {
    description:
      "Scan a git repo for context gunk (stale, agent-readable repo residue) and return the scan result. Always recomputes fresh — never reads or writes .gunk-buster/scan.json (ADR-0007).",
    inputSchema: {
      repoRoot: z.string().describe("Path to the repo (or any subdirectory of it) to scan"),
      config: configSchema
        .optional()
        .describe("Optional gunk.config.json-shaped override; omitted reads the repo's own config file, if any"),
    },
    outputSchema: scanResultSchema,
    annotations: { readOnlyHint: true },
  },
  async ({ repoRoot, config }) => {
    const result = await scan(repoRoot, config);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    };
  },
);

await server.connect(new StdioServerTransport());
