import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadKeeps, writeKeep } from "../src/keeps.js";
import { createFixtureRepo, removeDir } from "./helpers/fixture.js";

const hashA = `sha256:${"a".repeat(64)}`;
const hashB = `sha256:${"b".repeat(64)}`;

describe("loadKeeps(repoRoot) / writeKeep(repoRoot, entry)", () => {
  let repo: string;

  beforeEach(async () => {
    repo = await createFixtureRepo("clean-repo");
  });

  afterEach(async () => {
    await removeDir(repo);
  });

  it("returns an empty list when gunk ask has never kept anything here", async () => {
    expect(await loadKeeps(repo)).toEqual([]);
  });

  it("round-trips a written entry", async () => {
    const entry = { path: "docs/old-plan.md", contentHash: hashA, decidedAt: "2026-07-11T14:22:05.123Z" };
    await writeKeep(repo, entry);
    expect(await loadKeeps(repo)).toEqual([entry]);
  });

  it("replaces any existing entry for the same path — a fresh keep is a fresh decision", async () => {
    await writeKeep(repo, {
      path: "docs/old-plan.md",
      contentHash: hashA,
      decidedAt: "2026-07-11T14:22:05.123Z",
    });
    const refreshed = {
      path: "docs/old-plan.md",
      contentHash: hashB,
      decidedAt: "2026-07-12T09:00:00.000Z",
    };
    await writeKeep(repo, refreshed);

    expect(await loadKeeps(repo)).toEqual([refreshed]);
  });

  it("keeps entries for distinct paths independent", async () => {
    await writeKeep(repo, { path: "docs/a.md", contentHash: hashA, decidedAt: "2026-07-11T14:22:05.123Z" });
    await writeKeep(repo, { path: "docs/b.md", contentHash: hashB, decidedAt: "2026-07-11T14:22:06.123Z" });

    const keeps = await loadKeeps(repo);
    expect(keeps.map((k) => k.path).sort()).toEqual(["docs/a.md", "docs/b.md"]);
  });

  it("writes keeps.json git-tracked — the internal .gitignore never covers it", async () => {
    await writeKeep(repo, {
      path: "docs/old-plan.md",
      contentHash: hashA,
      decidedAt: "2026-07-11T14:22:05.123Z",
    });

    const gitignore = await readFile(path.join(repo, ".gunk-buster", ".gitignore"), "utf8");
    expect(gitignore).not.toMatch(/keeps\.json/);
    // scan.json / radar.json stay ignored
    expect(gitignore).toMatch(/scan\.json/);
  });
});
