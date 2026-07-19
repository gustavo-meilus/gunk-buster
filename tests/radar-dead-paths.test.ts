import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { radar } from "../src/radar.js";
import type { ClaimFinding, RadarResult } from "../src/schema.js";
import { createFixtureRepo, removeDir } from "./helpers/fixture.js";

function deadPathFindings(result: RadarResult): ClaimFinding[] {
  return result.findings.filter((f) => f.check === "dead-path");
}

describe("radar(repoRoot, config) — dead-path check (#11)", () => {
  let repo: string;
  let result: RadarResult;

  beforeAll(async () => {
    repo = await createFixtureRepo("dead-paths");
    result = await radar(repo, defaultConfig());
  });

  afterAll(async () => {
    await removeDir(repo);
  });

  it("flags a deleted source path mentioned in an agent-context file's code span as STRONG BAIT", () => {
    const finding = deadPathFindings(result).find(
      (f) => f.path === "AGENTS.md" && f.actual === "src/old-module.ts",
    );

    expect(finding).toBeDefined();
    expect(finding?.label).toBe("BAIT");
    expect(finding?.line).toBe(3);
    expect(finding?.evidence[0]?.confidence).toBe("STRONG");
    expect(finding?.evidence.every((e) => e.confidence !== "CERTAIN")).toBe(true);
    expect(finding?.expected).toBe("a git-tracked file or directory");
    expect(finding?.suggestion).toBeUndefined();
  });

  it("flags the same shape of dead path in an ordinary doc as MOLD", () => {
    const finding = deadPathFindings(result).find(
      (f) => f.path === "README.md" && f.actual === "docs/removed-notes.md",
    );

    expect(finding).toBeDefined();
    expect(finding?.label).toBe("MOLD");
    expect(finding?.line).toBe(3);
  });

  it("locates a dead path inside a fenced code block at the correct content line, not the fence line", () => {
    const finding = deadPathFindings(result).find(
      (f) => f.path === "AGENTS.md" && f.actual === "scripts/build-legacy.sh",
    );

    expect(finding).toBeDefined();
    // Line 17 is the opening fence; line 18 is the content line.
    expect(finding?.line).toBe(18);
  });

  it("never flags an existing tracked file mentioned in a code span", () => {
    const paths = deadPathFindings(result).filter((f) => f.path === "AGENTS.md").map((f) => f.actual);
    expect(paths).not.toContain("src/index.ts");
  });

  it("never flags an existing tracked directory mentioned in a code span", () => {
    const paths = deadPathFindings(result).map((f) => f.actual);
    expect(paths).not.toContain("src/");
    expect(paths).not.toContain("src");
  });

  it("skips a glob-shaped token", () => {
    const paths = deadPathFindings(result).map((f) => f.actual);
    expect(paths).not.toContain("src/*.ts");
  });

  it("skips placeholder-syntax tokens (<...>, {...}, $VAR)", () => {
    const paths = deadPathFindings(result).map((f) => f.actual);
    expect(paths).not.toContain("<repo>/config.json");
    expect(paths).not.toContain("{project}/README.md");
    expect(paths).not.toContain("$HOME/notes.md");
  });

  it("skips a URL-scheme token even though it looks path-shaped after the scheme", () => {
    const paths = deadPathFindings(result).map((f) => f.actual);
    expect(paths).not.toContain("https://example.com/src/old-module.ts");
  });

  it("retains the FFmpeg expression and numeric-ratio reproductions without dead-path claims", () => {
    const paths = deadPathFindings(result).map((f) => f.actual);
    expect(paths).not.toContain("scale=iw*min(1920/iw)");
    expect(paths).not.toContain("16/9");
    expect(paths).not.toContain("4/3");
  });

  it("does not mistake MIME types or scoped packages for repository paths", () => {
    const paths = deadPathFindings(result).map((f) => f.actual);
    expect(paths).not.toContain("video/mp4");
    expect(paths).not.toContain("@scope/package");
  });

  it("skips drive-qualified and UNC machine-local paths", () => {
    const paths = deadPathFindings(result).map((f) => f.actual);
    expect(paths).not.toContain("C:\\Users\\chief\\notes.md");
    expect(paths).not.toContain("\\\\server\\share\\notes.md");
  });

  it("skips a token matching a .gitignore pattern (probable build product, not a claim)", () => {
    const paths = deadPathFindings(result).map((f) => f.actual);
    expect(paths).not.toContain("dist/bundle.js");
  });

  it("does not double-report a path already reported as a broken markdown link in the same file", () => {
    // docs/guide.md links to docs/old-notes.md (broken, MVP 1's concern) AND
    // separately mentions the same path in a code span — only the link
    // finding should exist; radar's dead-path check must not also flag it.
    const finding = deadPathFindings(result).find(
      (f) => f.path === "docs/guide.md" && f.actual === "docs/old-notes.md",
    );
    expect(finding).toBeUndefined();
  });

  it("never flags a bare filename mention — a bare filename is not provably a claim about this repo", () => {
    const paths = deadPathFindings(result).map((f) => f.actual);
    expect(paths).toContain("CLAUDE.md");
    expect(paths).toContain("missing-notes.md");
  });

  it("never flags a slash-command or a lone slash", () => {
    const paths = deadPathFindings(result).map((f) => f.actual);
    expect(paths).not.toContain("/deploy-now");
    expect(paths).not.toContain("/");
  });

  it("resolves a root-anchored mention of a tracked file without flagging it", () => {
    const paths = deadPathFindings(result).map((f) => f.actual);
    expect(paths).not.toContain("/src/index.ts");
  });

  it("resolves unanchored mentions only from the containing document with no root fallback", () => {
    const guideFindings = deadPathFindings(result).filter((f) => f.path === "docs/guide.md");
    expect(guideFindings.map((f) => f.actual)).not.toContain("../src/index.ts");
    expect(guideFindings.map((f) => f.actual)).not.toContain("..\\src\\index.ts");
    expect(guideFindings.map((f) => f.actual)).toContain("src/index.ts");
  });

  it("flags a root-anchored mention of a missing file (leading / stripped, then checked)", () => {
    const finding = deadPathFindings(result).find(
      (f) => f.path === "AGENTS.md" && f.actual === "src/gone.ts",
    );
    expect(finding).toBeDefined();
    expect(finding?.line).toBe(25);
    expect(finding?.evidence[0]?.confidence).toBe("STRONG");
  });

  it("disables entirely when radar.checks.deadPaths is false", async () => {
    const config = defaultConfig();
    const disabled = { ...config, radar: { ...config.radar, checks: { ...config.radar.checks, deadPaths: false } } };
    const disabledResult = await radar(repo, disabled);
    expect(deadPathFindings(disabledResult)).toEqual([]);
  });
});
