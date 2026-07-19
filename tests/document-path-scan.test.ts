import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { scan } from "../src/scan.js";
import { createFixtureRepo, removeDir } from "./helpers/fixture.js";

describe("scan(repoRoot, config) - document directory references (#52)", () => {
  it("accepts an indexed directory and reports an explicit missing directory", async () => {
    const repo = await createFixtureRepo("dead-paths");
    try {
      const result = await scan(repo, defaultConfig());
      const links = result.findings.filter((finding) => finding.type === "link");
      expect(links).not.toContainEqual(expect.objectContaining({ target: "src" }));
      expect(links).toContainEqual(expect.objectContaining({
        path: "docs/guide.md",
        target: "docs/missing",
      }));
    } finally {
      await removeDir(repo);
    }
  });
});
