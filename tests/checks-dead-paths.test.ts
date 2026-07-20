import { describe, expect, it } from "vitest";
import {
  hasGlobChars,
  hasPlaceholderSyntax,
  hasUrlScheme,
} from "../src/checks/dead-paths.js";
import { repositoryInventory, resolveDocumentPath } from "../src/document-path.js";

// Path-shaped candidacy against an empty inventory: only a token's own shape
// (an explicit anchor or a filename-like extension) can make it a claim.
const isPathShaped = (token: string): boolean =>
  resolveDocumentPath("README.md", token, 1, repositoryInventory(new Set())) !== null;

describe("resolveDocumentPath candidacy — the path-shaped candidacy test", () => {
  it("requires more than a slash and accepts a filename-like extension cue", () => {
    expect(isPathShaped("src/index.ts")).toBe(true);
    expect(isPathShaped("docs/")).toBe(false);
  });

  it("rejects a bare filename, even with a well-known extension — not provably a claim about this repo", () => {
    expect(isPathShaped("AGENTS.md")).toBe(true);
    expect(isPathShaped("bundle.js")).toBe(true);
    expect(isPathShaped("yarn.lock")).toBe(true);
  });

  it("rejects a plain word", () => {
    expect(isPathShaped("install")).toBe(false);
    expect(isPathShaped("radar")).toBe(false);
  });

  it("rejects a dotfile", () => {
    expect(isPathShaped(".gitignore")).toBe(false);
  });
});

describe("hasGlobChars(token) — guard 1", () => {
  it("flags *, ?, and [ as glob characters", () => {
    expect(hasGlobChars("src/*.ts")).toBe(true);
    expect(hasGlobChars("file?.md")).toBe(true);
    expect(hasGlobChars("src/[id].ts")).toBe(true);
  });

  it("leaves an ordinary path untouched", () => {
    expect(hasGlobChars("src/index.ts")).toBe(false);
  });
});

describe("hasPlaceholderSyntax(token) — guard 2", () => {
  it("flags angle-bracket placeholders", () => {
    expect(hasPlaceholderSyntax("<repo>/config.json")).toBe(true);
  });

  it("flags brace placeholders", () => {
    expect(hasPlaceholderSyntax("{project}/README.md")).toBe(true);
  });

  it("flags an environment-variable reference", () => {
    expect(hasPlaceholderSyntax("$HOME/notes.md")).toBe(true);
  });

  it("does not flag a bare $ with no identifier after it", () => {
    expect(hasPlaceholderSyntax("$/notes.md")).toBe(false);
  });

  it("leaves an ordinary path untouched", () => {
    expect(hasPlaceholderSyntax("src/index.ts")).toBe(false);
  });
});

describe("hasUrlScheme(token) — guard 3", () => {
  it("flags http(s) and other URI schemes", () => {
    expect(hasUrlScheme("https://example.com/src/old-module.ts")).toBe(true);
    expect(hasUrlScheme("mailto:chief@example.com")).toBe(true);
  });

  it("does not mistake a Windows drive letter for a scheme", () => {
    expect(hasUrlScheme("C:\\Users\\chief\\notes.md")).toBe(false);
  });

  it("leaves an ordinary relative path untouched", () => {
    expect(hasUrlScheme("src/index.ts")).toBe(false);
  });
});
