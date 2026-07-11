import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { configSchema, defaultConfig } from "../src/config.js";
import { radar } from "../src/radar.js";
import type { RadarResult } from "../src/schema.js";
import { createFixtureRepo, removeDir } from "./helpers/fixture.js";
import { claimFindingsFor } from "./helpers/findings.js";

/**
 * context-bloat (#12) — word budget and README duplication, agent-context
 * files only. See tests/fixtures/context-bloat for the fixture layout:
 *
 * - README.md: title "Widget Project", headings [Installation, Usage, License].
 * - AGENTS.md: agent-context, same title + headings as README (34 words) — a
 *   README-duplication candidate that is also over a very low word budget.
 * - CLAUDE.md: agent-context, distinct title/headings (16 words) — a
 *   word-budget candidate with no structural duplication.
 * - .cursorrules: agent-context, not markdown so never structure-compared,
 *   exactly 5 words — the "under budget, distinct structure -> nothing" case.
 * - docs/echo-readme.md: an ordinary doc (not agent-context) duplicating the
 *   README's structure at large size — must never be a bloat candidate.
 */
describe("radar(repoRoot, config) — context-bloat check (#12)", () => {
  let repo: string;

  beforeAll(async () => {
    repo = await createFixtureRepo("context-bloat");
  });

  afterAll(async () => {
    await removeDir(repo);
  });

  describe("README duplication rule, at the default 2500-word budget (no fixture file gets near it)", () => {
    let result: RadarResult;

    beforeAll(async () => {
      result = await radar(repo, defaultConfig());
    });

    it("flags AGENTS.md as STRONG BAIT for duplicating the README's heading structure, naming README.md", () => {
      const findings = claimFindingsFor(result, "context-bloat").filter(
        (f) => f.path === "AGENTS.md",
      );

      expect(findings).toHaveLength(1);
      const finding = findings[0];
      expect(finding?.label).toBe("BAIT");
      expect(finding?.type).toBe("claim");
      expect(finding?.line).toBe(1);
      expect(finding?.evidence[0]?.confidence).toBe("STRONG");
      expect(finding?.evidence[0]?.rule).toBe("duplicates-readme-structure");
      expect(finding?.evidence[0]?.rationale).toContain("README.md");
      expect(finding?.expected).toContain("README.md");
      expect(finding?.actual).toContain("README.md");
      expect(finding?.suggestion).toBeUndefined();
    });

    it("does not flag CLAUDE.md — distinct title/headings from the README, well under budget", () => {
      const findings = claimFindingsFor(result, "context-bloat").filter(
        (f) => f.path === "CLAUDE.md",
      );
      expect(findings).toEqual([]);
    });

    it("never flags the ordinary doc that duplicates the README's structure", () => {
      const findings = claimFindingsFor(result, "context-bloat").filter(
        (f) => f.path === "docs/echo-readme.md",
      );
      expect(findings).toEqual([]);
    });
  });

  describe("word budget rule, at a very low custom budget (radar.bloatWordBudget honored)", () => {
    let result: RadarResult;

    beforeAll(async () => {
      const config = configSchema.parse({ radar: { bloatWordBudget: 5 } });
      result = await radar(repo, config);
    });

    it("flags CLAUDE.md (16 words) as WEAK BAIT naming the budget and the actual count", () => {
      const findings = claimFindingsFor(result, "context-bloat").filter(
        (f) => f.path === "CLAUDE.md",
      );

      expect(findings).toHaveLength(1);
      const finding = findings[0];
      expect(finding?.label).toBe("BAIT");
      expect(finding?.line).toBe(1);
      expect(finding?.evidence[0]?.confidence).toBe("WEAK");
      expect(finding?.evidence[0]?.rule).toBe("word-budget-exceeded");
      expect(finding?.evidence[0]?.rationale).toContain("5");
      expect(finding?.evidence[0]?.rationale).toContain("16");
      expect(finding?.expected).toBe("≤ 5 words");
      expect(finding?.actual).toBe("16 words");
    });

    it("does not flag .cursorrules — exactly at the 5-word budget, not over it", () => {
      const findings = claimFindingsFor(result, "context-bloat").filter(
        (f) => f.path === ".cursorrules",
      );
      expect(findings).toEqual([]);
    });

    it("flags AGENTS.md with two separate findings — WEAK for the budget and STRONG for the duplication", () => {
      const findings = claimFindingsFor(result, "context-bloat").filter(
        (f) => f.path === "AGENTS.md",
      );

      expect(findings).toHaveLength(2);
      const confidences = findings.map((f) => f.evidence[0]?.confidence).sort();
      expect(confidences).toEqual(["STRONG", "WEAK"]);
      // each finding carries a single evidence entry and its own expected/actual
      for (const finding of findings) {
        expect(finding.evidence).toHaveLength(1);
      }
    });

    it("still never flags the ordinary doc, even far over budget and duplicating the README", () => {
      const findings = claimFindingsFor(result, "context-bloat").filter(
        (f) => f.path === "docs/echo-readme.md",
      );
      expect(findings).toEqual([]);
    });
  });

  it("radar.checks.contextBloat: false disables the check entirely", async () => {
    const config = configSchema.parse({
      radar: { bloatWordBudget: 5, checks: { contextBloat: false } },
    });
    const result = await radar(repo, config);
    expect(claimFindingsFor(result, "context-bloat")).toEqual([]);
  });
});
