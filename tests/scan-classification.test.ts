import { writeFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { scan } from "../src/scan.js";
import { commitAll, createFixtureRepo, removeDir } from "./helpers/fixture.js";
import { NINETY_DAYS_AGO, fileFindings } from "./helpers/findings.js";

describe("scan(repoRoot, config) — DUMP detector via the classification pipeline (#3)", () => {
  const repos: string[] = [];

  afterAll(async () => {
    await Promise.all(repos.map((repo) => removeDir(repo)));
  });

  it("yields DUMP findings with evidence and verdicts for committed generated artifacts", async () => {
    const repo = await createFixtureRepo("generated-dumps", { commitDate: NINETY_DAYS_AGO });
    repos.push(repo);

    const result = await scan(repo, defaultConfig());
    const findings = fileFindings(result);
    const byPath = new Map(findings.map((f) => [f.path, f]));

    // Only the four known generated artifacts get findings; README.md does not.
    expect([...byPath.keys()].sort()).toEqual([
      "app.tsbuildinfo",
      "build.log",
      "coverage/lcov.info",
      "dist/bundle.js",
    ]);

    for (const finding of findings) {
      expect(finding.label).toBe("DUMP");
      expect(finding.evidence.length).toBeGreaterThan(0);
      for (const evidence of finding.evidence) {
        expect(evidence.rule).toEqual(expect.any(String));
        expect(["CERTAIN", "STRONG", "WEAK"]).toContain(evidence.confidence);
        expect(evidence.rationale.length).toBeGreaterThan(0);
      }
    }

    // Dir-based matches (whole build/coverage output directories) are CERTAIN -> SAFE.
    expect(byPath.get("dist/bundle.js")?.evidence[0]?.confidence).toBe("CERTAIN");
    expect(byPath.get("dist/bundle.js")?.verdict).toBe("SAFE");
    expect(byPath.get("coverage/lcov.info")?.evidence[0]?.confidence).toBe("CERTAIN");
    expect(byPath.get("coverage/lcov.info")?.verdict).toBe("SAFE");

    // Extension-based matches are weaker: STRONG -> PROPOSE.
    expect(byPath.get("build.log")?.evidence[0]?.confidence).toBe("STRONG");
    expect(byPath.get("build.log")?.verdict).toBe("PROPOSE");
    expect(byPath.get("app.tsbuildinfo")?.evidence[0]?.confidence).toBe("STRONG");
    expect(byPath.get("app.tsbuildinfo")?.verdict).toBe("PROPOSE");
  });

  it("computes correct counts.byVerdict and counts.byLabel", async () => {
    const repo = await createFixtureRepo("generated-dumps", { commitDate: NINETY_DAYS_AGO });
    repos.push(repo);

    const result = await scan(repo, defaultConfig());

    expect(result.counts).toEqual({
      byVerdict: { SAFE: 2, PROPOSE: 2 },
      byLabel: { DUMP: 4 },
    });
  });

  it("never surfaces hard-protected files as findings, even when they match a generated pattern", async () => {
    const repo = await createFixtureRepo("protected-files", { commitDate: NINETY_DAYS_AGO });
    repos.push(repo);

    const result = await scan(repo, defaultConfig());

    // Every file in this fixture is either code or sits under a hard-protected
    // path (.github/workflows, migrations/, infra/) — some of those also match
    // the DUMP generated-artifact pattern (*.log, dist/). None may appear.
    expect(result.findings).toEqual([]);
    expect(result.counts).toEqual({ byVerdict: {}, byLabel: {} });
  });

  it("caps a recently-modified gunk candidate at ASK_CHIEF, never SAFE", async () => {
    const repo = await createFixtureRepo("recently-modified", { commitDate: NINETY_DAYS_AGO });
    repos.push(repo);

    // Re-touch the candidate file and commit at "now" — inside the default
    // 30-day recency window — while the rest of the repo stays old.
    await writeFile(
      path.join(repo, "dist", "bundle.js"),
      'console.log("old build");\nconsole.log("touched");\n',
    );
    commitAll(repo, "touch dist/bundle.js");

    const result = await scan(repo, defaultConfig());
    const findings = fileFindings(result);
    const finding = findings.find((f) => f.path === "dist/bundle.js");

    expect(finding).toBeDefined();
    // Evidence alone (build-dir match) would be CERTAIN -> SAFE; the recency
    // protection caps it at ASK_CHIEF regardless.
    expect(finding?.evidence[0]?.confidence).toBe("CERTAIN");
    expect(finding?.verdict).toBe("ASK_CHIEF");
    expect(finding?.protections).toContain("recently-modified");
  });
});
