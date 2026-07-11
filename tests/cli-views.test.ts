import { execFile, execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { CONFIG_FILE_NAME } from "../src/config.js";
import { pileResultSchema } from "../src/pile.js";
import { reportResultSchema } from "../src/report.js";
import { fixPlanResultSchema } from "../src/radar.js";
import { createEmptyGitRepo, createFixtureRepo, removeDir } from "./helpers/fixture.js";

const execFileAsync = promisify(execFile);

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const cliPath = path.join(packageRoot, "dist", "cli.js");

/** Well outside the default 30-day recency window, so evidence tier drives the verdict. */
const NINETY_DAYS_AGO = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

interface CliRun {
  exitCode: number;
  stdout: string;
  stderr: string;
}

async function runGunk(cwd: string, ...args: string[]): Promise<CliRun> {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [cliPath, ...args], { cwd });
    return { exitCode: 0, stdout, stderr };
  } catch (error) {
    const e = error as { code?: number; stdout?: string; stderr?: string };
    return { exitCode: e.code ?? -1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
}

async function setVoice(repo: string, voice: "chief" | "professional"): Promise<void> {
  await writeFile(path.join(repo, CONFIG_FILE_NAME), JSON.stringify({ voice }));
}

beforeAll(() => {
  execSync("pnpm build", { cwd: packageRoot, stdio: "pipe" });
});

describe("gunk pile / gunk report — CLI views over the persisted scan index (#7)", () => {
  const repos: string[] = [];

  afterEach(async () => {
    await Promise.all(repos.splice(0).map((repo) => removeDir(repo)));
  });

  it("errors helpfully and exits non-zero when no scan index exists yet", async () => {
    const repo = await createFixtureRepo("clean-repo");
    repos.push(repo);

    const pileRun = await runGunk(repo, "pile");
    expect(pileRun.exitCode).not.toBe(0);
    expect(pileRun.stderr).toContain("gunk scan");

    const reportRun = await runGunk(repo, "report");
    expect(reportRun.exitCode).not.toBe(0);
    expect(reportRun.stderr).toContain("gunk scan");
  });

  it("gunk pile renders findings grouped by label with counts and verdicts, exit 0", async () => {
    const repo = await createFixtureRepo("generated-dumps", { commitDate: NINETY_DAYS_AGO });
    repos.push(repo);

    const scanRun = await runGunk(repo, "scan");
    expect(scanRun.exitCode).toBe(0);

    const pileRun = await runGunk(repo, "pile");
    expect(pileRun.exitCode).toBe(0);
    expect(pileRun.stdout).toContain("DUMP");
    expect(pileRun.stdout).toContain("4");
    expect(pileRun.stdout).toMatch(/SAFE|PROPOSE/);
    // The findings themselves render, not just the tallies (spec: pile shows
    // grouped findings "with verdicts and evidence").
    expect(pileRun.stdout).toContain("dist/bundle.js");
    // Chief voice is the default.
    expect(pileRun.stdout).toContain("Chief");
  });

  it("gunk pile --json emits a schema-versioned, persona-free PileResult, exit 0", async () => {
    const repo = await createFixtureRepo("generated-dumps", { commitDate: NINETY_DAYS_AGO });
    repos.push(repo);

    await runGunk(repo, "scan");
    const run = await runGunk(repo, "pile", "--json");
    expect(run.exitCode).toBe(0);

    const parsed = pileResultSchema.parse(JSON.parse(run.stdout));
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.groups).toEqual([
      expect.objectContaining({ label: "DUMP", count: 4 }),
    ]);
    expect(run.stdout.toLowerCase()).not.toContain("chief");
  });

  it("gunk pile on a clean scan (no findings) says so plainly and still exits 0", async () => {
    const repo = await createFixtureRepo("clean-repo");
    repos.push(repo);

    await runGunk(repo, "scan");
    const run = await runGunk(repo, "pile");
    expect(run.exitCode).toBe(0);
    expect(run.stdout.trim()).not.toBe("");

    const jsonRun = await runGunk(repo, "pile", "--json");
    expect(jsonRun.exitCode).toBe(0);
    const parsed = pileResultSchema.parse(JSON.parse(jsonRun.stdout));
    expect(parsed.groups).toEqual([]);
  });

  it("gunk report writes a markdown report into .gunk-buster/reports/, exit 0", async () => {
    const repo = await createFixtureRepo("generated-dumps", { commitDate: NINETY_DAYS_AGO });
    repos.push(repo);

    await runGunk(repo, "scan");
    const run = await runGunk(repo, "report");
    expect(run.exitCode).toBe(0);
    expect(run.stdout).toContain("Chief");

    const reportPath = path.join(repo, ".gunk-buster", "reports", "report.md");
    expect(existsSync(reportPath)).toBe(true);
    const markdown = await readFile(reportPath, "utf8");
    expect(markdown).toContain("DUMP");
    expect(markdown).toContain("dist/bundle.js");
  });

  it("re-running gunk report does not require a rescan and stays exit 0", async () => {
    const repo = await createFixtureRepo("generated-dumps", { commitDate: NINETY_DAYS_AGO });
    repos.push(repo);

    await runGunk(repo, "scan");
    const first = await runGunk(repo, "report", "--json");
    expect(first.exitCode).toBe(0);
    const firstParsed = reportResultSchema.parse(JSON.parse(first.stdout));

    // No second `scan` call in between — report must work from the
    // already-persisted index alone.
    const second = await runGunk(repo, "report", "--json");
    expect(second.exitCode).toBe(0);
    const secondParsed = reportResultSchema.parse(JSON.parse(second.stdout));

    expect(secondParsed.reportPath).toBe(firstParsed.reportPath);
    expect(secondParsed.findingsCount).toBe(firstParsed.findingsCount);
  });

  it("gunk report --json emits a schema-versioned, persona-free ReportResult, exit 0", async () => {
    const repo = await createFixtureRepo("generated-dumps", { commitDate: NINETY_DAYS_AGO });
    repos.push(repo);

    await runGunk(repo, "scan");
    const run = await runGunk(repo, "report", "--json");
    expect(run.exitCode).toBe(0);

    const parsed = reportResultSchema.parse(JSON.parse(run.stdout));
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.findingsCount).toBe(4);
    expect(run.stdout.toLowerCase()).not.toContain("chief");
  });

  it("the internal .gitignore covers the reports directory too, after a scan", async () => {
    const repo = await createFixtureRepo("clean-repo");
    repos.push(repo);

    await runGunk(repo, "scan");
    const ignore = await readFile(path.join(repo, ".gunk-buster", ".gitignore"), "utf8");
    expect(ignore).toContain("scan.json");
    expect(ignore).toContain("reports/");
  });

  it("voice: professional removes the persona and all user address from scan, pile, and report", async () => {
    const repo = await createFixtureRepo("generated-dumps", { commitDate: NINETY_DAYS_AGO });
    repos.push(repo);
    await setVoice(repo, "professional");

    const scanRun = await runGunk(repo, "scan");
    expect(scanRun.exitCode).toBe(0);
    expect(scanRun.stdout.toLowerCase()).not.toContain("chief");

    const pileRun = await runGunk(repo, "pile");
    expect(pileRun.exitCode).toBe(0);
    expect(pileRun.stdout.toLowerCase()).not.toContain("chief");
    expect(pileRun.stdout).toContain("DUMP");

    const reportRun = await runGunk(repo, "report");
    expect(reportRun.exitCode).toBe(0);
    expect(reportRun.stdout.toLowerCase()).not.toContain("chief");
  });

  it("no persona string ever appears in --json output, regardless of voice setting", async () => {
    for (const voice of ["chief", "professional"] as const) {
      const repo = await createFixtureRepo("generated-dumps", { commitDate: NINETY_DAYS_AGO });
      repos.push(repo);
      await setVoice(repo, voice);

      const scanRun = await runGunk(repo, "scan", "--json");
      expect(scanRun.stdout.toLowerCase()).not.toContain("chief");

      const pileRun = await runGunk(repo, "pile", "--json");
      expect(pileRun.stdout.toLowerCase()).not.toContain("chief");

      const reportRun = await runGunk(repo, "report", "--json");
      expect(reportRun.stdout.toLowerCase()).not.toContain("chief");
    }
  });

  it("gunk pile --json on a missing scan index still errors on stderr, not a thrown JSON blob", async () => {
    const dir = await createEmptyGitRepo();
    try {
      const run = await runGunk(dir, "pile", "--json");
      expect(run.exitCode).not.toBe(0);
      expect(run.stdout).toBe("");
      expect(run.stderr).toContain("gunk scan");
    } finally {
      await removeDir(dir);
    }
  });
});

