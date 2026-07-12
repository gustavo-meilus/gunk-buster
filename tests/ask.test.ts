import { describe, expect, it } from "vitest";
import { findAskItems } from "../src/ask.js";
import { scanResultSchema } from "../src/schema.js";

const evidence = [{ rule: "unreferenced", confidence: "STRONG" as const, rationale: "no inbound links" }];
const hash = `sha256:${"a".repeat(64)}`;

function fileFinding(path: string, verdict: "SAFE" | "PROPOSE" | "ASK_CHIEF" | "KEEP") {
  return {
    type: "file" as const,
    path,
    kind: "doc" as const,
    label: "GHOST" as const,
    verdict,
    evidence,
    protections: [],
    contentHash: hash,
  };
}

describe("findAskItems(scanResult)", () => {
  it("walks PROPOSE findings first, then ASK_CHIEF, dropping SAFE and KEEP", () => {
    const scanResult = scanResultSchema.parse({
      schemaVersion: 2,
      scannedAt: "2026-07-11T14:22:05.123Z",
      repoRoot: "/repo",
      counts: { byVerdict: {}, byLabel: {} },
      findings: [
        fileFinding("docs/safe.md", "SAFE"),
        fileFinding("docs/ask-chief-1.md", "ASK_CHIEF"),
        fileFinding("docs/propose-1.md", "PROPOSE"),
        fileFinding("docs/kept.md", "KEEP"),
        fileFinding("docs/ask-chief-2.md", "ASK_CHIEF"),
        fileFinding("docs/propose-2.md", "PROPOSE"),
        { type: "link" as const, path: "docs/index.md", target: "docs/missing.md", evidence },
      ],
    });

    const items = findAskItems(scanResult);
    expect(items.map((f) => f.path)).toEqual([
      "docs/propose-1.md",
      "docs/propose-2.md",
      "docs/ask-chief-1.md",
      "docs/ask-chief-2.md",
    ]);
  });

  it("returns an empty list when nothing is PROPOSE or ASK_CHIEF", () => {
    const scanResult = scanResultSchema.parse({
      schemaVersion: 2,
      scannedAt: "2026-07-11T14:22:05.123Z",
      repoRoot: "/repo",
      counts: { byVerdict: {}, byLabel: {} },
      findings: [fileFinding("docs/safe.md", "SAFE"), fileFinding("docs/kept.md", "KEEP")],
    });

    expect(findAskItems(scanResult)).toEqual([]);
  });
});
