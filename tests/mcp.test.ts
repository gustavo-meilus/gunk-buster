import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { buildPileResult, pileResultSchema } from "../src/pile.js";
import { buildFixPlan, radar } from "../src/radar.js";
import { renderReportMarkdown } from "../src/report.js";
import { loadReceipts } from "../src/restore.js";
import { scan } from "../src/scan.js";
import { scanResultSchema, verifyResultSchema } from "../src/schema.js";
import { verify } from "../src/verify.js";
import { createFixtureRepo, createTempDir, removeDir } from "./helpers/fixture.js";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const mcpPath = path.join(packageRoot, "dist", "mcp.js");

async function connectClient(): Promise<Client> {
  const client = new Client({ name: "gunk-mcp-test-client", version: "0.0.0" });
  const transport = new StdioClientTransport({ command: process.execPath, args: [mcpPath] });
  await client.connect(transport);
  return client;
}

function expectNoGunkBusterDir(repo: string): void {
  expect(existsSync(path.join(repo, ".gunk-buster"))).toBe(false);
}

describe("gunk-mcp — read-only tools (#27, #28)", () => {
  let repo: string;
  let client: Client;

  beforeAll(async () => {
    execSync("pnpm build", { cwd: packageRoot, stdio: "pipe" });
    repo = await createFixtureRepo("clean-repo");
  });

  afterAll(async () => {
    await removeDir(repo);
  });

  afterEach(async () => {
    await client?.close();
  });

  it("lists all five gunk_* tools", async () => {
    client = await connectClient();

    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual([
      "gunk_scan",
      "gunk_radar",
      "gunk_pile",
      "gunk_report",
      "gunk_verify",
    ]);
  });

  describe("gunk_scan", () => {
    it("calls scan() fresh and returns a schema-valid ScanResult, with no .gunk-buster/ file written", async () => {
      client = await connectClient();

      const response = await client.callTool({ name: "gunk_scan", arguments: { repoRoot: repo } });

      const expected = await scan(repo);
      const structuredContent = response.structuredContent as Record<string, unknown>;
      const result = scanResultSchema.parse(structuredContent);
      expect({ ...result, scannedAt: "<scannedAt>" }).toEqual({
        ...expected,
        scannedAt: "<scannedAt>",
      });

      expectNoGunkBusterDir(repo);
    });
  });

  describe("gunk_radar", () => {
    it("calls radar() fresh and returns a schema-valid RadarResult, with no .gunk-buster/ file written", async () => {
      client = await connectClient();

      const response = await client.callTool({ name: "gunk_radar", arguments: { repoRoot: repo } });

      const expected = await radar(repo);
      const result = response.structuredContent as Record<string, unknown>;
      expect({ ...result, scannedAt: "<scannedAt>" }).toEqual({
        ...expected,
        scannedAt: "<scannedAt>",
      });

      expectNoGunkBusterDir(repo);
    });

    it("returns the buildFixPlan() checklist instead of the plain RadarResult when includeFixPlan is true", async () => {
      const fixtureRepo = await createFixtureRepo("pm-drift-field");
      try {
        client = await connectClient();

        const response = await client.callTool({
          name: "gunk_radar",
          arguments: { repoRoot: fixtureRepo, includeFixPlan: true },
        });

        const expected = buildFixPlan(await radar(fixtureRepo));
        const result = response.structuredContent as Record<string, unknown>;
        expect(result.items).not.toEqual([]);
        expect({ ...result, scannedAt: "<scannedAt>" }).toEqual({
          ...expected,
          scannedAt: "<scannedAt>",
        });

        expectNoGunkBusterDir(fixtureRepo);
      } finally {
        await removeDir(fixtureRepo);
      }
    });
  });

  describe("gunk_pile", () => {
    it("calls buildPileResult() over fresh scan/radar/receipts, with no .gunk-buster/ file written", async () => {
      client = await connectClient();

      const response = await client.callTool({ name: "gunk_pile", arguments: { repoRoot: repo } });

      const scanResult = await scan(repo);
      const radarResult = await radar(repo);
      const receipts = await loadReceipts(scanResult.repoRoot);
      const expected = buildPileResult(scanResult, radarResult, receipts);
      const structuredContent = response.structuredContent as Record<string, unknown>;
      const result = pileResultSchema.parse(structuredContent);
      expect({ ...result, scannedAt: "<scannedAt>", radarScannedAt: "<radarScannedAt>" }).toEqual({
        ...expected,
        scannedAt: "<scannedAt>",
        radarScannedAt: "<radarScannedAt>",
      });

      expectNoGunkBusterDir(repo);
    });
  });

  describe("gunk_report", () => {
    it("calls renderReportMarkdown() over fresh scan/radar/receipts and returns markdown text, with no .gunk-buster/ file written", async () => {
      client = await connectClient();

      const response = await client.callTool({ name: "gunk_report", arguments: { repoRoot: repo } });

      const scanResult = await scan(repo);
      const radarResult = await radar(repo);
      const receipts = await loadReceipts(scanResult.repoRoot);
      const expected = renderReportMarkdown(scanResult, radarResult, receipts);
      const [content] = response.content as Array<{ type: string; text: string }>;
      const normalizeTimestamps = (markdown: string): string =>
        markdown.replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, "<timestamp>");
      expect(content).toMatchObject({ type: "text" });
      expect(normalizeTimestamps(content?.text ?? "")).toBe(normalizeTimestamps(expected));
      expect(response.structuredContent).toBeUndefined();

      expectNoGunkBusterDir(repo);
    });
  });

  describe("gunk_verify", () => {
    it("calls verify() fresh and returns a schema-valid VerifyResult, with no .gunk-buster/ file written", async () => {
      client = await connectClient();

      const response = await client.callTool({ name: "gunk_verify", arguments: { repoRoot: repo } });

      const expected = await verify(repo);
      const structuredContent = response.structuredContent as Record<string, unknown>;
      const result = verifyResultSchema.parse(structuredContent);
      expect({ ...result, verifiedAt: "<verifiedAt>" }).toEqual({
        ...expected,
        verifiedAt: "<verifiedAt>",
      });

      expectNoGunkBusterDir(repo);
    });
  });
});

