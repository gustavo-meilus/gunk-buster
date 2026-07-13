import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { scan } from "../src/scan.js";
import { scanResultSchema } from "../src/schema.js";
import { createFixtureRepo, removeDir } from "./helpers/fixture.js";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const mcpPath = path.join(packageRoot, "dist", "mcp.js");

async function connectClient(): Promise<Client> {
  const client = new Client({ name: "gunk-mcp-test-client", version: "0.0.0" });
  const transport = new StdioClientTransport({ command: process.execPath, args: [mcpPath] });
  await client.connect(transport);
  return client;
}

describe("gunk-mcp — gunk_scan tool (walking skeleton, #27)", () => {
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

    expect(existsSync(path.join(repo, ".gunk-buster"))).toBe(false);
  });

  it("lists exactly one tool, gunk_scan", async () => {
    client = await connectClient();

    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual(["gunk_scan"]);
  });
});
