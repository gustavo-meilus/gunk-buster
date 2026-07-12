import { execFile, execSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  bustResultSchema,
  fixResultSchema,
  radarResultSchema,
  scanResultSchema,
  trapReceiptSchema,
  verifyResultSchema,
} from "../src/schema.js";
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

/**
 * Feeds a fixed script of answer lines to an interactive command's stdin up
 * front, then waits for exit. `readline.question()` reads lines from stdin
 * in order regardless of timing, so writing every answer before the process
 * has asked for the first one is safe — no prompt/response synchronization
 * needed, and no TTY to fake.
 */
async function runGunkInteractive(cwd: string, args: string[], answers: string[]): Promise<CliRun> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cliPath, ...args], { cwd });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => resolve({ exitCode: code ?? -1, stdout, stderr }));
    child.stdin.write(`${answers.join("\n")}\n`);
    child.stdin.end();
  });
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

describe("gunk radar --fix — CLI smoke test", () => {
  let repo: string;

  beforeAll(async () => {
    execSync("pnpm build", { cwd: packageRoot, stdio: "pipe" });
  });

  afterEach(async () => {
    await removeDir(repo);
  });

  it('bare "gunk radar --fix" with no prior "gunk radar" errors ("run gunk radar first") and exits non-zero', async () => {
    repo = await createFixtureRepo("pm-drift-lockfile");

    const run = await runGunk(repo, "radar", "--fix", "--yes");
    expect(run.exitCode).not.toBe(0);
    expect(run.stderr.toLowerCase()).toContain("radar");

    const readme = await readFile(path.join(repo, "README.md"), "utf8");
    expect(readme).toContain("npm install");
  });

  it("--yes --json applies the fix from the persisted radar index and exits 0, with no receipts written", async () => {
    repo = await createFixtureRepo("pm-drift-lockfile");
    await runGunk(repo, "radar");

    const run = await runGunk(repo, "radar", "--fix", "--yes", "--json");
    expect(run.exitCode).toBe(0);

    const result = fixResultSchema.parse(JSON.parse(run.stdout));
    expect(result.applied).toEqual([
      {
        path: "README.md",
        line: 3,
        check: "package-manager-drift",
        label: "MOLD",
        replace: "npm install",
        with: "pnpm install",
      },
    ]);
    expect(result.skipped).toEqual([]);

    const readme = await readFile(path.join(repo, "README.md"), "utf8");
    expect(readme).toContain("`pnpm install`");
    // no receipts — git is the only undo for an edit (spec)
    expect(existsSync(path.join(repo, ".gunk-buster", "receipts"))).toBe(false);
  });

  it("under --json without --yes, refuses to act", async () => {
    repo = await createFixtureRepo("pm-drift-lockfile");
    await runGunk(repo, "radar");

    const run = await runGunk(repo, "radar", "--fix", "--json");
    expect(run.exitCode).not.toBe(0);
    expect(run.stderr).toContain("--yes");

    const readme = await readFile(path.join(repo, "README.md"), "utf8");
    expect(readme).toContain("npm install");
  });

  it("interactive [y] applies the fix; declining leaves the file untouched", async () => {
    repo = await createFixtureRepo("pm-drift-lockfile");
    await runGunk(repo, "radar");

    const declineRun = await runGunkInteractive(repo, ["radar", "--fix"], ["n"]);
    expect(declineRun.exitCode).toBe(0);
    let readme = await readFile(path.join(repo, "README.md"), "utf8");
    expect(readme).toContain("npm install");

    const acceptRun = await runGunkInteractive(repo, ["radar", "--fix"], ["y"]);
    expect(acceptRun.exitCode).toBe(0);
    readme = await readFile(path.join(repo, "README.md"), "utf8");
    expect(readme).toContain("pnpm install");
  });

  it("with nothing fixable on the persisted index, prints a human message and exits 0 without prompting", async () => {
    repo = await createFixtureRepo("clean-repo");
    await runGunk(repo, "radar");

    const run = await runGunk(repo, "radar", "--fix");
    expect(run.exitCode).toBe(0);
    expect(run.stdout.toLowerCase()).toContain("nothing");
  });

  it("staleness guard: re-running gunk radar after an edit lets --fix skip the now-stale item", async () => {
    repo = await createFixtureRepo("pm-drift-lockfile");
    await runGunk(repo, "radar"); // persists the original claim at README.md:3

    // Edit past the recorded claim, but DON'T re-run "gunk radar" — the
    // persisted index is now stale, which --fix must catch.
    await writeFile(
      path.join(repo, "README.md"),
      "# pm-drift-lockfile fixture\r\n\r\nAlready using pnpm, nothing to see here.\r\n",
    );
    execSync('git -c user.name=t -c user.email=t@t.invalid -c commit.gpgsign=false commit -am "edit"', {
      cwd: repo,
      stdio: "pipe",
    });

    const run = await runGunk(repo, "radar", "--fix", "--yes", "--json");
    expect(run.exitCode).toBe(0);

    const result = fixResultSchema.parse(JSON.parse(run.stdout));
    expect(result.applied).toEqual([]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.reason.toLowerCase()).toContain("re-run radar");
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

describe("gunk trap — verdict ladder and git guards (CLI smoke test)", () => {
  let repo: string;
  let vaultParent: string;

  beforeAll(async () => {
    execSync("pnpm build", { cwd: packageRoot, stdio: "pipe" });
    // NOT backdated: the recently-modified protection caps findings at ASK_CHIEF
    repo = await createFixtureRepo("orphan-docs");
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

  it("refuses an ASK_CHIEF trap under --json — no flag bypasses the mandatory confirmation", async () => {
    const run = await runGunk(repo, "trap", "docs/old-plan.md", "--yes", "--json");
    expect(run.exitCode).not.toBe(0);
    expect(run.stderr).toContain("ASK_CHIEF");
    expect(run.stderr).toContain("recently-modified");
    expect(existsSync(path.join(repo, "docs", "old-plan.md"))).toBe(true);
  });

  it("traps an untracked file with a loud stderr warning that git holds no copy", async () => {
    await writeFile(path.join(repo, "docs", "scratch-notes.md"), "# Scratch\n\nuntracked orphan\n");
    await runGunk(repo, "scan");

    const run = await runGunk(repo, "trap", "docs/scratch-notes.md", "--yes", "--json");
    expect(run.exitCode).toBe(0);
    expect(run.stderr).toMatch(/git/i);
    expect(trapReceiptSchema.parse(JSON.parse(run.stdout)).originalPath).toBe(
      "docs/scratch-notes.md",
    );
    expect(existsSync(path.join(repo, "docs", "scratch-notes.md"))).toBe(false);
  });
});

describe("gunk bust — CLI smoke test", () => {
  let repo: string;
  let vaultParent: string;

  beforeAll(async () => {
    execSync("pnpm build", { cwd: packageRoot, stdio: "pipe" });
  });

  afterEach(async () => {
    await removeDir(repo);
    await removeDir(vaultParent);
  });

  async function setUpRepo(): Promise<void> {
    repo = await createFixtureRepo("generated-dumps", { commitDate: NINETY_DAYS_AGO });
    vaultParent = await createTempDir();
    await writeFile(
      path.join(repo, "gunk.config.json"),
      JSON.stringify({ trap: { vaultRoot: path.join(vaultParent, "vault") } }),
    );
    await runGunk(repo, "scan");
  }

  it('bare "gunk bust" errors ("bust what, Chief?") and exits non-zero', async () => {
    await setUpRepo();
    const run = await runGunk(repo, "bust");
    expect(run.exitCode).not.toBe(0);
    expect(run.stderr).toContain("Chief");
  });

  it('an unknown tier is refused — "safe" is the only one', async () => {
    await setUpRepo();
    const run = await runGunk(repo, "bust", "propose");
    expect(run.exitCode).not.toBe(0);
    expect(run.stderr).toContain("propose");
  });

  it("--yes --json traps every SAFE finding under one batchId and exits 0, then --batch restore undoes it all", async () => {
    await setUpRepo();
    const bustRun = await runGunk(repo, "bust", "safe", "--yes", "--json");
    expect(bustRun.exitCode).toBe(0);
    expect(bustRun.stdout).not.toContain("Chief");

    const result = bustResultSchema.parse(JSON.parse(bustRun.stdout));
    expect(result.trapped).toHaveLength(2);
    expect(result.trapped.every((r) => r.batchId === result.batchId)).toBe(true);
    expect(existsSync(path.join(repo, "dist", "bundle.js"))).toBe(false);
    expect(existsSync(path.join(repo, "coverage", "lcov.info"))).toBe(false);

    const restoreRun = await runGunk(repo, "restore", "--batch", result.batchId, "--json");
    expect(restoreRun.exitCode).toBe(0);
    expect(existsSync(path.join(repo, "dist", "bundle.js"))).toBe(true);
    expect(existsSync(path.join(repo, "coverage", "lcov.info"))).toBe(true);
  });

  it("under --json without --yes, bust refuses to act", async () => {
    await setUpRepo();
    const run = await runGunk(repo, "bust", "safe", "--json");
    expect(run.exitCode).not.toBe(0);
    expect(run.stderr).toContain("--yes");
    expect(existsSync(path.join(repo, "dist", "bundle.js"))).toBe(true);
  });

  it("with nothing SAFE on the pile, prints a human message and exits 0 without prompting", async () => {
    repo = await createFixtureRepo("clean-repo");
    vaultParent = await createTempDir();
    await writeFile(
      path.join(repo, "gunk.config.json"),
      JSON.stringify({ trap: { vaultRoot: path.join(vaultParent, "vault") } }),
    );
    await runGunk(repo, "scan");

    const run = await runGunk(repo, "bust", "safe", "--yes");
    expect(run.exitCode).toBe(0);
    expect(run.stdout.toLowerCase()).toContain("nothing");
  });
});

describe("gunk ask — CLI smoke test", () => {
  let repo: string;
  let vaultParent: string;

  beforeAll(async () => {
    execSync("pnpm build", { cwd: packageRoot, stdio: "pipe" });
  });

  afterEach(async () => {
    await removeDir(repo);
    await removeDir(vaultParent);
  });

  async function setUpRepo(): Promise<void> {
    // backdated: two PROPOSE findings (docs/old-plan.md, assets/unused-diagram.png)
    repo = await createFixtureRepo("orphan-docs", { commitDate: NINETY_DAYS_AGO });
    vaultParent = await createTempDir();
    await writeFile(
      path.join(repo, "gunk.config.json"),
      JSON.stringify({ trap: { vaultRoot: path.join(vaultParent, "vault") } }),
    );
    await runGunk(repo, "scan");
  }

  it("--json errors politely — ask is interactive by definition", async () => {
    await setUpRepo();
    const run = await runGunk(repo, "ask", "--json");
    expect(run.exitCode).not.toBe(0);
    expect(run.stderr.toLowerCase()).toContain("interactive");
  });

  it("walks PROPOSE findings, trapping one and keeping another, sharing one batchId", async () => {
    await setUpRepo();

    // scan order within the PROPOSE group: assets/unused-diagram.png, then docs/old-plan.md
    const run = await runGunkInteractive(repo, ["ask"], ["t", "k"]);
    expect(run.exitCode).toBe(0);
    expect(run.stdout).toContain("1 trapped, 1 kept, 0 skipped");

    // the trapped item is gone; the kept item stays exactly where it was
    expect(existsSync(path.join(repo, "assets", "unused-diagram.png"))).toBe(false);
    expect(existsSync(path.join(repo, "docs", "old-plan.md"))).toBe(true);

    const keeps = JSON.parse(await readFile(path.join(repo, ".gunk-buster", "keeps.json"), "utf8"));
    expect(keeps).toHaveLength(1);
    expect(keeps[0].path).toBe("docs/old-plan.md");

    // re-scanning shows the kept file's finding as verdict KEEP, keptBy chief
    const rescan = await runGunk(repo, "scan", "--json");
    const parsed = scanResultSchema.parse(JSON.parse(rescan.stdout));
    const keptFinding = parsed.findings.find(
      (f) => f.type === "file" && f.path === "docs/old-plan.md",
    );
    expect(keptFinding).toMatchObject({ verdict: "KEEP", keptBy: "chief" });
  });

  it("[q]uit stops the walk immediately — nothing trapped or kept", async () => {
    await setUpRepo();

    const run = await runGunkInteractive(repo, ["ask"], ["q"]);
    expect(run.exitCode).toBe(0);
    expect(run.stdout).toContain("0 trapped, 0 kept, 0 skipped");
    expect(existsSync(path.join(repo, "docs", "old-plan.md"))).toBe(true);
    expect(existsSync(path.join(repo, "assets", "unused-diagram.png"))).toBe(true);
  });

  it("an ASK_CHIEF item's prompt states the protection that fired, and [t]rap traps it", async () => {
    // NOT backdated: the recently-modified protection caps both findings at
    // ASK_CHIEF — ask's moat must still name the protection per item (spec
    // "Trap" verdict ladder), not just walk it like any other action.
    repo = await createFixtureRepo("orphan-docs");
    vaultParent = await createTempDir();
    await writeFile(
      path.join(repo, "gunk.config.json"),
      JSON.stringify({ trap: { vaultRoot: path.join(vaultParent, "vault") } }),
    );
    await runGunk(repo, "scan");

    const run = await runGunkInteractive(repo, ["ask"], ["t", "t"]);
    expect(run.exitCode).toBe(0);
    expect(run.stderr).toContain("recently-modified");
    expect(run.stdout).toContain("2 trapped, 0 kept, 0 skipped");
    expect(existsSync(path.join(repo, "docs", "old-plan.md"))).toBe(false);
    expect(existsSync(path.join(repo, "assets", "unused-diagram.png"))).toBe(false);
  });

  it("with nothing PROPOSE or ASK_CHIEF on the pile, prints a human message and exits 0 without prompting", async () => {
    repo = await createFixtureRepo("clean-repo");
    vaultParent = await createTempDir();
    await runGunk(repo, "scan");

    const run = await runGunk(repo, "ask");
    expect(run.exitCode).toBe(0);
    expect(run.stdout.toLowerCase()).toContain("nothing");
  });
});

describe("gunk verify — CLI smoke test", () => {
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

  it("--json prints a schema-valid VerifyResult, no persona strings, exit 0 when clean", async () => {
    const run = await runGunk(repo, "verify", "--json");
    expect(run.exitCode).toBe(0);

    const result = verifyResultSchema.parse(JSON.parse(run.stdout));
    expect(result.passed).toBe(true);
    expect(run.stdout).not.toContain("Chief");
  });

  it("the demo: trap a still-linked file — auto-verify fails, exits non-zero, last line is the restore command", async () => {
    // the inbound-link race: the reference lands after scan judged the file
    await appendFile(path.join(repo, "docs", "guide.md"), "\nSee [the plan](old-plan.md).\n");

    const trapRun = await runGunk(repo, "trap", "docs/old-plan.md", "--yes", "--json");
    expect(trapRun.exitCode).not.toBe(0); // ADR-0005: the auto-run verify found damage
    const receipt = trapReceiptSchema.parse(JSON.parse(trapRun.stdout)); // stdout stays one schema-valid document

    // standalone verify agrees, and its human output ends with the exact undo
    const verifyRun = await runGunk(repo, "verify");
    expect(verifyRun.exitCode).not.toBe(0);
    const lines = verifyRun.stdout.trim().split("\n");
    expect(lines[lines.length - 1]).toBe(`gunk restore ${receipt.trapId}`);

    // restore undoes the damage; its own auto-verify passes -> exit 0 again
    const restoreRun = await runGunk(repo, "restore", receipt.trapId);
    expect(restoreRun.exitCode).toBe(0);
    expect((await runGunk(repo, "verify")).exitCode).toBe(0);
  });
});