describe("gunk-mcp — runs from a directory with no node_modules (#36)", () => {
  let repo: string;
  let noNodeModulesDir: string;
  let copiedMcpPath: string;
  let client: Client;

  beforeAll(async () => {
    // Rebuilds independently rather than relying on the describe block above
    // having already run in this file — a copy proves dist/mcp.js resolves
    // nothing from a node_modules tree, simulating an installed plugin's
    // cache (which never runs one), regardless of test filtering/ordering.
    execSync("pnpm build", { cwd: packageRoot, stdio: "pipe" });
    repo = await createFixtureRepo("clean-repo");
    noNodeModulesDir = await createTempDir();
    copiedMcpPath = path.join(noNodeModulesDir, "mcp.js");
    await copyFile(mcpPath, copiedMcpPath);
  });

  afterAll(async () => {
    await removeDir(repo);
    await removeDir(noNodeModulesDir);
  });

  afterEach(async () => {
    await client?.close();
  });

  it("all five gunk_* tools are callable end-to-end", async () => {
    client = new Client({ name: "gunk-mcp-no-node-modules-client", version: "0.0.0" });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [copiedMcpPath],
      cwd: noNodeModulesDir,
    });
    await client.connect(transport);

    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual([
      "gunk_scan",
      "gunk_radar",
      "gunk_pile",
      "gunk_report",
      "gunk_verify",
    ]);

    for (const name of ["gunk_scan", "gunk_radar", "gunk_pile", "gunk_verify"] as const) {
      const response = await client.callTool({ name, arguments: { repoRoot: repo } });
      expect(response.isError).not.toBe(true);
      expect(response.structuredContent).toBeDefined();
    }

    const reportResponse = await client.callTool({ name: "gunk_report", arguments: { repoRoot: repo } });
    expect(reportResponse.isError).not.toBe(true);
    expect(reportResponse.content).toBeDefined();
  });
});
