import type { FileFinding, ScanResult } from "./schema.js";

/**
 * The findings `gunk ask` walks, in order: every PROPOSE-verdict file
 * finding first, then every ASK_CHIEF-verdict one (docs/specs/mvp-3-trap.md
 * "Ask": "the tool proposes, the Chief disposes; easy calls front-loaded").
 * SAFE lives in `bust`'s domain; KEEP is already decided — neither walks.
 * The interactive prompting itself has no fixture-testable seam (it needs a
 * TTY), so this ordering/filtering is the one piece of `ask` pulled out for
 * direct testing; the rest is a thin CLI loop over `trap`/`keeps`.
 */
export function findAskItems(scanResult: ScanResult): FileFinding[] {
  const propose: FileFinding[] = [];
  const askChief: FileFinding[] = [];
  for (const finding of scanResult.findings) {
    if (finding.type !== "file") continue;
    if (finding.verdict === "PROPOSE") propose.push(finding);
    else if (finding.verdict === "ASK_CHIEF") askChief.push(finding);
  }
  return [...propose, ...askChief];
}
