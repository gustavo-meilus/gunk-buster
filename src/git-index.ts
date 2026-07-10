import { GunkError } from "./errors.js";
import { runGit } from "./git.js";

/** Last-touched ISO date per repo-relative path. */
export type GitIndex = Map<string, string>;

async function hasAnyCommit(repoRoot: string): Promise<boolean> {
  try {
    await runGit(repoRoot, ["rev-parse", "--verify", "HEAD"]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Git index — the second scan graph: last-touched dates per repo-relative
 * path, for the age signal and recency protection. Built by shelling out to
 * `git log` (no git library, per ADR-0003). One pass over history; the first
 * time a path appears is its most recent touch. A repo with no commits yet
 * yields an empty index — that is a successful scan, not a tool error.
 */
export async function buildGitIndex(repoRoot: string): Promise<GitIndex> {
  let stdout: string;
  try {
    stdout = await runGit(repoRoot, [
      "-c",
      "core.quotepath=off",
      "log",
      "--format=%x00%cI",
      "--name-only",
    ]);
  } catch (error) {
    if (!(await hasAnyCommit(repoRoot))) {
      return new Map();
    }
    throw new GunkError(`git log failed in ${repoRoot}: ${String(error)}`);
  }

  const lastTouched: GitIndex = new Map();
  for (const chunk of stdout.split("\0")) {
    if (chunk.trim() === "") continue;
    const lines = chunk.split("\n");
    const date = (lines[0] ?? "").trim();
    for (const line of lines.slice(1)) {
      const file = line.trim();
      if (file === "" || lastTouched.has(file)) continue;
      lastTouched.set(file, date);
    }
  }
  return lastTouched;
}
