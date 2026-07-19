import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildFileIndex } from "../src/file-index.js";
import {
  buildDocGraph,
  extractDocStructure,
  inboundImagesOf,
  inboundLinksOf,
  isInNav,
  isReferencedByReadme,
  outboundReferencesOf,
  resolveReference,
  type DocGraph,
} from "../src/doc-graph.js";
import { createFixtureRepo, removeDir } from "./helpers/fixture.js";

describe("resolveReference(fromPath, raw, kind, filePaths) — link resolution edge cases", () => {
  const filePaths = new Set(["README.md", "docs/guide.md", "docs/nested/page.md"]);

  it("resolves a plain relative link against the referencing file's own directory", () => {
    expect(resolveReference("README.md", "docs/guide.md", "link", filePaths).resolved).toBe(
      "docs/guide.md",
    );
  });

  it("resolves ../ links relative to a nested file, not the repo root", () => {
    expect(
      resolveReference("docs/nested/page.md", "../guide.md", "link", filePaths).resolved,
    ).toBe("docs/guide.md");
  });

  it("resolves a leading-slash link as repo-root-relative", () => {
    expect(resolveReference("docs/nested/page.md", "/docs/guide.md", "link", filePaths).resolved).toBe(
      "docs/guide.md",
    );
  });

  it("strips a #anchor before resolving the file target", () => {
    const ref = resolveReference("README.md", "docs/guide.md#section-two", "link", filePaths);
    expect(ref.resolved).toBe("docs/guide.md");
    expect(ref.broken).toBe(false);
  });

  it("treats a same-document anchor (no path) as nothing to resolve, never broken", () => {
    const ref = resolveReference("README.md", "#section-two", "link", filePaths);
    expect(ref.resolved).toBeNull();
    expect(ref.external).toBe(false);
    expect(ref.broken).toBe(false);
  });

  it("normalizes backslash path separators before resolving (cross-platform authored targets)", () => {
    const ref = resolveReference("docs/nested/page.md", "..\\guide.md", "link", filePaths);
    expect(ref.resolved).toBe("docs/guide.md");
    expect(ref.broken).toBe(false);
  });

  it("never mistakes a Windows drive-letter absolute path for a URI scheme", () => {
    const ref = resolveReference("README.md", "C:\\Users\\chief\\notes.md", "link", filePaths);
    expect(ref.external).toBe(false);
  });

  it("never treats http/https/mailto targets as internal — external, unresolved, never checked", () => {
    for (const raw of ["https://example.com/x", "http://example.com", "mailto:chief@example.com"]) {
      const ref = resolveReference("README.md", raw, "link", filePaths);
      expect(ref.external).toBe(true);
      expect(ref.resolved).toBeNull();
    }
  });

  it("resolves an indexed directory implied by an indexed descendant", () => {
    const ref = resolveReference("README.md", "docs/", "link", filePaths);
    expect(ref.resolved).toBe("docs");
    expect(ref.broken).toBe(false);
  });

  it("treats a target that escapes the repo root (../..) as unresolved, not broken", () => {
    const ref = resolveReference("README.md", "../../outside.md", "link", filePaths);
    expect(ref.resolved).toBeNull();
    expect(ref.broken).toBe(false);
  });

  it("marks an internal target missing from the file index as broken", () => {
    const ref = resolveReference("README.md", "docs/missing.md", "link", filePaths);
    expect(ref.resolved).toBe("docs/missing.md");
    expect(ref.broken).toBe(true);
  });
});

describe("buildDocGraph(repoRoot, fileIndex) — queryable doc graph", () => {
  let repo: string;
  let graph: DocGraph;

  beforeAll(async () => {
    repo = await createFixtureRepo("broken-links");
    const fileIndex = await buildFileIndex(repo);
    graph = await buildDocGraph(repo, fileIndex);
  });

  afterAll(async () => {
    await removeDir(repo);
  });

  it("records inbound links: docs/guide.md is linked from README.md, CLAUDE.md, the nav sidebar, and nested/page.md", () => {
    const inbound = [...inboundLinksOf(graph, "docs/guide.md")].sort();
    expect(inbound).toEqual([
      "CLAUDE.md",
      "README.md",
      "docs/_sidebar.md",
      "docs/nested/page.md",
    ]);
  });

  it("records outbound references for a doc, including both links and images", () => {
    const outbound = outboundReferencesOf(graph, "README.md");
    const kinds = outbound.map((ref) => ref.kind);
    expect(kinds).toContain("link");
    expect(kinds).toContain("image");
  });

  it("records valid image references separately from links (inbound images)", () => {
    expect(inboundImagesOf(graph, "assets/logo.svg")).toEqual(["README.md"]);
    expect(inboundLinksOf(graph, "assets/logo.svg")).toEqual([]);
  });

  it("tracks README references: docs/guide.md is referenced by the root README", () => {
    expect(isReferencedByReadme(graph, "docs/guide.md")).toBe(true);
    expect(isReferencedByReadme(graph, "docs/nested/page.md")).toBe(false);
  });

  it("tracks docs nav/sidebar membership from a recognized nav file (_sidebar.md)", () => {
    expect(isInNav(graph, "docs/guide.md")).toBe(true);
    expect(isInNav(graph, "docs/nested/page.md")).toBe(true);
    expect(isInNav(graph, "README.md")).toBe(false);
  });

  it("resolves reference-style links ([text][id] + [id]: target) the same as inline links", () => {
    expect(inboundLinksOf(graph, "docs/guide.md")).toContain("docs/nested/page.md");
  });
});

describe("extractDocStructure(content) — title/heading skeleton extraction", () => {
  it("takes the first depth-1 heading as the title and lists the remaining headings in order", () => {
    const structure = extractDocStructure(
      "# Release Playbook\n\nIntro.\n\n## Prerequisites\n\n## Build\n\n### Bundler\n",
    );
    expect(structure.title).toBe("Release Playbook");
    expect(structure.headings).toEqual(["Prerequisites", "Build", "Bundler"]);
  });

  it("recognizes a setext (underlined) title as a depth-1 heading", () => {
    const structure = extractDocStructure("Release Playbook\n================\n\n## Steps\n");
    expect(structure.title).toBe("Release Playbook");
    expect(structure.headings).toEqual(["Steps"]);
  });

  it("includes inline code in heading text", () => {
    const structure = extractDocStructure("# Using `gunk scan`\n");
    expect(structure.title).toBe("Using gunk scan");
  });

  it("returns a null title for a doc with no depth-1 heading, keeping its other headings", () => {
    const structure = extractDocStructure("## Only a Section\n\ntext\n");
    expect(structure.title).toBeNull();
    expect(structure.headings).toEqual(["Only a Section"]);
  });

  it("treats a second depth-1 heading as an ordinary heading, not a competing title", () => {
    const structure = extractDocStructure("# First\n\n# Second\n\n## Third\n");
    expect(structure.title).toBe("First");
    expect(structure.headings).toEqual(["Second", "Third"]);
  });
});
