import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { buildDocGraph } from "../src/doc-graph.js";
import { buildFileIndex } from "../src/file-index.js";
import { buildReferenceGraphs, mentionsPath, type ReferenceGraphs } from "../src/reference-graphs.js";
import { scan } from "../src/scan.js";
import { pathsWithLabel } from "./helpers/findings.js";
import { createFixtureRepo, removeDir } from "./helpers/fixture.js";

/** Well outside the default 30-day recency window. */
const NINETY_DAYS_AGO = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

describe("mentionsPath(text, relPath) — path-token mention matching", () => {
  it("matches a plain repo-relative mention in prose", () => {
    expect(mentionsPath("read docs/guide.md before editing", "docs/guide.md")).toBe(true);
  });

  it("matches at a sentence end and after ./ or / prefixes", () => {
    expect(mentionsPath("see docs/guide.md.", "docs/guide.md")).toBe(true);
    expect(mentionsPath("run cat ./docs/guide.md", "docs/guide.md")).toBe(true);
    expect(mentionsPath("path is /docs/guide.md here", "docs/guide.md")).toBe(true);
  });

  it("does not match inside a longer path word (different file, different directory)", () => {
    expect(mentionsPath("see docs/guide.mdx", "docs/guide.md")).toBe(false);
    expect(mentionsPath("see old-docs/guide.md", "docs/guide.md")).toBe(false);
    expect(mentionsPath("see data.md", "a.md")).toBe(false);
  });

  it("finds a later genuine mention even when an earlier occurrence is part of a longer word", () => {
    expect(mentionsPath("docs/guide.mdx then docs/guide.md", "docs/guide.md")).toBe(true);
  });
});

describe("built-in assertion provenance (#54)", () => {
  it("locates package-script assertions on their actual package.json line", async () => {
    const repo = await createFixtureRepo("reference-surface", { commitDate: NINETY_DAYS_AGO });
    try {
      const fileIndex = await buildFileIndex(repo);
      const graph = await buildReferenceGraphs(repo, fileIndex, await buildDocGraph(repo, fileIndex));
      expect(graph.assertions).toContainEqual(expect.objectContaining({
        source: "package-script", sourcePath: "package.json", selector: "scripts.docs:check",
        location: 5, target: "docs/script-only.md",
      }));
    } finally {
      await removeDir(repo);
    }
  });
});

describe("buildReferenceGraphs(repoRoot, fileIndex, docGraph) — full agent-context discovery list (#5)", () => {
  let repo: string;
  let graphs: ReferenceGraphs;

  beforeAll(async () => {
    repo = await createFixtureRepo("agent-context-surface", { commitDate: NINETY_DAYS_AGO });
    const fileIndex = await buildFileIndex(repo);
    const docGraph = await buildDocGraph(repo, fileIndex);
    graphs = await buildReferenceGraphs(repo, fileIndex, docGraph);
  });

  afterAll(async () => {
    await removeDir(repo);
  });

  // One (source, referenced doc) pair per entry of the spec's discovery
  // list: AGENTS.md, CLAUDE.md, GEMINI.md, .cursorrules, .cursor/rules/**,
  // .github/copilot-instructions.md, .claude/**, .agents/**, .codex/**,
  // .opencode/**, .aider.conf.yml.
  const discoveryList: Array<[source: string, referenced: string]> = [
    ["AGENTS.md", "docs/from-agents-md.md"],
    ["CLAUDE.md", "docs/from-claude-md.md"],
    ["GEMINI.md", "docs/from-gemini-md.md"],
    [".cursorrules", "docs/from-cursorrules.md"],
    [".cursor/rules/style.md", "docs/from-cursor-rules-dir.md"],
    [".github/copilot-instructions.md", "docs/from-copilot-instructions.md"],
    [".claude/skills.md", "docs/from-claude-dir.md"],
    [".agents/setup.md", "docs/from-agents-dir.md"],
    [".codex/instructions.md", "docs/from-codex-dir.md"],
    [".opencode/rules.md", "docs/from-opencode-dir.md"],
    [".aider.conf.yml", "docs/from-aider-conf.md"],
  ];

  it.each(discoveryList)("references from %s are in the agent-context graph", (_source, doc) => {
    expect(graphs.agentContextReferenced.has(doc)).toBe(true);
  });

  it("does not claim unreferenced docs", () => {
    expect(graphs.agentContextReferenced.has("docs/orphan-control.md")).toBe(false);
  });

  it("end to end: only the control doc is GHOST — every discovery-list source rescues its doc", async () => {
    const result = await scan(repo, defaultConfig());
    expect(pathsWithLabel(result, "GHOST")).toEqual(["docs/orphan-control.md"]);
  });
});
