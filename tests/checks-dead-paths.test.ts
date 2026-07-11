import { describe, expect, it } from "vitest";
import {
  deriveTrackedDirs,
  hasGlobChars,
  hasPlaceholderSyntax,
  hasUrlScheme,
  isPathShaped,
} from "../src/checks/dead-paths.js";

describe("isPathShaped(token) — the path-shaped candidacy test", () => {
  it("qualifies a token containing a slash", () => {
    expect(isPathShaped("src/index.ts")).toBe(true);
    expect(isPathShaped("docs/")).toBe(true);
  });

  it("rejects a bare filename, even with a well-known extension — not provably a claim about this repo", () => {
    expect(isPathShaped("AGENTS.md")).toBe(false);
    expect(isPathShaped("bundle.js")).toBe(false);
    expect(isPathShaped("yarn.lock")).toBe(false);
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

describe("deriveTrackedDirs(trackedFiles) — tracked-directory derivation", () => {
  it("derives every ancestor directory of every tracked file", () => {
    const dirs = deriveTrackedDirs(new Set(["src/components/Button.tsx", "docs/guide.md"]));
    expect([...dirs].sort()).toEqual(["docs", "src", "src/components"]);
  });

  it("derives no directories for a root-level tracked file", () => {
    expect(deriveTrackedDirs(new Set(["README.md"]))).toEqual(new Set());
  });
});
