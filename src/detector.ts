import type { GunkConfig } from "./config.js";
import type { DocGraph } from "./doc-graph.js";
import type { FileEntry } from "./file-index.js";
import type { GitIndex } from "./git-index.js";
import type { Evidence, Label } from "./schema.js";

/**
 * Everything a detector may consult — the scan graphs, read-only. A
 * detector never sees protections and never computes a verdict; both stay
 * uniform across every detector, decided once by the pipeline (ADR-0002).
 */
export interface DetectorContext {
  fileIndex: readonly FileEntry[];
  gitIndex: GitIndex;
  docGraph: DocGraph;
  config: GunkConfig;
}

/**
 * A detector examines one candidate file against the scan graphs and emits
 * zero or more Evidence. This is the entire extension point: adding a
 * detector means implementing this interface and registering it — nothing
 * in the verdict function or schema changes (ADR-0002).
 */
export interface Detector {
  /** The label this detector's evidence produces findings under. */
  readonly label: Label;
  /** Examine one file-index candidate; return evidence, if any. */
  examine(entry: FileEntry, ctx: DetectorContext): Evidence[];
}
