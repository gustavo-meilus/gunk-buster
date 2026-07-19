import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scan } from "../src/scan.js";
import { commitAll, createEmptyGitRepo, removeDir } from "./helpers/fixture.js";

describe("scan reference assertions (#54)", () => {
  const repos: string[] = [];

  afterEach(async () => Promise.all(repos.splice(0).map(removeDir)));

  async function repo(files: Record<string, string>): Promise<string> {
    const root = await createEmptyGitRepo();
    repos.push(root);
    for (const [name, content] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(root, name)), { recursive: true });
      await writeFile(path.join(root, name), content);
    }
    commitAll(root, "fixture", "2025-01-01T00:00:00Z");
    return root;
  }

  it("only explicit document syntax proves a candidate live", async () => {
    const root = await repo({
      "README.md": "Ordinary prose docs/prose.md\n\n`docs/inline.md`\n\n```text\ndocs/fenced.md\n```\n\n| Path |\n| --- |\n| docs/table.md |\n",
      "docs/prose.md": "# prose\n",
      "docs/inline.md": "# inline\n",
      "docs/fenced.md": "# fenced\n",
      "docs/table.md": "# table\n",
    });

    const result = await scan(root);
    const ghosts = result.findings.filter((f) => f.type === "file" && f.label === "GHOST").map((f) => f.path);
    expect(ghosts).toContain("docs/prose.md");
    expect(ghosts).not.toContain("docs/inline.md");
    expect(ghosts).not.toContain("docs/fenced.md");
    expect(ghosts).not.toContain("docs/table.md");
  });

  it("keeps the configured Superpipelines live-registry agent out of GHOST while preserving valid siblings", async () => {
    const root = await repo({
      "README.md": "# root\n",
      ".superpipelines/agents/registry-agent.md": "# registry agent\n",
      ".superpipelines/registry.json": JSON.stringify({ agents: [{ file: ".superpipelines/agents/registry-agent.md" }, { other: "valid sibling must continue" }, { file: "agents/missing.md" }, { file: 42 }] }),
      "gunk.config.json": JSON.stringify({ references: { sources: [{ name: "superpipelines-registry", files: [".superpipelines/registry.json"], format: "json", selectors: ["agents.*.file", "absent.value"], resolveFrom: "repository-root" }] } }),
    });

    const result = await scan(root);
    expect(result.findings.some((f) => f.type === "file" && f.path === ".superpipelines/agents/registry-agent.md" && f.label === "GHOST")).toBe(false);
    expect(result.findings).toContainEqual(expect.objectContaining({ type: "reference", path: ".superpipelines/registry.json", target: "agents/missing.md", source: "superpipelines-registry", selector: "agents.*.file", line: 1 }));
    expect((result.diagnostics ?? []).map((d) => d.code)).toEqual(expect.arrayContaining(["non-string-match", "unevaluable-selector"]));
  });

  it("supports YAML arrays and text named captures without raw-text fallback", async () => {
    const root = await repo({
      "README.md": "# root\n",
      "docs/yaml.md": "# yaml\n",
      "docs/text.md": "# text\n",
      "registry.yaml": "entries:\n  - target: docs/yaml.md\n  - target: docs/yaml-missing.md\n",
      "registry.txt": "load=docs/text.md\nignore docs/yaml.md\n",
      "gunk.config.json": JSON.stringify({ references: { sources: [
        { name: "yaml", files: ["registry.yaml"], format: "yaml", selectors: ["entries.*.target"], resolveFrom: "repository-root" },
        { name: "text", files: ["registry.txt"], format: "text", regex: "^load=(?<target>.+)$", resolveFrom: "repository-root" }
      ] } }),
    });

    const result = await scan(root);
    for (const target of ["docs/yaml.md", "docs/text.md"]) {
      expect(result.findings.some((f) => f.type === "file" && f.path === target && f.label === "GHOST")).toBe(false);
    }
    expect(result.findings).toContainEqual(expect.objectContaining({ type: "reference", path: "registry.yaml", target: "docs/yaml-missing.md", line: 3 }));
    expect(result.diagnostics).toEqual([]);
  });

  it("diagnoses unmatched globs and malformed siblings while scan stays advisory", async () => {
    const root = await repo({
      "README.md": "# root\n",
      "bad.json": "{",
      "gunk.config.json": JSON.stringify({ references: { sources: [
        { name: "missing", files: ["registries/*.json"], format: "json", selectors: ["target"], resolveFrom: "repository-root" },
        { name: "bad", files: ["bad.json"], format: "json", selectors: ["target"], resolveFrom: "repository-root" }
      ] } }),
    });
    const result = await scan(root);
    expect((result.diagnostics ?? []).map((d) => d.code)).toEqual(["source-glob-empty", "malformed-source"]);
  });
});
