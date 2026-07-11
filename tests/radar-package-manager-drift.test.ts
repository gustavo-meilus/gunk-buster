import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { buildPackageGraph, resolveTruePackageManager, type PackageGraph } from "../src/package-graph.js";
import { radar } from "../src/radar.js";
import type { ClaimFinding } from "../src/schema.js";
import { createFixtureRepo, removeDir } from "./helpers/fixture.js";

function claimFindingsFor(findings: readonly ClaimFinding[], check: string): ClaimFinding[] {
  return findings.filter((f) => f.check === check);
}

describe("radar(repoRoot, config) — package-manager-drift check (#10)", () => {
  it("flags a mismatching mention as CERTAIN BAIT in an agent-context file when the root packageManager field is authoritative", async () => {
    const repo = await createFixtureRepo("pm-drift-field");
    try {
      const result = await radar(repo, { ...defaultConfig(), radar: { ...defaultConfig().radar, checks: { ...defaultConfig().radar.checks, deadCommands: false } } });
      const findings = claimFindingsFor(result.findings, "package-manager-drift");
      const claudeFinding = findings.find((f) => f.path === "CLAUDE.md");

      expect(claudeFinding).toMatchObject({
        type: "claim",
        path: "CLAUDE.md",
        line: 3,
        label: "BAIT",
        check: "package-manager-drift",
        expected: "pnpm install",
        actual: "npm install",
        suggestion: { replace: "npm install", with: "pnpm install" },
      });
      expect(claudeFinding?.evidence[0]).toMatchObject({ rule: "pm-mismatch", confidence: "CERTAIN" });
    } finally {
      await removeDir(repo);
    }
  });

  it("labels the same wrong claim MOLD when it appears in an ordinary doc instead of an agent-context file", async () => {
    const repo = await createFixtureRepo("pm-drift-field");
    try {
      const result = await radar(repo, defaultConfig());
      const findings = claimFindingsFor(result.findings, "package-manager-drift");
      const readmeFindings = findings.filter((f) => f.path === "README.md");

      expect(readmeFindings.length).toBeGreaterThan(0);
      expect(readmeFindings.every((f) => f.label === "MOLD")).toBe(true);
    } finally {
      await removeDir(repo);
    }
  });

  it("never flags the correct manager, and never flags a prose-only mention outside a code span", async () => {
    const repo = await createFixtureRepo("pm-drift-field");
    try {
      const result = await radar(repo, defaultConfig());
      const findings = claimFindingsFor(result.findings, "package-manager-drift");
      const claudeFindings = findings.filter((f) => f.path === "CLAUDE.md");

      // Only the line-3 `npm install` mention should fire — not the correct
      // `pnpm install` on line 5, and not the prose "npm" mention on line 7.
      expect(claudeFindings.map((f) => f.line)).toEqual([3]);
    } finally {
      await removeDir(repo);
    }
  });

  it("falls back to STRONG confidence off a lone lockfile when no packageManager field exists", async () => {
    const repo = await createFixtureRepo("pm-drift-lockfile");
    try {
      const result = await radar(repo, defaultConfig());
      const findings = claimFindingsFor(result.findings, "package-manager-drift");

      expect(findings).toHaveLength(1);
      expect(findings[0]).toMatchObject({
        path: "README.md",
        actual: "npm install",
        expected: "pnpm install",
      });
      expect(findings[0]?.evidence[0]?.confidence).toBe("STRONG");
    } finally {
      await removeDir(repo);
    }
  });

  it("emits nothing when multiple lockfiles exist and there is no packageManager field (never guesses)", async () => {
    const repo = await createFixtureRepo("pm-drift-ambiguous");
    try {
      const result = await radar(repo, defaultConfig());
      expect(claimFindingsFor(result.findings, "package-manager-drift")).toEqual([]);
    } finally {
      await removeDir(repo);
    }
  });

  it("emits nothing in a non-Node repo (no package.json, no lockfile)", async () => {
    const repo = await createFixtureRepo("pm-drift-non-node");
    try {
      const result = await radar(repo, defaultConfig());
      expect(claimFindingsFor(result.findings, "package-manager-drift")).toEqual([]);
      expect(claimFindingsFor(result.findings, "dead-command")).toEqual([]);
    } finally {
      await removeDir(repo);
    }
  });

  it("is disabled independently by radar.checks.packageManagerDrift: false", async () => {
    const repo = await createFixtureRepo("pm-drift-field");
    try {
      const config = defaultConfig();
      const result = await radar(repo, {
        ...config,
        radar: { ...config.radar, checks: { ...config.radar.checks, packageManagerDrift: false } },
      });
      expect(claimFindingsFor(result.findings, "package-manager-drift")).toEqual([]);
    } finally {
      await removeDir(repo);
    }
  });
});

describe("resolveTruePackageManager(graph) — ground-truth precedence truth table", () => {
  const empty: PackageGraph = {
    manifests: [],
    scriptUnion: new Set(),
    packageManagerField: null,
    lockfiles: [],
  };

  it("returns null with no signal at all", () => {
    expect(resolveTruePackageManager(empty)).toBeNull();
  });

  it("prefers the packageManager field over any lockfile", () => {
    const graph: PackageGraph = { ...empty, packageManagerField: "yarn@4.0.0", lockfiles: ["npm"] };
    expect(resolveTruePackageManager(graph)).toEqual({
      manager: "yarn",
      confidence: "CERTAIN",
      rule: "packageManager-field",
    });
  });

  it("falls back to a lone lockfile when the field is absent", () => {
    const graph: PackageGraph = { ...empty, lockfiles: ["bun"] };
    expect(resolveTruePackageManager(graph)).toEqual({
      manager: "bun",
      confidence: "STRONG",
      rule: "lone-lockfile",
    });
  });

  it("returns null when multiple lockfiles are present", () => {
    const graph: PackageGraph = { ...empty, lockfiles: ["npm", "yarn"] };
    expect(resolveTruePackageManager(graph)).toBeNull();
  });

  it("returns null when the field value names an unrecognized manager", () => {
    const graph: PackageGraph = { ...empty, packageManagerField: "notreal@1.0.0", lockfiles: ["pnpm"] };
    // an unrecognized field falls through to the lockfile signal rather than guessing
    expect(resolveTruePackageManager(graph)).toEqual({
      manager: "pnpm",
      confidence: "STRONG",
      rule: "lone-lockfile",
    });
  });
});

describe("buildPackageGraph(repoRoot, fileIndex) — through a real fixture", () => {
  it("reads the root packageManager field and lockfile signal from a fixture repo", async () => {
    const repo = await createFixtureRepo("pm-drift-field");
    try {
      const { buildFileIndex } = await import("../src/file-index.js");
      const fileIndex = await buildFileIndex(repo);
      const graph = await buildPackageGraph(repo, fileIndex);
      expect(graph.packageManagerField).toBe("pnpm@9.1.0");
      expect(graph.scriptUnion.has("build")).toBe(true);
    } finally {
      await removeDir(repo);
    }
  });
});
