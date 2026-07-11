import { describe, expect, it } from "vitest";
import { extractCommandMentions } from "../src/checks/command-mentions.js";

/**
 * extractCommandMentions truth table — the shared extractor both
 * package-manager-drift and dead-command build on (#10). Unit-tested
 * directly (precedent: compareDocStructures in tests/scan-echo.test.ts):
 * the engine seam is too coarse to exercise every guard on its own.
 */
describe("extractCommandMentions(content) — command-mention extraction", () => {
  it("finds a mention inside an inline code span", () => {
    const mentions = extractCommandMentions("Run `npm install` first.");
    expect(mentions).toEqual([
      { manager: "npm", subcommand: "install", arg: undefined, raw: "npm install", line: 1 },
    ]);
  });

  it("finds a mention inside a fenced code block, one line past the opening fence", () => {
    const content = ["# Title", "", "```sh", "pnpm run build", "```"].join("\n");
    const mentions = extractCommandMentions(content);
    expect(mentions).toEqual([
      { manager: "pnpm", subcommand: "run", arg: "build", raw: "pnpm run build", line: 4 },
    ]);
  });

  it("never matches a plain-prose mention outside any code span or block", () => {
    const mentions = extractCommandMentions("Please use npm install to set things up.");
    expect(mentions).toEqual([]);
  });

  it("captures up to two tokens after the manager name, ignoring the rest", () => {
    const mentions = extractCommandMentions("`npm install --save-dev typescript`");
    expect(mentions[0]).toMatchObject({
      manager: "npm",
      subcommand: "install",
      arg: "--save-dev",
      raw: "npm install --save-dev",
    });
  });

  it("does not match a manager name with no following invocation token", () => {
    expect(extractCommandMentions("`just use npm`")).toEqual([]);
  });

  it("does not match a manager name glued to other word characters (npmjs, npm-run-all)", () => {
    expect(extractCommandMentions("`see npmjs.com` and `npm-run-all` for details")).toEqual([]);
  });

  it("finds every manager (npm, pnpm, yarn, bun)", () => {
    const content = "`npm install` `pnpm install` `yarn install` `bun install`";
    const managers = extractCommandMentions(content).map((m) => m.manager);
    expect(managers).toEqual(["npm", "pnpm", "yarn", "bun"]);
  });

  it("locates multiple mentions across multiple lines of one fenced block, each on its own line", () => {
    const content = ["```sh", "npm install", "npm run build", "```"].join("\n");
    const mentions = extractCommandMentions(content);
    expect(mentions.map((m) => ({ raw: m.raw, line: m.line }))).toEqual([
      { raw: "npm install", line: 2 },
      { raw: "npm run build", line: 3 },
    ]);
  });
});
