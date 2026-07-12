import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defaultConfig, type GunkConfig } from "../src/config.js";
import { GunkError } from "../src/errors.js";
import { fix } from "../src/fix.js";
import { persistRadarResult, radar } from "../src/radar.js";
import { commitAll, createFixtureRepo, removeDir } from "./helpers/fixture.js";

/**
 * pm-drift-lockfile: README.md line 3, `Install dependencies with \`npm
 * install\`.\r\n` (CRLF — proves fix() round-trips line endings it doesn't
 * touch), one CERTAIN MOLD claim finding with a suggestion (npm -> pnpm,
 * since the fixture's lone lockfile is pnpm's).
 */
async function setUpFixableRepo(): Promise<{ repo: string; config: GunkConfig }> {
  const repo = await createFixtureRepo("pm-drift-lockfile");
  const config = defaultConfig();
  await persistRadarResult(await radar(repo, config));
  return { repo, config };
}

describe("fix(repoRoot, opts) — engine seam", () => {
  let repo: string;

  afterEach(async () => {
    if (repo) await removeDir(repo);
  });

  it("refuses without confirmation, mentioning --yes, and mutates nothing", async () => {
    ({ repo } = await setUpFixableRepo());
    const config = defaultConfig();

    await expect(fix(repo, { config })).rejects.toBeInstanceOf(GunkError);
    await expect(fix(repo, { config })).rejects.toThrow(/--yes/);

    const readme = await readFile(path.join(repo, "README.md"), "utf8");
    expect(readme).toContain("npm install");
  });

  it("requires a persisted radar index — no radar, no fix", async () => {
    repo = await createFixtureRepo("pm-drift-lockfile");
    const config = defaultConfig();

    await expect(fix(repo, { config, confirmed: true })).rejects.toThrow(/radar/i);
  });

  it("applies the suggestion in place, byte-identical elsewhere (CRLF preserved)", async () => {
    ({ repo } = await setUpFixableRepo());
    const config = defaultConfig();
    const before = await readFile(path.join(repo, "README.md"));

    const result = await fix(repo, { config, confirmed: true });

    expect(result.skipped).toEqual([]);
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

    const after = await readFile(path.join(repo, "README.md"));
    const expected = before.toString("utf8").replace("npm install", "pnpm install");
    expect(after.toString("utf8")).toBe(expected);
    // only the flagged substring changed — everything else byte-identical
    expect(after.toString("utf8")).toContain("\r\n\r\nInstall dependencies with `pnpm install`.\r\n");
  });

  it("staleness guard: skips when the flagged text has changed since radar ran", async () => {
    ({ repo } = await setUpFixableRepo());
    const config = defaultConfig();

    await writeFile(
      path.join(repo, "README.md"),
      "# pm-drift-lockfile fixture\r\n\r\nAlready using pnpm, nothing to see here.\r\n",
    );
    commitAll(repo, "edit past the recorded claim");

    const result = await fix(repo, { config, confirmed: true });

    expect(result.applied).toEqual([]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.path).toBe("README.md");
    expect(result.skipped[0]?.reason).toMatch(/re-run radar/i);
  });

  it("git guard: skips a dirty tracked target with a warning; --force overrides it", async () => {
    ({ repo } = await setUpFixableRepo());
    const config = defaultConfig();

    // Uncommitted edit that leaves line 3's flagged text untouched, so only
    // the git-dirty guard (not staleness) is under test.
    await writeFile(
      path.join(repo, "README.md"),
      "# pm-drift-lockfile fixture\r\n\r\nInstall dependencies with `npm install`.\r\n\r\nuncommitted note\r\n",
    );

    const warnings: string[] = [];
    const skippedResult = await fix(repo, {
      config,
      confirmed: true,
      onWarning: (w) => warnings.push(w),
    });

    expect(skippedResult.applied).toEqual([]);
    expect(skippedResult.skipped).toHaveLength(1);
    expect(skippedResult.skipped[0]?.reason).toMatch(/--force/);
    expect(warnings).toHaveLength(1);
    const readmeAfterSkip = await readFile(path.join(repo, "README.md"), "utf8");
    expect(readmeAfterSkip).toContain("npm install");

    const forcedResult = await fix(repo, { config, confirmed: true, force: true });
    expect(forcedResult.skipped).toEqual([]);
    expect(forcedResult.applied).toHaveLength(1);
    const readmeAfterForce = await readFile(path.join(repo, "README.md"), "utf8");
    expect(readmeAfterForce).toContain("pnpm install");
  });

  it("git guard: skips an untracked target with a warning; --force overrides it", async () => {
    repo = await createFixtureRepo("pm-drift-lockfile");
    const config = defaultConfig();
    await writeFile(
      path.join(repo, "docs.md"),
      "Untracked doc. Run `npm install` first.\n",
    );
    await persistRadarResult(await radar(repo, config));

    const warnings: string[] = [];
    const skippedResult = await fix(repo, {
      config,
      confirmed: true,
      onWarning: (w) => warnings.push(w),
    });

    const untrackedSkip = skippedResult.skipped.find((s) => s.path === "docs.md");
    expect(untrackedSkip?.reason).toMatch(/untracked/i);
    expect(warnings.some((w) => /untracked/i.test(w))).toBe(true);
    expect(existsSync(path.join(repo, "docs.md"))).toBe(true);
    let stillUntracked = await readFile(path.join(repo, "docs.md"), "utf8");
    expect(stillUntracked).toContain("npm install");

    const forcedResult = await fix(repo, { config, confirmed: true, force: true });
    const untrackedApplied = forcedResult.applied.find((a) => a.path === "docs.md");
    expect(untrackedApplied).toBeDefined();
    stillUntracked = await readFile(path.join(repo, "docs.md"), "utf8");
    expect(stillUntracked).toContain("pnpm install");
  });

  it("no receipts are written for edits — nothing appears under .gunk-buster/receipts", async () => {
    ({ repo } = await setUpFixableRepo());
    const config = defaultConfig();

    await fix(repo, { config, confirmed: true });

    expect(existsSync(path.join(repo, ".gunk-buster", "receipts"))).toBe(false);
  });
});
