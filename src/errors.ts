/**
 * A tool error: the scan itself could not run (not a git repo, unreadable
 * config, …). Findings never raise one — they never fail a run (ADR-0004).
 */
export class GunkError extends Error {}
