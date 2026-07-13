import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "tsup";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mcpOptions } from "../tsup.config.js";
import { createTempDir, removeDir } from "./helpers/fixture.js";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const committedMcpPath = path.join(packageRoot, "dist", "mcp.js");

function sha256(contents: Buffer): string {
  return createHash("sha256").update(contents).digest("hex");
}

/**
 * dist/mcp.js is committed (plugin installs never run a build step — #36),
 * so nothing else guards it from drifting out of sync with src/. This
 * rebuilds the mcp entry alone, into a scratch outDir rather than dist/
 * itself, so the comparison is never against the file it just overwrote —
 * and with `config: false` so it doesn't also re-run the cli/index build
 * tests/cli.test.ts and tests/mcp.test.ts are already racing over dist/.
 */
describe("dist/mcp.js — build drift check (#36)", () => {
  let scratchDir: string;

  beforeAll(async () => {
    scratchDir = await createTempDir();
  });

  afterAll(async () => {
    await removeDir(scratchDir);
  });

  it("a fresh build of the mcp entry is byte-identical to the committed dist/mcp.js", async () => {
    await build({ ...mcpOptions, outDir: scratchDir, config: false, silent: true });

    const [committed, fresh] = await Promise.all([
      readFile(committedMcpPath),
      readFile(path.join(scratchDir, "mcp.js")),
    ]);

    expect(sha256(fresh)).toBe(sha256(committed));
  });
});
