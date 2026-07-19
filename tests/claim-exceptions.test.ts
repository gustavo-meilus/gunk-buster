import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeClaimException } from "../src/claim-exceptions.js";
import { hashIndexedFile } from "../src/file-index.js";
import { loadRadarResult, persistRadarResult, radar } from "../src/radar.js";
import { commitAll, createEmptyGitRepo, createFixtureRepo, removeDir } from "./helpers/fixture.js";

describe("claim exceptions — Radar engine and persistence (#53)", () => {
  const repos: string[] = [];

  afterEach(async () => {
    await Promise.all(repos.splice(0).map((repo) => removeDir(repo)));
  });

  it("applies one content-pinned decision in persisted Radar output and expires it after an edit", async () => {
    const repo = await createFixtureRepo("pm-drift-lockfile");
    repos.push(repo);
    const initial = await radar(repo);
    const finding = initial.findings.find((candidate) => candidate.check === "package-manager-drift");
    expect(finding).toBeDefined();
    const contentHash = await hashIndexedFile(repo, "README.md");

    await writeClaimException(repo, {
      path: "README.md",
      line: finding!.line,
      check: "package-manager-drift",
      token: finding!.actual,
      contentHash,
      reason: "Intentional migration example.",
      decidedAt: "2026-07-19T00:00:00.000Z",
    });

    const excepted = await radar(repo);
    expect(excepted.counts).toEqual({ byLabel: {}, byCheck: {} });
    expect(excepted.findings).toEqual([
      expect.objectContaining({ disposition: "EXCEPTED", exceptionReason: "Intentional migration example." }),
    ]);
    await persistRadarResult(excepted);
    await expect(loadRadarResult(repo)).resolves.toEqual(excepted);

    await writeFile(path.join(repo, "README.md"), "# Changed example\n\n`npm install`\n");
    const activeAgain = await radar(repo);
    expect(activeAgain.counts.byCheck["package-manager-drift"]).toBe(1);
    expect(activeAgain.findings).toEqual([expect.objectContaining({ disposition: "ACTIVE" })]);
  });

  it("pins an accepted backslash path to its normalized token", async () => {
    const repo = await createEmptyGitRepo();
    repos.push(repo);
    await mkdir(path.join(repo, "docs"), { recursive: true });
    await writeFile(path.join(repo, "AGENTS.md"), "# Instructions\n\n`docs\\missing.md`\n");
    commitAll(repo, "fixture");

    const initial = await radar(repo);
    const finding = initial.findings.find((candidate) => candidate.check === "dead-path");
    expect(finding?.actual).toBe("docs/missing.md");
    await writeClaimException(repo, {
      path: finding!.path,
      line: finding!.line,
      check: finding!.check,
      token: finding!.actual,
      contentHash: finding!.contentHash!,
      reason: "Portable path spelling.",
      decidedAt: "2026-07-19T00:00:00.000Z",
    });

    expect(await radar(repo)).toEqual(expect.objectContaining({
      findings: [expect.objectContaining({ disposition: "EXCEPTED", exceptionReason: "Portable path spelling." })],
    }));
  });
});
