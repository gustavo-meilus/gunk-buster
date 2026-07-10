import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildFileIndex, type FileEntry } from "../src/file-index.js";
import { createFixtureRepo, removeDir } from "./helpers/fixture.js";

describe("buildFileIndex(repoRoot)", () => {
  let repo: string;
  let entries: FileEntry[];

  beforeAll(async () => {
    repo = await createFixtureRepo("clean-repo");
    entries = await buildFileIndex(repo);
  });

  afterAll(async () => {
    await removeDir(repo);
  });

  function kindOf(relPath: string): string | undefined {
    return entries.find((e) => e.path === relPath)?.kind;
  }

  it("is gitignore-aware: ignored files and directories never appear", () => {
    const paths = entries.map((e) => e.path);
    expect(paths).not.toContain("dist/bundle.js");
    expect(paths).not.toContain("secret.txt");
    expect(paths.some((p) => p.startsWith(".git/"))).toBe(false);
  });

  it("classifies kinds: doc, asset, agent-context", () => {
    expect(kindOf("README.md")).toBe("doc");
    expect(kindOf("docs/guide.md")).toBe("doc");
    expect(kindOf("assets/logo.svg")).toBe("asset");
    expect(kindOf("AGENTS.md")).toBe("agent-context");
  });

  it("keeps code files in the index but outside the candidate kinds", () => {
    // code is hard-protected — never a candidate, so never one of the four kinds
    expect(kindOf("src/index.ts")).toBe("other");
  });

  it("uses forward-slash repo-relative paths and records sizes", () => {
    for (const entry of entries) {
      expect(entry.path).not.toContain("\\");
      expect(entry.size).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("buildFileIndex(repoRoot) — generated kind", () => {
  let repo: string;
  let entries: FileEntry[];

  beforeAll(async () => {
    repo = await createFixtureRepo("generated-dumps");
    entries = await buildFileIndex(repo);
  });

  afterAll(async () => {
    await removeDir(repo);
  });

  function kindOf(relPath: string): string | undefined {
    return entries.find((e) => e.path === relPath)?.kind;
  }

  it("classifies committed build/cache/coverage output and tool-residue extensions as generated", () => {
    expect(kindOf("dist/bundle.js")).toBe("generated");
    expect(kindOf("coverage/lcov.info")).toBe("generated");
    expect(kindOf("build.log")).toBe("generated");
    expect(kindOf("app.tsbuildinfo")).toBe("generated");
  });
});
