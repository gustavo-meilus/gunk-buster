import type { FileFinding, ScanResult } from "../../src/schema.js";

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
