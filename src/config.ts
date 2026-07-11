import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { GunkError } from "./errors.js";

/**
 * The optional config file — the second stability-promised schema. Read if
 * present, never written; zero-config must always work (there is no
 * `gunk init` in MVP 1).
 */

export const CONFIG_FILE_NAME = "gunk.config.json";

/**
 * Kill switches for the four radar checks (docs/specs/mvp-2-radar.md) — all
 * on by default, the escape hatch for repos with a deliberately unusual
 * setup (e.g. multiple lockfiles on purpose).
 */
export const radarChecksSchema = z.strictObject({
  packageManagerDrift: z.boolean().default(true),
  deadCommands: z.boolean().default(true),
  deadPaths: z.boolean().default(true),
  contextBloat: z.boolean().default(true),
});

/** The `radar` config block: check kill switches plus the context-bloat word budget. */
export const radarConfigSchema = z.strictObject({
  checks: radarChecksSchema.default(() => radarChecksSchema.parse({})),
  /** Word-count threshold for the context-bloat check's WEAK rule. */
  bloatWordBudget: z.int().positive().default(2500),
});

// strictObject: an unknown knob (e.g. a typo) is a tool error, never
// silently dropped — same strictness as an invalid value.
export const configSchema = z.strictObject({
  /** Human-output voice; JSON output never carries persona strings. */
  voice: z.enum(["chief", "professional"]).default("chief"),
  /** Age signal: days since last touch before a file counts as old. */
  ageThresholdDays: z.int().positive().default(180),
  /** Soft protection: files touched within this window cap at ASK_CHIEF. */
  recencyWindowDays: z.int().positive().default(30),
  /** Extra Chief-protected paths, on top of the built-in hard protections. */
  protectedPaths: z.array(z.string()).default([]),
  /** Radar (MVP 2) check configuration. */
  radar: radarConfigSchema.default(() => radarConfigSchema.parse({})),
});

export type GunkConfig = z.infer<typeof configSchema>;

/** The human-output persona knob: default "chief", or "professional" to drop it entirely. */
export type Voice = GunkConfig["voice"];

/** The zero-config defaults. */
export function defaultConfig(): GunkConfig {
  return configSchema.parse({});
}

/**
 * Load config from `<repoRoot>/gunk.config.json` if it exists, else return
 * defaults. An unreadable or invalid config file is a tool error (GunkError)
 * — never silently ignored, never rewritten.
 */
export async function loadConfig(repoRoot: string): Promise<GunkConfig> {
  const file = path.join(repoRoot, CONFIG_FILE_NAME);

  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return defaultConfig();
    }
    throw new GunkError(`cannot read ${CONFIG_FILE_NAME}: ${String(error)}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new GunkError(`invalid JSON in ${CONFIG_FILE_NAME}: ${String(error)}`);
  }

  const result = configSchema.safeParse(parsed);
  if (!result.success) {
    throw new GunkError(
      `invalid ${CONFIG_FILE_NAME}: ${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}
