import { execFile, execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { radarResultSchema, scanResultSchema, trapReceiptSchema } from "../src/schema.js";
import { NINETY_DAYS_AGO } from "./helpers/findings.js";
import { createFixtureRepo, createTempDir, removeDir } from "./helpers/fixture.js";

const execFileAsync = promisify(execFile);

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const cliPath = path.join(packageRoot, "dist", "cli.js");

interface CliRun {
  exitCode: number;
  stdout: string;
  stderr: string;
}

async function runGunk(cwd: string, ...args: string[]): Promise<CliRun> {
  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [cliPath, ...args],
      { cwd },
    );
    return { exitCode: 0, stdout, stderr };
  } catch (error) {
    const e = error as { code?: number; stdout?: string; stderr?: string };
    return { exitCode: e.code ?? -1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
}

describe("gunk scan — CLI smoke test", () => {
  let repo: string;

  beforeAll(async () => {
    execSync("pnpm build", { cwd: packageRoot, stdio: "pipe" });
    repo = await createFixtureRepo("clean-repo");
  });

  afterAll(async () => {
    await removeDir(repo);
  });

  it("--json prints a schema-valid ScanResult to stdout and exits 0", async () => {
    const run = await runGunk(repo, "scan", "--json");
    expect(run.exitCode).toBe(0);

    const result = scanResultSchema.parse(JSON.parse(run.stdout));
    expect(result.findings).toEqual([]);
    expect(existsSync(path.join(repo, ".gunk-buster", "scan.json"))).toBe(true);
  });

  it("without --json prints a human summary, not JSON, and exits 0", async () => {
    const run = await runGunk(repo, "scan");
    expect(run.exitCode).toBe(0);
    expect(run.stdout.trim()).not.toBe("");
    expect(() => JSON.parse(run.stdout)).toThrow();
  });

  it("exits non-zero with a message on stderr when not in a git repo", async () => {
    const dir = await createTempDir();
    try {
      const run = await runGunk(dir, "scan");
      expect(run.exitCode).not.toBe(0);
      expect(run.stderr).toContain("not a git repo");
    } finally {
      await removeDir(dir);
    }
  });
});

describe("gunk radar — CLI smoke test", () => {
  let repo: string;

  beforeAll(async () => {
    execSync("pnpm build", { cwd: packageRoot, stdio: "pipe" });
    repo = await createFixtureRepo("clean-repo");
  });

  afterAll(async () => {
    await removeDir(repo);
  });

  it("--json prints a schema-valid RadarResult to stdout, with no persona strings, and exits 0", async () => {
    const run = await runGunk(repo, "radar", "--json");
    expect(run.exitCode).toBe(0);

    const result = radarResultSchema.parse(JSON.parse(run.stdout));
    expect(result.findings).toEqual([]);
    expect(run.stdout).not.toContain("Chief");
    expect(existsSync(path.join(repo, ".gunk-buster", "radar.json"))).toBe(true);
  });

  it("without --json prints a human summary, not JSON, and exits 0", async () => {
    const run = await runGunk(repo, "radar");
    expect(run.exitCode).toBe(0);
    expect(run.stdout.trim()).not.toBe("");
    expect(() => JSON.parse(run.stdout)).toThrow();
  });

  it("exits non-zero with a message on stderr when not in a git repo", async () => {
    const dir = await createTempDir();
    try {
      const run = await runGunk(dir, "radar");
      expect(run.exitCode).not.toBe(0);
      expect(run.stderr).toContain("not a git repo");
    } finally {
      await removeDir(dir);
    }
  });
});

describe("gunk restore — CLI smoke test", () => {
  let repo: string;
  let vaultParent: string;

  beforeAll(async () => {
    execSync("pnpm build", { cwd: packageRoot, stdio: "pipe" });
    repo = await createFixtureRepo("orphan-docs", { commitDate: NINETY_DAYS_AGO });
    vaultParent = await createTempDir();
    await writeFile(
      path.join(repo, "gunk.config.json"),
      JSON.stringify({ trap: { vaultRoot: path.join(vaultParent, "vault") } }),
    );
    await runGunk(repo, "scan");
  });

  afterAll(async () => {
    await removeDir(repo);
    await removeDir(vaultParent);
  });

  it("round-trips trap then restore --json: byte-identical file, receipt flipped, no persona strings", async () => {
    const trapRun = await runGunk(repo, "trap", "docs/old-plan.md", "--yes", "--json");
    expect(trapRun.exitCode).toBe(0);
    const receipt = trapReceiptSchema.parse(JSON.parse(trapRun.stdout));
    expect(existsSync(path.join(repo, "docs", "old-plan.md"))).toBe(false);

    const restoreRun = await runGunk(repo, "restore", receipt.trapId, "--json");
    expect(restoreRun.exitCode).toBe(0);
    expect(restoreRun.stdout).not.toContain("Chief");

    const result = JSON.parse(restoreRun.stdout) as {
      restored: unknown[];
      alreadyRestored: string[];
    };
    expect(result.restored).toHaveLength(1);
    expect(trapReceiptSchema.parse(result.restored[0]).status).toBe("restored");
    expect(existsSync(path.join(repo, "docs", "old-plan.md"))).toBe(true);

    // restoring again by trap-id is the detected no-op, still exit 0
    const again = await runGunk(repo, "restore", receipt.trapId, "--json");
    expect(again.exitCode).toBe(0);
    expect((JSON.parse(again.stdout) as { alreadyRestored: string[] }).alreadyRestored).toEqual([
      receipt.trapId,
    ]);
  });

  it("refuses more than one target and exits non-zero", async () => {
    const run = await runGunk(repo, "restore", "some-path.md", "--all");
    expect(run.exitCode).not.toBe(0);
    expect(run.stderr).toContain("exactly one target");
  });

  it("refuses no target at all and exits non-zero", async () => {
    const run = await runGunk(repo, "restore");
    expect(run.exitCode).not.toBe(0);
    expect(run.stderr).toContain("exactly one target");
  });
});
