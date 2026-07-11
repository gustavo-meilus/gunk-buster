import type { ClaimFinding, FileFinding, RadarResult, ScanResult } from "../../src/schema.js";

/**
 * A commit date well outside the default 30-day recency window, so fixture
 * files are never capped at ASK_CHIEF by the recently-modified protection.
 */
export const NINETY_DAYS_AGO = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

/** The file findings of a scan result (drops link findings). */
export function fileFindings(result: ScanResult): FileFinding[] {
  return result.findings.filter((f): f is FileFinding => f.type === "file");
}

/** Sorted paths of a scan result's findings under one label. */
export function pathsWithLabel(result: ScanResult, label: FileFinding["label"]): string[] {
  return fileFindings(result)
    .filter((f) => f.label === label)
    .map((f) => f.path)
    .sort();
}

/** A radar result's claim findings produced by one check. */
export function claimFindingsFor(result: RadarResult, check: string): ClaimFinding[] {
  return result.findings.filter((f) => f.check === check);
}
