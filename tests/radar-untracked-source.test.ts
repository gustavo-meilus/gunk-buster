import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { radar } from "../src/radar.js";
import type { RadarResult } from "../src/schema.js";
import { createFixtureRepo, removeDir } from "./helpers/fixture.js";
import { claimFindingsFor } from "./helpers/findings.js";

/**
 * Regression: an untracked doc or agent-context file must still be audited by
 * Radar. Commit 7c5d358 ("honor current inventory in document references")
 * gated the doc graph's parsed-source set on the git index, which correctly
 * stopped untracked content from *proving liveness* but wrongly stopped
 * untracked source documents from being *parsed at all*. Checks that read the
 * doc graph (context-bloat's README-duplication rule) then silently skipped
 * every untracked source, so a brand-new, never-added agent-context file that
 * duplicates the README produced no Radar finding.
 *
 * The current repository inventory (git index) still defines what a reference
 * can resolve to; an untracked source may claim things, but may not rescue
 * anything from GHOST. See ADR-0013.
 */
describe("radar(repoRoot, config) — untracked source documents are still audited", () => {
  let repo: string;
  let result: RadarResult;

  beforeAll(async () => {
    // context-bloat fixture ships a tracked README.md with the heading
    // structure [Installation, Usage, License]; everything is committed.
    repo = await createFixtureRepo("context-bloat");

    // A never-added agent-context file that duplicates the README's heading
    // structure. `.claude/**` is agent-context by directory, so the filename
    // is free of the tracked AGENTS.md/CLAUDE.md the fixture already owns.
    await mkdir(path.join(repo, ".claude"), { recursive: true });
    await writeFile(
      path.join(repo, ".claude", "guide.md"),
      "# Widget Project\n\n## Installation\n\nRun the installer here too.\n\n## Usage\n\nUse the widget here too.\n\n## License\n\nMIT here too.\n",
    );

    result = await radar(repo, defaultConfig());
  });

  afterAll(async () => {
    await removeDir(repo);
  });

  it("flags an untracked agent-context file that duplicates the README's heading structure", () => {
    const findings = claimFindingsFor(result, "context-bloat").filter(
      (f) => f.path === ".claude/guide.md",
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]?.label).toBe("BAIT");
    expect(findings[0]?.evidence[0]?.rule).toBe("duplicates-readme-structure");
    expect(findings[0]?.evidence[0]?.rationale).toContain("README.md");
  });
});
