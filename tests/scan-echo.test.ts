import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scan } from "../src/scan.js";
import { commitAll, createEmptyGitRepo, removeDir } from "./helpers/fixture.js";

describe("scan(repoRoot) — substantive ECHO detector (#55)", () => {
  const repos: string[] = [];

  afterEach(async () => Promise.all(repos.splice(0).map(removeDir)));

  async function repo(files: Record<string, string>): Promise<string> {
    const root = await createEmptyGitRepo();
    repos.push(root);
    for (const [name, content] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(root, name)), { recursive: true });
      await writeFile(path.join(root, name), content);
    }
    commitAll(root, "fixture", "2025-01-01T00:00:00Z");
    return root;
  }

  const block = (id: string) => `This is substantive guidance block ${id} with enough normalized text to qualify.`;

  it("requires three matching substantive blocks and 80 percent containment, not matching titles or headings", async () => {
    const root = await repo({
      "README.md": "# root\n",
      "docs/title-only.md": "# Shared title\n## Same heading\n" + [block("title-one"), block("title-two")].join("\n\n"),
      "docs/title-only-copy.md": "# Shared title\n## Same heading\n" + [block("title-one"), block("title-two"), block("title-different")].join("\n\n"),
      "docs/below-containment.md": "# Different title\n" + [block("below-one"), block("below-two"), block("below-three"), block("below-four"), block("below-five")].join("\n\n"),
      "docs/below-containment-copy.md": "# Another title\n" + [block("below-one"), block("below-two"), block("below-three"), block("below-different"), block("below-other")].join("\n\n"),
      "docs/at-threshold.md": "# Threshold\n## Shared\n" + [block("threshold-one"), block("threshold-two"), block("threshold-three"), block("threshold-four"), block("threshold-five")].join("\n\n"),
      "docs/at-threshold-copy.md": "# Threshold\n## Shared\n" + [block("threshold-one"), block("threshold-two"), block("threshold-three"), block("threshold-four"), block("threshold-extra")].join("\n\n"),
      "docs/two-blocks.md": "# Two blocks\n" + [block("two-one"), block("two-two")].join("\n\n"),
      "docs/two-blocks-copy.md": "# Two blocks copy\n" + [block("two-one"), block("two-two")].join("\n\n"),
      "docs/three-blocks.md": "# Three blocks\n## Shared\n" + [block("three-one"), block("three-two"), block("three-three")].join("\n\n"),
      "docs/three-blocks-copy.md": "# Three blocks\n## Shared\n" + [block("three-one"), block("three-two"), block("three-three")].join("\n\n"),
    });

    const echoPaths = (await scan(root)).findings
      .filter((finding) => finding.type === "file" && finding.label === "ECHO")
      .map((finding) => finding.path);

    expect(echoPaths).not.toEqual(expect.arrayContaining(["docs/title-only.md", "docs/title-only-copy.md"]));
    expect(echoPaths).not.toEqual(expect.arrayContaining(["docs/below-containment.md", "docs/below-containment-copy.md"]));
    expect(echoPaths).not.toEqual(expect.arrayContaining(["docs/two-blocks.md", "docs/two-blocks-copy.md"]));
    expect(echoPaths).toEqual(expect.arrayContaining(["docs/at-threshold.md", "docs/at-threshold-copy.md"]));
    expect(echoPaths).toEqual(expect.arrayContaining(["docs/three-blocks.md", "docs/three-blocks-copy.md"]));
  });

  it("uses heading similarity only to nominate substantive comparisons", async () => {
    const shared = [block("one"), block("two"), block("three")].join("\n\n");
    const root = await repo({
      "README.md": "# root\n",
      "docs/first.md": `# First\n\n${shared}`,
      "docs/second.md": `# Second\n\n${shared}`,
    });

    const echoPaths = (await scan(root)).findings
      .filter((finding) => finding.type === "file" && finding.label === "ECHO")
      .map((finding) => finding.path);
    expect(echoPaths).not.toEqual(expect.arrayContaining(["docs/first.md", "docs/second.md"]));
  });

  it("does not compare otherwise matching blocks without a heading nomination", async () => {
    const prose = "This **important** guidance has MIXED case and more than forty meaningful characters.";
    const root = await repo({
      "README.md": "# root\n",
      "docs/original.md": `# Original\n\n${prose}\n\n- This list item is a substantive block with more than forty characters.\n\n| Name | Value |\n| --- | --- |\n| This row | has more than forty substantive characters |\n\n\`\`\`ts\nconst exact = \"code content remains case sensitive\";\n\`\`\`\n`,
      "docs/copy.md": "# Copy\n\nthis important guidance has mixed case and more than forty meaningful characters.\n\n- This list item is a substantive block with more than forty characters.\n\n| Name | Value |\n| --- | --- |\n| This row | has more than forty substantive characters |\n\n```ts\nconst exact = \"code content remains case sensitive\";\n```\n",
      "docs/code-case-change.md": "# Code case changed\n\nthis important guidance has mixed case and more than forty meaningful characters.\n\n- This list item is a substantive block with more than forty characters.\n\n| Name | Value |\n| This row | has more than forty substantive characters |\n\n```ts\nconst exact = \"CODE CONTENT REMAINS CASE SENSITIVE\";\n```\n",
    });

    const echoPaths = (await scan(root)).findings
      .filter((finding) => finding.type === "file" && finding.label === "ECHO")
      .map((finding) => finding.path);
    expect(echoPaths).not.toEqual(expect.arrayContaining(["docs/original.md", "docs/copy.md"]));
    expect(echoPaths).not.toContain("docs/code-case-change.md");
  });

  it("does not aggregate short nested list items into substantive blocks", async () => {
    const nestedLists = ["one", "two", "three"]
      .map((group) => `- ${group}\n  - short item a\n  - short item b\n  - short item c`)
      .join("\n");
    const wrappedNestedLists = ["one", "two", "three"]
      .map((group) => `- ${group}\n  > - short item a\n  > - short item b\n  > - short item c`)
      .join("\n");
    const root = await repo({
      "README.md": "# root\n",
      "docs/first.md": `# Shared\n\n${nestedLists}\n`,
      "docs/second.md": `# Shared\n\n${nestedLists}\n`,
      "docs/wrapped-first.md": `# Shared\n\n${wrappedNestedLists}\n`,
      "docs/wrapped-second.md": `# Shared\n\n${wrappedNestedLists}\n`,
    });

    const echoPaths = (await scan(root)).findings
      .filter((finding) => finding.type === "file" && finding.label === "ECHO")
      .map((finding) => finding.path);

    expect(echoPaths).not.toContain("docs/first.md");
    expect(echoPaths).not.toContain("docs/second.md");
    expect(echoPaths).not.toContain("docs/wrapped-first.md");
    expect(echoPaths).not.toContain("docs/wrapped-second.md");
  });

  it("makes only a valid declared derivative live and suppresses ECHO only for that pair", async () => {
    const shared = [block("one"), block("two"), block("three")].join("\n\n");
    const root = await repo({
      "README.md": "# root\n",
      "docs/canonical.md": `# Shared guide\n\n${shared}`,
      "docs/derivative.md": `# Shared guide\n\n${shared}`,
      "docs/unrelated-copy.md": `# Shared guide\n\n${shared}`,
      "gunk.config.json": JSON.stringify({ references: { copies: [{ canonical: "docs/canonical.md", derivative: "docs/derivative.md", reason: "release snapshot" }] } }),
    });

    const result = await scan(root);
    const echoPaths = result.findings.filter((finding) => finding.type === "file" && finding.label === "ECHO").map((finding) => finding.path);
    expect(result.findings.some((finding) => finding.type === "file" && finding.path === "docs/derivative.md" && finding.label === "GHOST")).toBe(false);
    expect(echoPaths).toEqual(expect.arrayContaining(["docs/canonical.md", "docs/derivative.md", "docs/unrelated-copy.md"]));
    const derivative = result.findings.find((finding) => finding.type === "file" && finding.path === "docs/derivative.md" && finding.label === "ECHO");
    expect(derivative?.evidence.some((evidence) => evidence.rationale.includes("docs/canonical.md"))).toBe(false);
    expect(derivative?.evidence.some((evidence) => evidence.rationale.includes("docs/unrelated-copy.md"))).toBe(true);
  });

  it("reports stale copy relationships without granting liveness or ECHO suppression", async () => {
    const shared = [block("one"), block("two"), block("three")].join("\n\n");
    const root = await repo({
      "README.md": "# root\n",
      "docs/derivative.md": `# Shared guide\n\n${shared}`,
      "docs/unrelated-copy.md": `# Shared guide\n\n${shared}`,
      "gunk.config.json": JSON.stringify({ references: { copies: [{ canonical: "docs/missing.md", derivative: "docs/derivative.md", reason: "release snapshot" }] } }),
    });

    const result = await scan(root);
    expect(result.findings).toContainEqual(expect.objectContaining({ type: "reference", path: "gunk.config.json", target: "docs/missing.md", source: "copy-relationship" }));
    expect(result.findings).toContainEqual(expect.objectContaining({ type: "file", path: "docs/derivative.md", label: "GHOST" }));
    expect(result.findings).toContainEqual(expect.objectContaining({ type: "file", path: "docs/derivative.md", label: "ECHO" }));
  });

  it("rejects copy relationships whose endpoints are not documents", async () => {
    const root = await repo({
      "README.md": "# root\n",
      "docs/canonical.md": `# Canonical\n\n${[block("one"), block("two"), block("three")].join("\n\n")}`,
      "assets/derivative.txt": "intentional copy but not a document",
      "gunk.config.json": JSON.stringify({ references: { copies: [{ canonical: "docs/canonical.md", derivative: "assets/derivative.txt", reason: "incorrect endpoint" }] } }),
    });

    const result = await scan(root);
    expect(result.findings).toContainEqual(expect.objectContaining({ type: "reference", target: "assets/derivative.txt", source: "copy-relationship" }));
  });
});
