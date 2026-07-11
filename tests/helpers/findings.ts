import type { FileFinding } from "../../src/schema.js";

/**
 * A commit date well outside the default 30-day recency window, so fixture
 * files are never capped at ASK_CHIEF by the recently-modified protection.
 */
export const NINETY_DAYS_AGO = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

/** Just the file findings (label + verdict) out of a mixed findings list. */
export function fileFindings(findings: readonly { type: string }[]): FileFinding[] {
  return findings.filter((f): f is FileFinding => f.type === "file");
}
