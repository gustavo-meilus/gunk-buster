import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { compareDocStructures } from "../src/detectors/echo.js";
import type { DocStructure } from "../src/doc-graph.js";
import { scan } from "../src/scan.js";
import type { FileFinding, ScanResult } from "../src/schema.js";
import { createFixtureRepo, removeDir } from "./helpers/fixture.js";
import { NINETY_DAYS_AGO, fileFindings } from "./helpers/findings.js";

function echoFindings(result: ScanResult): FileFinding[] {
  return fileFindings(result.findings).filter((f) => f.label === "ECHO");
}

describe("scan(repoRoot, config) — ECHO duplicate-doc detector (#6)", () => {
  let repo: string;
  let result: ScanResult;

  beforeAll(async () => {
    repo = await createFixtureRepo("duplicate-docs", { commitDate: NINETY_DAYS_AGO });
    result = await scan(repo, defaultConfig());
  });

  afterAll(async () => {
    await removeDir(repo);
  });

  it("flags both docs of an identical-title-and-headings pair, each naming its counterpart in the rationale", () => {
    const findings = echoFindings(result);
    const playbook = findings.find((f) => f.path === "docs/release-playbook.md");
    const oldPlaybook = findings.find((f) => f.path === "docs/release-playbook-old.md");

    expect(playbook).toBeDefined();
    expect(oldPlaybook).toBeDefined();

    // Each finding's evidence rationale names the counterpart document.
    expect(
      playbook?.evidence.some((e) => e.rationale.includes("docs/release-playbook-old.md")),
    ).toBe(true);
    expect(
      oldPlaybook?.evidence.some((e) => e.rationale.includes("docs/release-playbook.md")),
    ).toBe(true);
  });

  it("flags both docs of a same-title pair whose headings substantially overlap without being identical", () => {
    const findings = echoFindings(result);
    const guide = findings.find((f) => f.path === "docs/testing-guide.md");
    const copy = findings.find((f) => f.path === "docs/testing-guide-copy.md");

    expect(guide).toBeDefined();
    expect(copy).toBeDefined();
    expect(
      guide?.evidence.some((e) => e.rationale.includes("docs/testing-guide-copy.md")),
    ).toBe(true);
    expect(
      copy?.evidence.some((e) => e.rationale.includes("docs/testing-guide.md")),
    ).toBe(true);
  });

  it("grades confidence by match strength: identical title + headings is STRONG, title alone is WEAK", () => {
    const findings = echoFindings(result);
    const identical = findings.find((f) => f.path === "docs/release-playbook.md");
    const titleOnly = findings.find((f) => f.path === "docs/release-notes-draft.md");

    // Identical title + headings: the strongest ECHO match -> STRONG -> PROPOSE.
    expect(identical?.evidence[0]?.confidence).toBe("STRONG");
    expect(identical?.verdict).toBe("PROPOSE");

    // Same title but no headings to compare: weaker evidence -> WEAK -> ASK_CHIEF.
    expect(titleOnly).toBeDefined();
    expect(titleOnly?.evidence[0]?.confidence).toBe("WEAK");
    expect(titleOnly?.verdict).toBe("ASK_CHIEF");
    expect(
      titleOnly?.evidence.some((e) => e.rationale.includes("docs/release-notes-draft-copy.md")),
    ).toBe(true);
  });

  it("never flags docs sharing only a generic title (e.g. \"Setup\") whose headings differ", () => {
    const paths = echoFindings(result).map((f) => f.path);

    expect(paths).not.toContain("docs/setup.md");
    expect(paths).not.toContain("docs/frontend-setup.md");
  });

  it("yields exactly the known duplicate pairs and nothing else — distinct docs produce no ECHO findings", () => {
    const paths = echoFindings(result)
      .map((f) => f.path)
      .sort();

    expect(paths).toEqual([
      "docs/release-notes-draft-copy.md",
      "docs/release-notes-draft.md",
      "docs/release-playbook-old.md",
      "docs/release-playbook.md",
      "docs/testing-guide-copy.md",
      "docs/testing-guide.md",
    ]);
  });
});

describe("compareDocStructures(a, b) — title/heading similarity rules", () => {
  const doc = (title: string | null, headings: string[]): DocStructure => ({ title, headings });

  it("returns null when titles differ, regardless of heading overlap", () => {
    expect(
      compareDocStructures(doc("Alpha", ["One", "Two"]), doc("Beta", ["One", "Two"])),
    ).toBeNull();
  });

  it("returns null when either doc has no title — a headings-only doc never echoes", () => {
    expect(compareDocStructures(doc(null, ["One"]), doc(null, ["One"]))).toBeNull();
    expect(compareDocStructures(doc("Alpha", ["One"]), doc(null, ["One"]))).toBeNull();
  });

  it("matches titles case- and whitespace-insensitively", () => {
    expect(
      compareDocStructures(doc("Release  Playbook", ["One"]), doc("release playbook", ["One"]))
        ?.kind,
    ).toBe("identical-headings");
  });

  it("classifies identical heading sets as identical-headings", () => {
    expect(
      compareDocStructures(doc("T", ["One", "Two"]), doc("T", ["Two", "One"]))?.kind,
    ).toBe("identical-headings");
  });

  it("classifies half-shared headings on both sides as overlapping-headings", () => {
    expect(
      compareDocStructures(doc("T", ["One", "Two", "Three"]), doc("T", ["One", "Two", "Four"]))
        ?.kind,
    ).toBe("overlapping-headings");
  });

  it("returns null when both docs have headings but none agree (the generic-title guard)", () => {
    expect(
      compareDocStructures(doc("Setup", ["One", "Two"]), doc("Setup", ["Three", "Four"])),
    ).toBeNull();
  });

  it("requires the overlap on both sides — a small doc does not echo a large doc it barely dents", () => {
    expect(
      compareDocStructures(
        doc("T", ["One"]),
        doc("T", ["One", "Two", "Three", "Four", "Five"]),
      ),
    ).toBeNull();
  });

  it("classifies a same-title pair with no headings to compare as title-only", () => {
    expect(compareDocStructures(doc("T", []), doc("T", []))?.kind).toBe("title-only");
    expect(compareDocStructures(doc("T", ["One"]), doc("T", []))?.kind).toBe("title-only");
  });
});
