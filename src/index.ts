/** Public API: the engine seam and the contracts it speaks. */
export { scan, persistScanResult, loadScanResult } from "./scan.js";
export { loadConfig, defaultConfig, configSchema, CONFIG_FILE_NAME } from "./config.js";
export type { GunkConfig, Voice } from "./config.js";
export { buildFileIndex, hashIndexedFile } from "./file-index.js";
export type { FileEntry, IndexedKind } from "./file-index.js";
export { buildGitIndex } from "./git-index.js";
export type { GitIndex } from "./git-index.js";
export {
  allDocStructures,
  buildDocGraph,
  docStructureOf,
  findBrokenLinks,
  inboundImagesOf,
  inboundLinksOf,
  isInNav,
  isNavFile,
  isReadmeFile,
  isReferencedByReadme,
  outboundReferencesOf,
} from "./doc-graph.js";
export type { DocGraph, DocRefKind, DocReference, DocStructure } from "./doc-graph.js";
export { buildReferenceGraphs, mentionsPath } from "./reference-graphs.js";
export type { ReferenceGraphs } from "./reference-graphs.js";
export { GunkError } from "./errors.js";
export {
  buildPileResult,
  groupFindings,
  pileResultSchema,
  pileGroupSchema,
  GROUP_LABELS,
  LINK_GROUP_LABEL,
} from "./pile.js";
export type { GroupLabel, PileGroup, PileResult } from "./pile.js";
export { writeReport, renderReportMarkdown, reportResultSchema } from "./report.js";
export type { ReportResult } from "./report.js";
export { radar, persistRadarResult, loadRadarResult, labelFor, summarizeRadarCounts } from "./radar.js";
export type { AuditFile, RadarCheck, RadarContext } from "./radar.js";
export { trap, findTrappableFinding, protectionSummary, resolveVaultRoot, buildTrapId } from "./trap.js";
export type { TrapOptions } from "./trap.js";
export { restore, loadReceipts } from "./restore.js";
export { verify } from "./verify.js";
export type { VerifyContext } from "./verify.js";
export type { RestoreOptions, RestoreRef, RestoreResult, RestoreSkip } from "./restore.js";
export * from "./schema.js";
