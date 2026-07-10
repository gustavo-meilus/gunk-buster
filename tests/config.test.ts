import { writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CONFIG_FILE_NAME, loadConfig } from "../src/config.js";
import { GunkError } from "../src/errors.js";
import { createTempDir, removeDir } from "./helpers/fixture.js";

describe("loadConfig(repoRoot)", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await createTempDir();
  });

  afterEach(async () => {
    await removeDir(dir);
  });

  it("zero-config: returns defaults and never writes a config file", async () => {
    const config = await loadConfig(dir);
    expect(config).toEqual({
      voice: "chief",
      ageThresholdDays: 180,
      recencyWindowDays: 30,
      protectedPaths: [],
    });
    expect(existsSync(path.join(dir, CONFIG_FILE_NAME))).toBe(false);
  });

  it("reads the optional config file and merges partial knobs over defaults", async () => {
    await writeFile(
      path.join(dir, CONFIG_FILE_NAME),
      JSON.stringify({ voice: "professional", recencyWindowDays: 7, protectedPaths: ["docs/keep/"] }),
    );
    const config = await loadConfig(dir);
    expect(config).toEqual({
      voice: "professional",
      ageThresholdDays: 180,
      recencyWindowDays: 7,
      protectedPaths: ["docs/keep/"],
    });
  });

  it("rejects unknown config keys as a tool error (typos never pass silently)", async () => {
    await writeFile(
      path.join(dir, CONFIG_FILE_NAME),
      JSON.stringify({ ageThreshold: 10 }), // typo: should be ageThresholdDays
    );
    await expect(loadConfig(dir)).rejects.toBeInstanceOf(GunkError);
  });

  it("rejects an invalid config file as a tool error", async () => {
    await writeFile(
      path.join(dir, CONFIG_FILE_NAME),
      JSON.stringify({ voice: "sarcastic" }),
    );
    await expect(loadConfig(dir)).rejects.toBeInstanceOf(GunkError);
  });
});
