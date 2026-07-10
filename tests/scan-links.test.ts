import { afterAll, describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { scan } from "../src/scan.js";
import type { LinkFinding } from "../src/schema.js";
import { createFixtureRepo, removeDir } from "./helpers/fixture.js";

function linkFindings(findings: readonly { type: string }[]): LinkFinding[] {
  return findings.filter((f): f is LinkFinding => f.type === "link");
}

describe("scan(repoRoot, config) — doc graph + broken-link findings (#4)", () => {
  const repos: string[] = [];

  afterAll(async () => {
    await Promise.all(repos.map((repo) => removeDir(repo)));
  });

  it("yields a link finding with path, target, and CERTAIN evidence for a broken markdown link", async () => {
    const repo = await createFixtureRepo("broken-links");
    repos.push(repo);

    const result = await scan(repo, defaultConfig());
    const findings = linkFindings(result.findings);
    const finding = findings.find(
      (f) => f.path === "README.md" && f.target === "docs/missing.md",
    );

    expect(finding).toBeDefined();
    expect(finding?.evidence).toEqual([
      {
        rule: "broken-link",
        confidence: "CERTAIN",
        rationale: expect.any(String),
      },
    ]);
  });

  it("detects a broken link inside an agent-context file (e.g. CLAUDE.md linking a deleted doc)", async () => {
    const repo = await createFixtureRepo("broken-links");
    repos.push(repo);

    const result = await scan(repo, defaultConfig());
    const findings = linkFindings(result.findings);
    const finding = findings.find(
      (f) => f.path === "CLAUDE.md" && f.target === "docs/deleted.md",
    );

    expect(finding).toBeDefined();
    expect(finding?.evidence[0]?.confidence).toBe("CERTAIN");
  });

  it("detects a broken image reference alongside broken markdown links", async () => {
    const repo = await createFixtureRepo("broken-links");
    repos.push(repo);

    const result = await scan(repo, defaultConfig());
    const findings = linkFindings(result.findings);
    const finding = findings.find(
      (f) => f.path === "README.md" && f.target === "assets/missing.png",
    );

    expect(finding).toBeDefined();
    expect(finding?.evidence[0]?.confidence).toBe("CERTAIN");
  });

  it("yields exactly the known-broken references and nothing else — valid links, external URLs, anchors, and directory refs produce no findings", async () => {
    const repo = await createFixtureRepo("broken-links");
    repos.push(repo);

    const result = await scan(repo, defaultConfig());
    const findings = linkFindings(result.findings);

    expect(findings.map((f) => `${f.path} -> ${f.target}`).sort()).toEqual([
      "CLAUDE.md -> docs/deleted.md",
      "README.md -> assets/missing.png",
      "README.md -> docs/missing.md",
    ]);
  });

  it("never makes a network call — external http(s) links are not resolved or checked", async () => {
    const repo = await createFixtureRepo("broken-links");
    repos.push(repo);

    const result = await scan(repo, defaultConfig());
    const findings = linkFindings(result.findings);

    expect(findings.some((f) => f.target.includes("example.com"))).toBe(false);
  });
});
