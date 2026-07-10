import { execFileSync } from "node:child_process";
import { cp, mkdtemp, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const fixturesDir = fileURLToPath(new URL("../fixtures/", import.meta.url));

function git(cwd: string, args: string[], env?: NodeJS.ProcessEnv): void {
  execFileSync("git", args, {
    cwd,
    stdio: "pipe",
    env: env ? { ...process.env, ...env } : undefined,
  });
}

function commitDateEnv(commitDate?: string): NodeJS.ProcessEnv | undefined {
  if (!commitDate) return undefined;
  return { GIT_AUTHOR_DATE: commitDate, GIT_COMMITTER_DATE: commitDate };
}

/**
 * Stage and commit everything currently in `dir`. `commitDate` (ISO string)
 * backdates GIT_AUTHOR_DATE/GIT_COMMITTER_DATE — lets a fixture prove
 * age-dependent behavior (e.g. the recency protection) without waiting for
 * real time to pass. Defaults to now.
 */
export function commitAll(dir: string, message: string, commitDate?: string): void {
  git(dir, ["add", "-A"]);
  git(
    dir,
    [
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-q",
      "-m",
      message,
    ],
    commitDateEnv(commitDate),
  );
}

/** Create a plain (non-git) temp directory. */
export async function createTempDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "gunk-tmp-"));
}

export interface CreateFixtureRepoOptions {
  /**
   * ISO date to backdate the initial commit to — lets a fixture prove
   * age-dependent behavior (e.g. the recency protection) without waiting
   * for real time to pass. Defaults to now.
   */
  commitDate?: string;
}

/**
 * Copy a fixture into a temp directory and turn it into a real git repo.
 * `_gitignore` is renamed to `.gitignore` (a fixture's ignore rules must not
 * apply inside the gunk-buster repo itself), then everything is committed so
 * the git index has last-touched dates.
 */
export async function createFixtureRepo(
  name: string,
  options: CreateFixtureRepoOptions = {},
): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), `gunk-fixture-${name}-`));
  await cp(path.join(fixturesDir, name), dir, { recursive: true });
  try {
    await rename(path.join(dir, "_gitignore"), path.join(dir, ".gitignore"));
  } catch {
    // fixture has no _gitignore — fine
  }
  git(dir, ["init", "-q"]);
  commitAll(dir, "fixture", options.commitDate);
  return dir;
}

/** Create a git repo with no commits yet (fresh `git init`). */
export async function createEmptyGitRepo(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "gunk-empty-repo-"));
  git(dir, ["init", "-q"]);
  return dir;
}

/** Remove a temp directory, tolerating Windows file-lock stragglers. */
export async function removeDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true, maxRetries: 5 });
}
