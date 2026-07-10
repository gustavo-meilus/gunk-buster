import { describe, expect, it } from "vitest";
import { computeVerdict } from "../src/verdict.js";
import type { Evidence } from "../src/schema.js";

function evidence(confidence: Evidence["confidence"]): Evidence {
  return { rule: "test-rule", confidence, rationale: "because reasons" };
}

describe("computeVerdict(evidence, protections) — the pure verdict function (ADR-0002)", () => {
  it("hard protection beats all evidence, even CERTAIN evidence and soft protection", () => {
    const verdict = computeVerdict([evidence("CERTAIN")], { hard: true, soft: true });
    expect(verdict).toBe("EXCLUDED");
  });

  it("hard protection wins even with no evidence at all", () => {
    const verdict = computeVerdict([], { hard: true, soft: false });
    expect(verdict).toBe("EXCLUDED");
  });

  it("no evidence yields KEEP when not hard-protected", () => {
    const verdict = computeVerdict([], { hard: false, soft: false });
    expect(verdict).toBe("KEEP");
  });

  it("no evidence yields KEEP even under soft protection (soft only caps when there is evidence)", () => {
    const verdict = computeVerdict([], { hard: false, soft: true });
    expect(verdict).toBe("KEEP");
  });

  it("soft protection caps CERTAIN evidence at ASK_CHIEF, never SAFE", () => {
    const verdict = computeVerdict([evidence("CERTAIN")], { hard: false, soft: true });
    expect(verdict).toBe("ASK_CHIEF");
  });

  it("soft protection caps STRONG evidence at ASK_CHIEF, never PROPOSE", () => {
    const verdict = computeVerdict([evidence("STRONG")], { hard: false, soft: true });
    expect(verdict).toBe("ASK_CHIEF");
  });

  it("soft protection leaves WEAK evidence at ASK_CHIEF", () => {
    const verdict = computeVerdict([evidence("WEAK")], { hard: false, soft: true });
    expect(verdict).toBe("ASK_CHIEF");
  });

  it("CERTAIN evidence with no protections maps to SAFE", () => {
    const verdict = computeVerdict([evidence("CERTAIN")], { hard: false, soft: false });
    expect(verdict).toBe("SAFE");
  });

  it("STRONG evidence with no protections maps to PROPOSE", () => {
    const verdict = computeVerdict([evidence("STRONG")], { hard: false, soft: false });
    expect(verdict).toBe("PROPOSE");
  });

  it("WEAK evidence with no protections maps to ASK_CHIEF", () => {
    const verdict = computeVerdict([evidence("WEAK")], { hard: false, soft: false });
    expect(verdict).toBe("ASK_CHIEF");
  });

  it("takes the strongest confidence across multiple evidence entries, regardless of order", () => {
    const verdict = computeVerdict(
      [evidence("WEAK"), evidence("CERTAIN"), evidence("STRONG")],
      { hard: false, soft: false },
    );
    expect(verdict).toBe("SAFE");
  });
});
