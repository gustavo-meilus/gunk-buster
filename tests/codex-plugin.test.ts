import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { execFileSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { scanResultSchema } from "../src/schema.js";
import { createFixtureRepo, removeDir } from "./helpers/fixture.js";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));

interface CodexPluginManifest {
  name: string;
  skills: string;
  mcpServers: string;
}

describe("Codex installed bundle contract (#40)", () => {
  let codexHome: string;
  let marketplaceRoot: string;
  let fixtureRepo: string;
  let installedRoot: string;
  let installedPlugins: Array<{ name: string; enabled: boolean }>;

  beforeAll(async () => {
    execFileSync("pnpm", ["build"], { cwd: packageRoot, stdio: "pipe", shell: true });
    codexHome = await mkdtemp(path.join(os.tmpdir(), "gunk-codex-home-"));
    marketplaceRoot = await mkdtemp(path.join(os.tmpdir(), "gunk-codex-marketplace-"));
    for (const entry of [".claude-plugin", ".codex-plugin", ".mcp.json", "dist", "hooks", "skills"]) {
      await cp(path.join(packageRoot, entry), path.join(marketplaceRoot, entry), { recursive: true });
    }
    fixtureRepo = await createFixtureRepo("orphan-docs");
    const env = { ...process.env, CODEX_HOME: codexHome };
    const added = JSON.parse(
      execFileSync("codex", ["plugin", "marketplace", "add", marketplaceRoot, "--json"], {
        env,
        encoding: "utf8",
      }),
    ) as { marketplaceName: string };
    const installed = JSON.parse(
      execFileSync("codex", ["plugin", "add", `gunk-buster@${added.marketplaceName}`, "--json"], {
        env,
        encoding: "utf8",
      }),
    ) as { installedPath: string };
    installedRoot = installed.installedPath;
    installedPlugins = (
      JSON.parse(execFileSync("codex", ["plugin", "list", "--json"], { env, encoding: "utf8" })) as {
        installed: Array<{ name: string; enabled: boolean }>;
      }
    ).installed;
  });

  afterAll(async () => {
    await removeDir(fixtureRepo);
    await rm(codexHome, { recursive: true, force: true });
    await rm(marketplaceRoot, { recursive: true, force: true });
  });

  it("adds the repo marketplace and installs the root plugin in an isolated Codex home", async () => {
    expect(installedPlugins).toContainEqual(expect.objectContaining({ name: "gunk-buster", enabled: true }));
    const config = await readFile(path.join(codexHome, "config.toml"), "utf8");
    expect(config).not.toContain("mcp_servers");
    const servers = JSON.parse(
      execFileSync("codex", ["mcp", "list", "--json"], {
        env: { ...process.env, CODEX_HOME: codexHome },
        encoding: "utf8",
      }),
    ) as Array<{ name: string; transport: { args: string[] } }>;
    expect(servers).toContainEqual(
      expect.objectContaining({
        name: "gunk-buster",
        transport: expect.objectContaining({ args: ["${PLUGIN_ROOT}/dist/mcp.js"] }),
      }),
    );
  });

  it("exposes the canonical gunk-scan skill through both platform adapters", async () => {
    const codex = JSON.parse(
      await readFile(path.join(installedRoot, ".codex-plugin", "plugin.json"), "utf8"),
    ) as CodexPluginManifest;
    const claude = JSON.parse(
      await readFile(path.join(packageRoot, ".claude-plugin", "plugin.json"), "utf8"),
    ) as { skills: string[]; mcpServers: string };

    expect(codex.skills).toBe("./skills/");
    expect(claude.skills).toContain("./skills/gunk-scan/");
    await expect(readFile(path.join(installedRoot, "skills", "gunk-scan", "SKILL.md"), "utf8")).resolves.toContain(
      "name: gunk-scan",
    );

    const claudeMcp = JSON.parse(
      await readFile(path.resolve(packageRoot, claude.mcpServers), "utf8"),
    ) as { mcpServers: { "gunk-buster": { command: string; args: string[] } } };
    const claudeServer = claudeMcp.mcpServers["gunk-buster"];
    const claudeClient = new Client({ name: "gunk-claude-regression-test", version: "0.0.0" });
    try {
      await claudeClient.connect(
        new StdioClientTransport({
          command: claudeServer.command,
          args: claudeServer.args.map((arg) => arg.replace("${CLAUDE_PLUGIN_ROOT}", packageRoot)),
        }),
      );
      await expect(claudeClient.listTools()).resolves.toMatchObject({ tools: expect.any(Array) });
    } finally {
      await claudeClient.close();
    }
  });

  it("starts the bundled MCP server from the public plugin-root path and scans a fixture repo", async () => {
    const manifest = JSON.parse(
      await readFile(path.join(installedRoot, ".codex-plugin", "plugin.json"), "utf8"),
    ) as CodexPluginManifest;
    const mcpConfig = JSON.parse(
      await readFile(path.resolve(installedRoot, manifest.mcpServers), "utf8"),
    ) as { mcpServers: { "gunk-buster": { command: string; args: string[] } } };
    const server = mcpConfig.mcpServers["gunk-buster"];
    expect(server.args).toEqual(["${PLUGIN_ROOT}/dist/mcp.js"]);
    const args = server.args.map((arg) => arg.replace("${PLUGIN_ROOT}", installedRoot));
    const client = new Client({ name: "gunk-codex-bundle-test", version: "0.0.0" });

    try {
      await client.connect(new StdioClientTransport({ command: server.command, args }));
      const response = await client.callTool({ name: "gunk_scan", arguments: { repoRoot: fixtureRepo } });
      const result = scanResultSchema.parse(response.structuredContent);
      expect(result.findings.some((finding) => finding.type === "file" && finding.path === "docs/old-plan.md")).toBe(
        true,
      );
    } finally {
      await client.close();
    }
  });

  it("keeps the public plugin-root asset path portable across POSIX and Windows hosts", async () => {
    const config = await readFile(path.join(installedRoot, ".mcp.json"), "utf8");
    expect(JSON.parse(config).mcpServers["gunk-buster"].args).toEqual(["${PLUGIN_ROOT}/dist/mcp.js"]);
    expect(path.posix.join("/opt/gunk-buster", "dist/mcp.js")).toBe("/opt/gunk-buster/dist/mcp.js");
    expect(path.win32.join("C:\\plugins\\gunk-buster", "dist/mcp.js")).toBe(
      "C:\\plugins\\gunk-buster\\dist\\mcp.js",
    );
  });
});
