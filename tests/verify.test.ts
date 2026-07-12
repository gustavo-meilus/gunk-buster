import { appendFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultConfig, type GunkConfig } from "../src/config.js";
import { persistScanResult, scan } from "../src/scan.js";
import { restore } from "../src/restore.js";
import type { TrapReceipt } from "../src/schema.js";
import { trap } from "../src/trap.js";
import { verify } from "../src/verify.js";
import { NINETY_DAYS_AGO } from "./helpers/findings.js";
import { createFixtureRepo, createTempDir, removeDir } from "./helpers/fixture.js";

const TRAP_NOW = new Date("2026-07-11T14:22:05.123Z");
const VERIFY_NOW = new Date("2026-07-12T09:00:00.000Z");

describe("verify(repoRoot, context) — engine seam", () => {
  let repo: string;
  let vaultParent: string;
  let config: GunkConfig;

  beforeEach(async () => {
    // orphan-docs, backdated past the recency window: two PROPOSE file
    // findings (docs/old-plan.md and assets/unused-diagram.png).
    repo = await createFixtureRepo("orphan-docs", { commitDate: NINETY_DAYS_AGO });
    vaultParent = await createTempDir();
    config = defaultConfig();
    config.trap.vaultRoot = path.join(vaultParent, "vault");
    await persistScanResult(await scan(repo, config));
  });

  afterEach(async () => {
    await removeDir(repo);
    await removeDir(vaultParent);
  });

  async function trapOldPlan(): Promise<TrapReceipt> {
    return trap(repo, "docs/old-plan.md", { config, now: () => TRAP_NOW });
  }

  it("passes on a repo where nothing was ever trapped", async () => {
    const result = await verify(repo, { config, now: () => VERIFY_NOW });

    expect(result.passed).toBe(true);
    expect(result.damage).toEqual([]);
    expect(result.restoreCommands).toEqual([]);
    expect(result.verifiedAt).toBe(VERIFY_NOW.toISOString());
  });

  it("passes after trapping a genuinely unreferenced file", async () => {
    await trapOldPlan();
    const result = await verify(repo, { config });

    expect(result.passed).toBe(true);
    expect(result.damage).toEqual([]);
    // the trap left git work behind — reported informationally, never failure
    expect(result.gitStatus.length).toBeGreaterThan(0);
  });

  it("fails on a link to a just-trapped path, ending with the exact restore command", async () => {
    const receipt = await trapOldPlan();
    // the inbound-link race: a reference added after scan judged the file
    await appendFile(path.join(repo, "docs", "guide.md"), "\nSee [the plan](old-plan.md).\n");

    const result = await verify(repo, { config });

    expect(result.passed).toBe(false);
    expect(result.damage).toEqual([
      {
        check: "links",
        from: "docs/guide.md",
        target: "docs/old-plan.md",
        trapId: receipt.trapId,
        restoreCommand: receipt.restoreCommand,
      },
    ]);
    expect(result.restoreCommands).toEqual([`gunk restore ${receipt.trapId}`]);
  });

  it("fails on an agent-context mention of a trapped path (non-markdown mention scan)", async () => {
    const receipt = await trapOldPlan();
    await writeFile(path.join(repo, ".cursorrules"), "Always read docs/old-plan.md first.\n");

    const result = await verify(repo, { config });

    expect(result.passed).toBe(false);
    expect(result.damage).toEqual([
      {
        check: "agent-context-refs",
        from: ".cursorrules",
        target: "docs/old-plan.md",
        trapId: receipt.trapId,
        restoreCommand: receipt.restoreCommand,
      },
    ]);
  });

  it("reports one damage entry, not two, for a markdown link inside an agent-context file", async () => {
    await trapOldPlan();
    await writeFile(path.join(repo, "CLAUDE.md"), "Read [the plan](docs/old-plan.md).\n");

    const result = await verify(repo, { config });

    expect(result.damage).toHaveLength(1);
    expect(result.damage[0]?.check).toBe("links");
  });

  it("keeps pre-existing broken links informational — never failure (delta focus)", async () => {
    await appendFile(
      path.join(repo, "docs", "guide.md"),
      "\nSee [gone](never-existed.md) too.\n",
    );

    const result = await verify(repo, { config });

    expect(result.passed).toBe(true);
    expect(result.damage).toEqual([]);
    expect(result.preexistingBrokenLinks).toHaveLength(1);
    expect(result.preexistingBrokenLinks[0]?.target).toBe("docs/never-existed.md");
  });

  it("keeps pre-existing broken links informational even while trap damage fails the run", async () => {
    const receipt = await trapOldPlan();
    await appendFile(
      path.join(repo, "docs", "guide.md"),
      "\nSee [the plan](old-plan.md) and [gone](never-existed.md).\n",
    );

    const result = await verify(repo, { config });

    expect(result.passed).toBe(false);
    expect(result.damage).toHaveLength(1);
    expect(result.damage[0]?.check).toBe("links");
    expect(result.preexistingBrokenLinks).toHaveLength(1);
    expect(result.restoreCommands).toEqual([receipt.restoreCommand]);
  });

  it("passes again once the damaged trap is restored", async () => {
    const receipt = await trapOldPlan();
    await appendFile(path.join(repo, "docs", "guide.md"), "\nSee [the plan](old-plan.md).\n");
    expect((await verify(repo, { config })).passed).toBe(false);

    await restore(repo, { trapId: receipt.trapId }, { config });

    const result = await verify(repo, { config });
    expect(result.passed).toBe(true);
    expect(result.damage).toEqual([]);
  });

  it("runs verify.commands sequentially, capturing output; all zero exits pass", async () => {
    config.verify.commands = [
      'node -e "console.log(1)"',
      'node -e "console.error(2)"',
    ];

    const result = await verify(repo, { config });

    expect(result.passed).toBe(true);
    expect(result.commands).toHaveLength(2);
    expect(result.commands[0]?.exitCode).toBe(0);
    expect(result.commands[0]?.output).toContain("1");
    expect(result.commands[1]?.output).toContain("2");
  });

  it("fails when a verify.command exits non-zero, with no restore command to offer", async () => {
    config.verify.commands = ['node -e "process.exit(3)"'];

    const result = await verify(repo, { config });

    expect(result.passed).toBe(false);
    expect(result.damage).toEqual([
      { check: "commands", command: 'node -e "process.exit(3)"', exitCode: 3 },
    ]);
    expect(result.restoreCommands).toEqual([]);
  });

  it("dedupes restore commands when several files reference the same trapped path", async () => {
    const receipt = await trapOldPlan();
    await appendFile(path.join(repo, "docs", "guide.md"), "\nSee [a](old-plan.md).\n");
    await appendFile(path.join(repo, "README.md"), "\nSee [b](docs/old-plan.md).\n");

    const result = await verify(repo, { config });

    expect(result.damage).toHaveLength(2);
    expect(result.restoreCommands).toEqual([receipt.restoreCommand]);
  });

  it("reports git status lines informationally without failing", async () => {
    await writeFile(path.join(repo, "untracked.txt"), "hello\n");

    const result = await verify(repo, { config });

    expect(result.passed).toBe(true);
    expect(result.gitStatus.some((line) => line.includes("untracked.txt"))).toBe(true);
  });
});
