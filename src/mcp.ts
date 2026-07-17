#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import packageJson from "../package.json" with { type: "json" };
import { configSchema } from "./config.js";
import { buildPileResult, pileResultSchema } from "./pile.js";
import { buildFixPlan, radar } from "./radar.js";
import { renderReportMarkdown } from "./report.js";
import { loadReceipts } from "./restore.js";
import { scan } from "./scan.js";
import { scanResultSchema, verifyResultSchema } from "./schema.js";
import { verify } from "./verify.js";

/**
 * The MCP server is a thin shell over the engine seam, same spirit as the
 * CLI: tool registration plus a call into the engine, nothing else. Tools are
 * `gunk_`-prefixed (docs/specs/mvp-4-agent-ecosystem.md) so a client running
 * other MCP servers never collides on a bare name like `scan`. Every tool
 * recomputes fresh on every call — none read or write `.gunk-buster/`
 * (ADR-0007), matching `gunk_scan`'s contract; only `trap`/`bust`/`ask`/
 * `restore`/`fix` mutate, and none of those get MCP tools (ADR-0006).
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

server.registerTool(
  "gunk_radar",
  {
    description:
      "Run the radar checks over a git repo and return the radar result of wrong-claim findings. When includeFixPlan is true, returns the --fix-plan checklist instead (the same dry-run patch-plan preview as CLI `gunk radar --fix-plan`) — a pure computation, no write either way. Always recomputes fresh — never reads or writes .gunk-buster/radar.json (ADR-0007).",
    inputSchema: {
      repoRoot: z.string().describe("Path to the repo (or any subdirectory of it) to run radar over"),
      config: configSchema
        .optional()
        .describe("Optional gunk.config.json-shaped override; omitted reads the repo's own config file, if any"),
      includeFixPlan: z
        .boolean()
        .optional()
        .describe("When true, return the FixPlanResult checklist instead of the plain RadarResult"),
    },
    // No static outputSchema here: the result is discriminated on
    // includeFixPlan (RadarResult vs. FixPlanResult are different shapes),
    // and the MCP SDK only validates output against a single object schema
    // per tool — content/structuredContent are still returned either way.
    annotations: { readOnlyHint: true },
  },
  async ({ repoRoot, config, includeFixPlan }) => {
    const result = await radar(repoRoot, config);
    const output = includeFixPlan ? buildFixPlan(result) : result;
    return {
      content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
      structuredContent: output,
    };
  },
);

server.registerTool(
  "gunk_pile",
  {
    description:
      "Group a repo's findings — fresh scan, fresh radar, and its trap receipts — into the pile view (grouped by label, with a TRAPPED group for anything trapped). Always recomputes fresh — never reads or writes .gunk-buster/scan.json or radar.json (ADR-0007).",
    inputSchema: {
      repoRoot: z.string().describe("Path to the repo (or any subdirectory of it) to pile"),
      config: configSchema
        .optional()
        .describe("Optional gunk.config.json-shaped override; omitted reads the repo's own config file, if any"),
    },
    outputSchema: pileResultSchema,
    annotations: { readOnlyHint: true },
  },
  async ({ repoRoot, config }) => {
    const scanResult = await scan(repoRoot, config);
    const radarResult = await radar(repoRoot, config);
    const receipts = await loadReceipts(scanResult.repoRoot);
    const result = buildPileResult(scanResult, radarResult, receipts);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    };
  },
);

server.registerTool(
  "gunk_report",
  {
    description:
      "Render the markdown pile report from a repo's findings — fresh scan, fresh radar, and its trap receipts — and return it as a string. Unlike CLI `gunk report`, never writes .gunk-buster/reports/report.md.",
    inputSchema: {
      repoRoot: z.string().describe("Path to the repo (or any subdirectory of it) to report on"),
      config: configSchema
        .optional()
        .describe("Optional gunk.config.json-shaped override; omitted reads the repo's own config file, if any"),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ repoRoot, config }) => {
    const scanResult = await scan(repoRoot, config);
    const radarResult = await radar(repoRoot, config);
    const receipts = await loadReceipts(scanResult.repoRoot);
    const markdown = renderReportMarkdown(scanResult, radarResult, receipts);
    return { content: [{ type: "text" as const, text: markdown }] };
  },
);

server.registerTool(
  "gunk_verify",
  {
    description:
      "Read-only damage check for broken links or agent-context mentions of a trapped path, plus informational git status. Repository-configured verify.commands are intentionally not executed over MCP.",
    inputSchema: {
      repoRoot: z.string().describe("Path to the repo (or any subdirectory of it) to verify"),
      config: configSchema
        .optional()
        .describe("Optional gunk.config.json-shaped override; omitted reads the repo's own config file, if any"),
    },
    outputSchema: verifyResultSchema,
    annotations: { readOnlyHint: true },
  },
  async ({ repoRoot, config }) => {
    const result = await verify(repoRoot, {
      ...(config === undefined ? {} : { config }),
      runConfiguredCommands: false,
    });
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    };
  },
);

await server.connect(new StdioServerTransport());
