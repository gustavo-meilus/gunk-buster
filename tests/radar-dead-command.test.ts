import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { resolveScriptName } from "../src/checks/dead-command.js";
import type { CommandMention } from "../src/checks/command-mentions.js";
import { radar } from "../src/radar.js";
import type { ClaimFinding } from "../src/schema.js";
import { createFixtureRepo, removeDir } from "./helpers/fixture.js";

function claimFindingsFor(findings: readonly ClaimFinding[], check: string): ClaimFinding[] {
  return findings.filter((f) => f.check === check);
}

function mention(overrides: Partial<CommandMention>): CommandMention {
  return { manager: "npm", subcommand: undefined, arg: undefined, raw: "", line: 1, ...overrides };
}

describe("radar(repoRoot, config) — dead-command check (#10)", () => {
  it("never flags a workspace-only script resolved against the union of every package.json (root + workspaces)", async () => {
    const repo = await createFixtureRepo("dead-command-monorepo");
    try {
      const result = await radar(repo, defaultConfig());
      const findings = claimFindingsFor(result.findings, "dead-command");
      expect(findings.some((f) => f.path === "docs/workspace-script.md" && f.actual === "pnpm dev")).toBe(
        false,
      );
      expect(
        findings.some((f) => f.path === "docs/workspace-script.md" && f.actual === "npm run build"),
      ).toBe(false);
    } finally {
      await removeDir(repo);
    }
  });

  it("flags a script that exists in no manifest as a CERTAIN finding", async () => {
    const repo = await createFixtureRepo("dead-command-monorepo");
    try {
      const result = await radar(repo, defaultConfig());
      const findings = claimFindingsFor(result.findings, "dead-command");
      const finding = findings.find((f) => f.path === "CLAUDE.md" && f.actual === "npm run typo");

      expect(finding).toBeDefined();
      expect(finding).toMatchObject({ label: "BAIT", line: 3 });
      expect(finding?.evidence[0]).toMatchObject({ rule: "unknown-script", confidence: "CERTAIN" });
      expect(finding?.suggestion).toBeUndefined();
    } finally {
      await removeDir(repo);
    }
  });

  it("flags a dead bare-form script mentioned inside a fenced code block, at its physical line", async () => {
    const repo = await createFixtureRepo("dead-command-monorepo");
    try {
      const result = await radar(repo, defaultConfig());
      const findings = claimFindingsFor(result.findings, "dead-command");
      const finding = findings.find((f) => f.actual === "yarn typo-in-fence");

      expect(finding).toBeDefined();
      expect(finding?.line).toBe(8);
    } finally {
      await removeDir(repo);
    }
  });

  it("never flags a built-in subcommand (install, add, exec, dlx, test, ...)", async () => {
    const repo = await createFixtureRepo("dead-command-monorepo");
    try {
      const result = await radar(repo, defaultConfig());
      const findings = claimFindingsFor(result.findings, "dead-command");
      expect(findings.some((f) => f.actual === "pnpm install")).toBe(false);
    } finally {
      await removeDir(repo);
    }
  });

  it("never flags a prose-only mention outside a code span", async () => {
    const repo = await createFixtureRepo("dead-command-monorepo");
    try {
      const result = await radar(repo, defaultConfig());
      const findings = claimFindingsFor(result.findings, "dead-command");
      expect(findings.some((f) => f.actual.includes("totally-made-up"))).toBe(false);
    } finally {
      await removeDir(repo);
    }
  });

  it("emits nothing in a non-Node repo (no package.json anywhere)", async () => {
    const repo = await createFixtureRepo("pm-drift-non-node");
    try {
      const result = await radar(repo, defaultConfig());
      expect(claimFindingsFor(result.findings, "dead-command")).toEqual([]);
    } finally {
      await removeDir(repo);
    }
  });

  it("is disabled independently by radar.checks.deadCommands: false", async () => {
    const repo = await createFixtureRepo("dead-command-monorepo");
    try {
      const config = defaultConfig();
      const result = await radar(repo, {
        ...config,
        radar: { ...config.radar, checks: { ...config.radar.checks, deadCommands: false } },
      });
      expect(claimFindingsFor(result.findings, "dead-command")).toEqual([]);
    } finally {
      await removeDir(repo);
    }
  });
});

describe("resolveScriptName(mention) — script-name resolution truth table", () => {
  it("resolves npm's explicit run form", () => {
    expect(resolveScriptName(mention({ manager: "npm", subcommand: "run", arg: "build" }))).toBe("build");
  });

  it("never resolves a bare npm invocation (npm build is not a script call)", () => {
    expect(resolveScriptName(mention({ manager: "npm", subcommand: "build", arg: undefined }))).toBeUndefined();
  });

  it("resolves bun's explicit run form only", () => {
    expect(resolveScriptName(mention({ manager: "bun", subcommand: "run", arg: "build" }))).toBe("build");
    expect(resolveScriptName(mention({ manager: "bun", subcommand: "build", arg: undefined }))).toBeUndefined();
  });

  it("resolves pnpm/yarn's bare form to the subcommand itself", () => {
    expect(resolveScriptName(mention({ manager: "pnpm", subcommand: "build", arg: undefined }))).toBe("build");
    expect(resolveScriptName(mention({ manager: "yarn", subcommand: "build", arg: undefined }))).toBe("build");
  });

  it("resolves pnpm/yarn's explicit run form too", () => {
    expect(resolveScriptName(mention({ manager: "pnpm", subcommand: "run", arg: "build" }))).toBe("build");
  });

  it("never resolves a built-in subcommand as a script name", () => {
    expect(resolveScriptName(mention({ manager: "pnpm", subcommand: "install", arg: undefined }))).toBeUndefined();
    expect(resolveScriptName(mention({ manager: "yarn", subcommand: "add", arg: "left-pad" }))).toBeUndefined();
  });

  it("returns undefined for a mention with no subcommand at all", () => {
    expect(resolveScriptName(mention({ subcommand: undefined }))).toBeUndefined();
  });
});
