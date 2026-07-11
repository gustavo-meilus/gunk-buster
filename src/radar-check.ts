import type { GunkConfig } from "./config.js";
import type { DocGraph } from "./doc-graph.js";
import type { FileEntry } from "./file-index.js";
import type { GitIndex } from "./git-index.js";
import type { PackageGraph } from "./package-graph.js";
import type { ClaimFinding, ClaimLabel } from "./schema.js";

/**
 * The radar check interface (mirrors detector.ts for scan): its own module
 * so check modules (src/checks/*.ts) never import radar.ts directly and
 * radar.ts can import the checks without a circular dependency, exactly the
 * way scan.ts/detector.ts/detectors/*.ts are split.
 */

/**
 * One audit-surface file: a file-index entry restricted to the doc/
 * agent-context universe, with its content pre-read once. This is the whole
 * candidate universe for radar checks (docs/specs/mvp-2-radar.md "Audit
 * surface") — the label a check's finding gets falls out of `entry.kind`
 * (agent-context -> BAIT, doc -> MOLD), so checks never decide the label
 * themselves.
 */
export interface AuditFile {
  entry: FileEntry;
  content: string;
}

/**
 * Everything a radar check may consult — the audit surface plus the same
 * repo graphs the scan builds, read-only, plus the package-manifest graph
 * command-claim checks need (#10). A check never decides labels or
 * protections: labels fall out of the audit surface's file kind, and claim
 * findings bypass protections entirely (spec).
 */
export interface RadarContext {
  surface: readonly AuditFile[];
  fileIndex: readonly FileEntry[];
  gitIndex: GitIndex;
  docGraph: DocGraph;
  /** Every package.json in the file index, its scripts, and lockfile/packageManager signals (#10). */
  packages: PackageGraph;
  config: GunkConfig;
}

/**
 * A radar check examines the whole audit surface and emits zero or more
 * claim findings. This is the entire extension point (mirrors Detector for
 * scan): checks #10-#12 drop in as registry entries, nothing else changes.
 */
export interface RadarCheck {
  /** The check name every finding it emits carries in `check`. */
  readonly name: string;
  examine(ctx: RadarContext): ClaimFinding[];
}

/**
 * The label a finding in this audit-surface file gets: agent-context ->
 * BAIT, doc -> MOLD (spec). Exported so every check derives a finding's
 * label from this one function instead of re-deciding it.
 */
export function labelFor(kind: AuditFile["entry"]["kind"]): ClaimLabel {
  return kind === "agent-context" ? "BAIT" : "MOLD";
}
