import { execFileSync } from "node:child_process";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { radar } from "../src/radar.js";
import { createEmptyGitRepo, removeDir } from "./helpers/fixture.js";

function git(repo: string, ...args: string[]): void {
  execFileSync("git", args, { cwd: repo, stdio: "pipe" });
}

async function deadPaths(repo: string): Promise<string[]> {
  const result = await radar(repo, defaultConfig());
  return result.findings.filter((finding) => finding.check === "dead-path").map((finding) => finding.actual);
}

describe("radar(repoRoot, config) - current Git index inventory (#52)", () => {
  it("handles unstaged/staged deletion, untracked replacement, and staged rename", async () => {
    const repo = await createEmptyGitRepo();
    try {
      await mkdir(path.join(repo, "src"));
      await writeFile(path.join(repo, "AGENTS.md"), "Paths: `/src/old.ts` and `/src/new.ts`.\n");
      await writeFile(path.join(repo, "src", "old.ts"), "export {};\n");
      git(repo, "add", "-A");
      git(repo, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "initial");

      expect(await deadPaths(repo)).toContain("/src/new.ts");
      expect(await deadPaths(repo)).not.toContain("/src/old.ts");

      await rm(path.join(repo, "src", "old.ts"));
      expect(await deadPaths(repo)).not.toContain("/src/old.ts");

      git(repo, "add", "-u");
      expect(await deadPaths(repo)).toContain("/src/old.ts");

      git(repo, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "delete old path");
      expect(await deadPaths(repo)).toContain("/src/old.ts"); // historical-only is still dead

      await writeFile(path.join(repo, "src", "old.ts"), "untracked replacement\n");
      expect(await deadPaths(repo)).toContain("/src/old.ts");

      git(repo, "add", "src/old.ts");
      await rename(path.join(repo, "src", "old.ts"), path.join(repo, "src", "new.ts"));
      git(repo, "add", "-A");
      const afterRename = await deadPaths(repo);
      expect(afterRename).toContain("/src/old.ts");
      expect(afterRename).not.toContain("/src/new.ts");
    } finally {
      await removeDir(repo);
    }
  });
});