describe("gunk pile / gunk report — merging the radar index in when it exists (#13)", () => {
  const repos: string[] = [];

  afterEach(async () => {
    await Promise.all(repos.splice(0).map((repo) => removeDir(repo)));
  });

  it("gunk pile shows BAIT/MOLD groups alongside the scan groups once radar has run too", async () => {
    const repo = await createFixtureRepo("radar-merge", { commitDate: NINETY_DAYS_AGO });
    repos.push(repo);

    expect((await runGunk(repo, "scan")).exitCode).toBe(0);
    expect((await runGunk(repo, "radar")).exitCode).toBe(0);

    const pileRun = await runGunk(repo, "pile");
    expect(pileRun.exitCode).toBe(0);
    expect(pileRun.stdout).toContain("DUMP");
    expect(pileRun.stdout).toContain("BAIT");
    expect(pileRun.stdout).toContain("CLAUDE.md");

    const jsonRun = await runGunk(repo, "pile", "--json");
    expect(jsonRun.exitCode).toBe(0);
    const parsed = pileResultSchema.parse(JSON.parse(jsonRun.stdout));
    expect(parsed.groups.map((g) => g.label).sort()).toEqual(["BAIT", "DUMP"]);
    expect(jsonRun.stdout.toLowerCase()).not.toContain("chief");
  });

  it("gunk report writes a report including the radar findings once radar has run too", async () => {
    const repo = await createFixtureRepo("radar-merge", { commitDate: NINETY_DAYS_AGO });
    repos.push(repo);

    expect((await runGunk(repo, "scan")).exitCode).toBe(0);
    expect((await runGunk(repo, "radar")).exitCode).toBe(0);

    const reportRun = await runGunk(repo, "report");
    expect(reportRun.exitCode).toBe(0);

    const reportPath = path.join(repo, ".gunk-buster", "reports", "report.md");
    const markdown = await readFile(reportPath, "utf8");
    expect(markdown).toContain("DUMP");
    expect(markdown).toContain("BAIT");
    expect(markdown).toContain("CLAUDE.md");
  });

  /**
   * Volatile per-run fields (scannedAt, the temp-dir repoRoot) differ even
   * between two runs over byte-identical fixture content, so "byte-identical"
   * is checked with those normalized away — the same technique the engine
   * seam's own inline snapshots use (tests/radar.test.ts).
   */
  function normalizeVolatile(document: Record<string, unknown>): unknown {
    return {
      ...document,
      scannedAt: "<scannedAt>",
      repoRoot: "<repoRoot>",
      ...("reportPath" in document ? { reportPath: "<reportPath>" } : {}),
    };
  }

  it("without a radar index, gunk pile/report JSON output stays structurally identical to running scan alone", async () => {
    const withoutRadar = await createFixtureRepo("generated-dumps", { commitDate: NINETY_DAYS_AGO });
    const withRadarButUnrun = await createFixtureRepo("generated-dumps", { commitDate: NINETY_DAYS_AGO });
    repos.push(withoutRadar, withRadarButUnrun);

    await runGunk(withoutRadar, "scan");
    await runGunk(withRadarButUnrun, "scan");
    // Neither repo has run `gunk radar` — both must render identically once
    // volatile per-run fields are normalized away.

    const pileA = await runGunk(withoutRadar, "pile", "--json");
    const pileB = await runGunk(withRadarButUnrun, "pile", "--json");
    expect(normalizeVolatile(JSON.parse(pileA.stdout))).toEqual(
      normalizeVolatile(JSON.parse(pileB.stdout)),
    );
    // Neither carries the radar-merge fields at all — not just empty ones.
    expect(JSON.parse(pileA.stdout)).not.toHaveProperty("radarScannedAt");

    const pileHumanA = await runGunk(withoutRadar, "pile");
    const pileHumanB = await runGunk(withRadarButUnrun, "pile");
    expect(pileHumanA.stdout).toBe(pileHumanB.stdout);

    const reportA = await runGunk(withoutRadar, "report", "--json");
    const reportB = await runGunk(withRadarButUnrun, "report", "--json");
    expect(normalizeVolatile(JSON.parse(reportA.stdout))).toEqual(
      normalizeVolatile(JSON.parse(reportB.stdout)),
    );
    expect(JSON.parse(reportA.stdout)).not.toHaveProperty("radarScannedAt");

    const reportPathA = path.join(withoutRadar, ".gunk-buster", "reports", "report.md");
    const reportPathB = path.join(withRadarButUnrun, ".gunk-buster", "reports", "report.md");
    function normalizeMarkdown(markdown: string): string {
      return markdown
        .replace(/- Scanned: .*/, "- Scanned: <scannedAt>")
        .replace(/- Repo: .*/, "- Repo: <repoRoot>");
    }
    const markdownA = normalizeMarkdown(await readFile(reportPathA, "utf8"));
    const markdownB = normalizeMarkdown(await readFile(reportPathB, "utf8"));
    expect(markdownA).toBe(markdownB);
    expect(markdownA).not.toContain("Radar scanned");
  });
});

