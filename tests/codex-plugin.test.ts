import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { execFileSync, spawnSync } from "node:child_process";
import { chmod, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pileResultSchema } from "../src/pile.js";
import { radarResultSchema, scanResultSchema, verifyResultSchema } from "../src/schema.js";
import { createFixtureRepo, removeDir } from "./helpers/fixture.js";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));

interface CodexPluginManifest {
  name: string;
  skills: string;
  mcpServers: string;
  hooks: string;
}

function guidanceSection(guidance: string, heading: "CLI available" | "CLI unavailable"): string {
  const match = guidance.match(new RegExp(`### ${heading}\\n\\n([\\s\\S]*?)(?=\\n### |\\n## )`));
  if (!match?.[1]) throw new Error(`Missing ${heading} guidance`);
  return match[1];
}

function cliGuidanceOutcome(guidance: string, lookupPath: string): string {
  const result = spawnSync("gunk", ["--version"], {
    env: { ...process.env, PATH: lookupPath },
    encoding: "utf8",
  });
  return guidanceSection(guidance, result.status === 0 ? "CLI available" : "CLI unavailable");
}

async function connectInstalledClient(
  installedRoot: string,
  name: string,
): Promise<{ client: Client; serverArgs: string[] }> {
  const manifest = JSON.parse(
    await readFile(path.join(installedRoot, ".codex-plugin", "plugin.json"), "utf8"),
  ) as CodexPluginManifest;
  const mcpConfig = JSON.parse(
    await readFile(path.resolve(installedRoot, manifest.mcpServers), "utf8"),
  ) as { mcpServers: { "gunk-buster": { command: string; args: string[]; cwd?: string } } };
  const server = mcpConfig.mcpServers["gunk-buster"];
  const client = new Client({ name, version: "0.0.0" });
  await client.connect(
    new StdioClientTransport({
      command: server.command,
      args: server.args,
      ...(server.cwd ? { cwd: path.resolve(installedRoot, server.cwd) } : {}),
    }),
  );
  return { client, serverArgs: server.args };
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
    ) as Array<{ name: string; transport: { args: string[]; cwd: string | null } }>;
    const server = servers.find((candidate) => candidate.name === "gunk-buster");
    expect(server?.transport.args).toEqual(["./dist/mcp.js"]);
    expect(path.resolve(server?.transport.cwd ?? "")).toBe(path.resolve(installedRoot));
  });

  it("exposes the stale-target advisory through Codex plugin lifecycle wiring", async () => {
    const manifest = JSON.parse(
      await readFile(path.join(installedRoot, ".codex-plugin", "plugin.json"), "utf8"),
    ) as CodexPluginManifest;
    expect(manifest.hooks).toBe("./hooks/hooks.json");

    const hooks = JSON.parse(await readFile(path.resolve(installedRoot, manifest.hooks), "utf8")) as {
      hooks: { PreToolUse: Array<{ matcher: string; hooks: Array<{ type: string; command: string }> }> };
    };
    expect(hooks.hooks.PreToolUse).toContainEqual(
      expect.objectContaining({
        matcher: "apply_patch",
        hooks: [
          expect.objectContaining({
            type: "command",
            command: 'node "${PLUGIN_ROOT}/hooks/pre-edit-warn.mjs"',
          }),
        ],
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

  it("exposes the canonical gunk-radar skill through both platform adapters", async () => {
    const codex = JSON.parse(
      await readFile(path.join(installedRoot, ".codex-plugin", "plugin.json"), "utf8"),
    ) as CodexPluginManifest;
    const claude = JSON.parse(
      await readFile(path.join(packageRoot, ".claude-plugin", "plugin.json"), "utf8"),
    ) as { skills: string[] };

    expect(codex.skills).toBe("./skills/");
    expect(claude.skills).toContain("./skills/gunk-radar/");
    const installedRadar = await readFile(path.join(installedRoot, "skills", "gunk-radar", "SKILL.md"), "utf8");
    const canonicalRadar = await readFile(path.join(packageRoot, "skills", "gunk-radar", "SKILL.md"), "utf8");
    expect(installedRadar).toBe(canonicalRadar);
  });

  it.each(["gunk-trap", "gunk-restore"])(
    "exposes the canonical %s mutation guidance through both platform adapters",
    async (skillName) => {
      const codex = JSON.parse(
        await readFile(path.join(installedRoot, ".codex-plugin", "plugin.json"), "utf8"),
      ) as CodexPluginManifest;
      const claude = JSON.parse(
        await readFile(path.join(packageRoot, ".claude-plugin", "plugin.json"), "utf8"),
      ) as { skills: string[] };

      expect(codex.skills).toBe("./skills/");
      expect(claude.skills).toContain(`./skills/${skillName}/`);
      const installedSkill = await readFile(path.join(installedRoot, "skills", skillName, "SKILL.md"), "utf8");
      const canonicalSkill = await readFile(path.join(packageRoot, "skills", skillName, "SKILL.md"), "utf8");
      expect(installedSkill).toBe(canonicalSkill);
    },
  );

  it.each([
    ["gunk-trap", "gunk trap"],
    ["gunk-restore", "gunk restore"],
    ["gunk-radar", "gunk radar --fix"],
  ])("%s gives CLI-present and CLI-absent outcomes from isolated command lookup", async (skillName, command) => {
      const fakeBin = await mkdtemp(path.join(os.tmpdir(), "gunk-cli-guidance-"));
      const guidance = await readFile(path.join(installedRoot, "skills", skillName, "SKILL.md"), "utf8");
      const executable = path.join(fakeBin, process.platform === "win32" ? "gunk.exe" : "gunk");
      await cp(process.execPath, executable);
      if (process.platform !== "win32") await chmod(executable, 0o755);

      try {
        const available = cliGuidanceOutcome(guidance, fakeBin);
        expect(available).toContain(command);
        expect(available).not.toContain("npm install");

        const unavailable = cliGuidanceOutcome(guidance, path.join(fakeBin, "missing"));
        expect(unavailable).toMatch(/separately\s+installed prerequisite/);
        expect(unavailable).toContain("`npm install --global gunk-buster`");
        expect(unavailable).not.toContain(command);
        expect(guidance).not.toMatch(/Bash|PLUGIN_ROOT|plugin.cache|plugin-cache/i);
      } finally {
        await rm(fakeBin, { recursive: true, force: true });
      }
    });

  it("starts the bundled MCP server from the public plugin-root path and scans a fixture repo", async () => {
    const { client, serverArgs } = await connectInstalledClient(installedRoot, "gunk-codex-bundle-test");

    try {
      expect(serverArgs).toEqual(["./dist/mcp.js"]);
      const response = await client.callTool({ name: "gunk_scan", arguments: { repoRoot: fixtureRepo } });
      const result = scanResultSchema.parse(response.structuredContent);
      expect(result.findings.some((finding) => finding.type === "file" && finding.path === "docs/old-plan.md")).toBe(
        true,
      );
    } finally {
      await client.close();
    }
  });

  it("calls every read-only diagnostic through the installed server without consuming persisted state", async () => {
    const { client } = await connectInstalledClient(installedRoot, "gunk-codex-diagnostics-test");
    const stateDir = path.join(fixtureRepo, ".gunk-buster");
    const scanSentinel = "persisted scan must remain untouched\n";
    const radarSentinel = "persisted radar must remain untouched\n";
    await mkdir(stateDir, { recursive: true });
    await writeFile(path.join(stateDir, "scan.json"), scanSentinel);
    await writeFile(path.join(stateDir, "radar.json"), radarSentinel);
    await writeFile(path.join(fixtureRepo, "package.json"), '{"packageManager":"pnpm@11.11.0"}\n');

    try {
      const { tools } = await client.listTools();
      expect(tools.map((tool) => tool.name)).toEqual([
        "gunk_scan",
        "gunk_radar",
        "gunk_pile",
        "gunk_report",
        "gunk_verify",
      ]);

      const firstScan = scanResultSchema.parse(
        (await client.callTool({ name: "gunk_scan", arguments: { repoRoot: fixtureRepo } })).structuredContent,
      );

      const firstRadar = radarResultSchema.parse(
        (await client.callTool({ name: "gunk_radar", arguments: { repoRoot: fixtureRepo } })).structuredContent,
      );

      const firstPile = pileResultSchema.parse(
        (await client.callTool({ name: "gunk_pile", arguments: { repoRoot: fixtureRepo } })).structuredContent,
      );

      const firstReport = await client.callTool({ name: "gunk_report", arguments: { repoRoot: fixtureRepo } });
      const firstReportText = (firstReport.content as Array<{ type: string; text: string }>)[0]?.text;

      const firstVerify = verifyResultSchema.parse(
        (await client.callTool({ name: "gunk_verify", arguments: { repoRoot: fixtureRepo } })).structuredContent,
      );

      await writeFile(path.join(fixtureRepo, "CLAUDE.md"), "Run `npm install` before development.\n");
      await writeFile(path.join(fixtureRepo, "docs", "old-plan.md"), "# Superseded plan, freshly changed\n");

      const secondScan = scanResultSchema.parse(
        (await client.callTool({ name: "gunk_scan", arguments: { repoRoot: fixtureRepo } })).structuredContent,
      );
      expect(secondScan.findings).not.toEqual(firstScan.findings);

      const secondRadar = radarResultSchema.parse(
        (await client.callTool({ name: "gunk_radar", arguments: { repoRoot: fixtureRepo } })).structuredContent,
      );
      expect(secondRadar.findings).not.toEqual(firstRadar.findings);

      const secondPile = pileResultSchema.parse(
        (await client.callTool({ name: "gunk_pile", arguments: { repoRoot: fixtureRepo } })).structuredContent,
      );
      expect(secondPile.groups).not.toEqual(firstPile.groups);

      const secondReport = await client.callTool({ name: "gunk_report", arguments: { repoRoot: fixtureRepo } });
      const secondReportText = (secondReport.content as Array<{ type: string; text: string }>)[0]?.text;
      expect(secondReportText).not.toBe(firstReportText);

      const secondVerify = verifyResultSchema.parse(
        (await client.callTool({ name: "gunk_verify", arguments: { repoRoot: fixtureRepo } })).structuredContent,
      );
      expect(secondVerify.gitStatus).not.toEqual(firstVerify.gitStatus);

      await expect(readFile(path.join(stateDir, "scan.json"), "utf8")).resolves.toBe(scanSentinel);
      await expect(readFile(path.join(stateDir, "radar.json"), "utf8")).resolves.toBe(radarSentinel);
    } finally {
      await client.close();
    }
  });

  it("keeps the public plugin-root asset path portable across POSIX and Windows hosts", async () => {
    const config = await readFile(path.join(installedRoot, ".mcp.json"), "utf8");
    expect(JSON.parse(config).mcpServers["gunk-buster"]).toMatchObject({
      command: "node",
      args: ["./dist/mcp.js"],
      cwd: ".",
    });
    expect(config).not.toContain("PLUGIN_ROOT");
    expect(path.posix.join("/opt/gunk-buster", "dist/mcp.js")).toBe("/opt/gunk-buster/dist/mcp.js");
    expect(path.win32.join("C:\\plugins\\gunk-buster", "dist/mcp.js")).toBe(
      "C:\\plugins\\gunk-buster\\dist\\mcp.js",
    );
  });
});
