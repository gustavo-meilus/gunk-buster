import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { scan } from "../src/scan.js";
import type { ScanResult } from "../src/schema.js";
import { fileFindings, pathsWithLabel } from "./helpers/findings.js";
import { createFixtureRepo, removeDir } from "./helpers/fixture.js";

/** Well outside the default 30-day recency window. */
const NINETY_DAYS_AGO = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

describe("scan(repoRoot, config) — GHOST orphan detector (#5)", () => {
  let repo: string;
  let result: ScanResult;

  beforeAll(async () => {
    repo = await createFixtureRepo("orphan-docs", { commitDate: NINETY_DAYS_AGO });
    result = await scan(repo, defaultConfig());
  });

  afterAll(async () => {
    await removeDir(repo);
  });

  it("flags an unreferenced doc as GHOST with one composite STRONG unreferenced evidence -> PROPOSE", () => {
    const finding = fileFindings(result).find((f) => f.path === "docs/old-plan.md");

    expect(finding).toBeDefined();
    expect(finding?.label).toBe("GHOST");
    expect(finding?.verdict).toBe("PROPOSE");
    // One composite evidence, not one per reference graph — correlated
    // "nothing points here" signals are a single fact (ADR-0002).
    expect(finding?.evidence).toHaveLength(1);
    expect(finding?.evidence[0]?.rule).toBe("unreferenced");
    expect(finding?.evidence[0]?.confidence).toBe("STRONG");
  });

  it("names every reference surface that came up empty in the rationale", () => {
    const finding = fileFindings(result).find((f) => f.path === "docs/old-plan.md");
    const rationale = finding?.evidence[0]?.rationale ?? "";

    expect(rationale).toContain("inbound link");
    expect(rationale).toContain("nav");
    expect(rationale).toContain("README");
    expect(rationale).toContain("agent-context");
    expect(rationale).toContain("package.json script");
    expect(rationale).toContain("CI workflow");
  });

  it("flags an asset referenced by no doc as GHOST", () => {
    const finding = fileFindings(result).find((f) => f.path === "assets/unused-diagram.png");

    expect(finding).toBeDefined();
    expect(finding?.label).toBe("GHOST");
    expect(finding?.evidence[0]?.rule).toBe("unreferenced");
  });

  it("flags exactly the two orphans — referenced docs/assets and the README itself never become GHOST", () => {
    expect(pathsWithLabel(result, "GHOST")).toEqual([
      "assets/unused-diagram.png",
      "docs/old-plan.md",
    ]);
  });
});

describe("scan(repoRoot, config) — a single reference from any surface defeats GHOST (#5)", () => {
  let repo: string;
  let result: ScanResult;

  beforeAll(async () => {
    repo = await createFixtureRepo("reference-surface", { commitDate: NINETY_DAYS_AGO });
    result = await scan(repo, defaultConfig());
  });

  afterAll(async () => {
    await removeDir(repo);
  });

  function ghostPaths(): string[] {
    return pathsWithLabel(result, "GHOST");
  }

  it("a doc referenced only by an agent-context markdown file (AGENTS.md link) is not GHOST", () => {
    expect(ghostPaths()).not.toContain("docs/agent-only.md");
  });

  it("a doc referenced only by a non-markdown agent-context file (.cursorrules mention) is not GHOST", () => {
    expect(ghostPaths()).not.toContain("docs/cursor-only.md");
  });

  it("a doc referenced only by a package.json script is not GHOST — scripts are reference surface, not protection", () => {
    expect(ghostPaths()).not.toContain("docs/script-only.md");
  });

  it("a doc referenced only by a CI workflow is not GHOST — CI refs are reference surface, not protection", () => {
    expect(ghostPaths()).not.toContain("docs/ci-only.md");
  });

  it("the control doc referenced by nothing is the only GHOST", () => {
    expect(ghostPaths()).toEqual(["docs/truly-orphan.md"]);
  });
});

describe("scan(repoRoot, config) — RELIC: orphaned + sensitive content (#5)", () => {
  let repo: string;
  let result: ScanResult;

  beforeAll(async () => {
    repo = await createFixtureRepo("sensitive-relics", { commitDate: NINETY_DAYS_AGO });
    result = await scan(repo, defaultConfig());
  });

  afterAll(async () => {
    await removeDir(repo);
  });

  it("flags an orphan with a sensitive path as RELIC at ASK_CHIEF with the keyword protection visible", () => {
    const finding = fileFindings(result).find((f) => f.path === "docs/db-migration-notes.md");

    expect(finding).toBeDefined();
    expect(finding?.label).toBe("RELIC");
    expect(finding?.verdict).toBe("ASK_CHIEF");
    expect(finding?.protections).toContain("sensitive-keyword");
  });

  it("flags an orphan whose path is harmless but whose content is sensitive as RELIC at ASK_CHIEF", () => {
    const finding = fileFindings(result).find((f) => f.path === "docs/incident-review.md");

    expect(finding).toBeDefined();
    expect(finding?.label).toBe("RELIC");
    expect(finding?.verdict).toBe("ASK_CHIEF");
    expect(finding?.protections).toContain("sensitive-keyword");
  });

  it("carries the same composite STRONG unreferenced evidence as GHOST", () => {
    const finding = fileFindings(result).find((f) => f.path === "docs/db-migration-notes.md");

    expect(finding?.evidence).toHaveLength(1);
    expect(finding?.evidence[0]?.rule).toBe("unreferenced");
    expect(finding?.evidence[0]?.confidence).toBe("STRONG");
  });

  it("labels a sensitive orphan RELIC, not GHOST — one finding per file, never both", () => {
    const labels = fileFindings(result).map((f) => [f.path, f.label]);

    expect(labels).not.toContainEqual(["docs/db-migration-notes.md", "GHOST"]);
    expect(labels).not.toContainEqual(["docs/incident-review.md", "GHOST"]);
    expect(fileFindings(result).filter((f) => f.path === "docs/db-migration-notes.md")).toHaveLength(1);
  });

  it("never marks any RELIC SAFE", () => {
    for (const finding of fileFindings(result).filter((f) => f.label === "RELIC")) {
      expect(finding.verdict).toBe("ASK_CHIEF");
    }
    expect(fileFindings(result).some((f) => f.label === "RELIC")).toBe(true);
  });
});