describe("gunk radar --fix-plan — the aggregated suggestion checklist (#13)", () => {
  const repos: string[] = [];

  afterEach(async () => {
    await Promise.all(repos.splice(0).map((repo) => removeDir(repo)));
  });

  it("lists only suggestion-carrying findings as a checklist, human and JSON", async () => {
    const repo = await createFixtureRepo("pm-drift-field");
    repos.push(repo);

    const humanRun = await runGunk(repo, "radar", "--fix-plan");
    expect(humanRun.exitCode).toBe(0);
    expect(humanRun.stdout).toContain("CLAUDE.md");
    expect(humanRun.stdout).toContain("pnpm install");
    expect(() => JSON.parse(humanRun.stdout)).toThrow();

    const jsonRun = await runGunk(repo, "radar", "--fix-plan", "--json");
    expect(jsonRun.exitCode).toBe(0);
    const parsed = fixPlanResultSchema.parse(JSON.parse(jsonRun.stdout));
    expect(parsed.items.length).toBeGreaterThan(0);
    expect(parsed.items.every((item) => item.suggestion.replace !== undefined)).toBe(true);
    expect(jsonRun.stdout.toLowerCase()).not.toContain("chief");
  });

  it("still persists radar.json — --fix-plan only changes what's printed", async () => {
    const repo = await createFixtureRepo("pm-drift-field");
    repos.push(repo);

    await runGunk(repo, "radar", "--fix-plan");
    expect(existsSync(path.join(repo, ".gunk-buster", "radar.json"))).toBe(true);
  });
});
