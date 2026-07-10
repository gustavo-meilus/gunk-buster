import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildGitIndex } from "../src/git-index.js";
import { createEmptyGitRepo, createFixtureRepo, removeDir } from "./helpers/fixture.js";

describe("buildGitIndex(repoRoot)", () => {
  let repo: string;
  let lastTouched: Map<string, string>;

  beforeAll(async () => {
    repo = await createFixtureRepo("clean-repo");
    lastTouched = await buildGitIndex(repo);
  });

  afterAll(async () => {
    await removeDir(repo);
  });

  it("records a last-touched date for every committed file", () => {
    for (const file of ["README.md", "docs/guide.md", "AGENTS.md", "src/index.ts"]) {
      const date = lastTouched.get(file);
      expect(date, `${file} should have a last-touched date`).toBeDefined();
      const age = Date.now() - Date.parse(date!);
      expect(age).toBeGreaterThanOrEqual(0);
      expect(age).toBeLessThan(60 * 60 * 1000); // fixture was committed moments ago
    }
  });

  it("has no dates for files git never saw (ignored files)", () => {
    expect(lastTouched.has("dist/bundle.js")).toBe(false);
    expect(lastTouched.has("secret.txt")).toBe(false);
  });

  it("returns an empty index for a git repo with no commits yet", async () => {
    const dir = await createEmptyGitRepo();
    try {
      const index = await buildGitIndex(dir);
      expect(index.size).toBe(0);
    } finally {
      await removeDir(dir);
    }
  });
});
