import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { GunkError } from "./errors.js";

const execFileAsync = promisify(execFile);

/** Run git in `cwd` and return trimmed stdout. */
export async function runGit(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout;
}

/**
 * Resolve the repo root for a directory, or throw a GunkError if it is not
 * inside a git work tree. Returned as an absolute native path.
 */
export async function resolveRepoRoot(dir: string): Promise<string> {
  let stdout: string;
  try {
    stdout = await runGit(dir, ["rev-parse", "--show-toplevel"]);
  } catch {
    throw new GunkError(`not a git repo: ${dir}`);
  }
  return path.resolve(stdout.trim());
}
