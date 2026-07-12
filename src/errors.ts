import type { Voice } from "./config.js";

/**
 * A tool error: the scan itself could not run (not a git repo, unreadable
 * config, …). Findings never raise one — they never fail a run (ADR-0004).
 */
export class GunkError extends Error {}

/**
 * Throw a GunkError voiced per `config.voice` — the one place an engine
 * refusal picks between its Chief and professional copy. Refusals surface on
 * stderr, so this never puts a persona string into `--json` stdout.
 */
export function refuse(voice: Voice, chief: string, professional: string): never {
  throw new GunkError(voice === "professional" ? professional : chief);
}
