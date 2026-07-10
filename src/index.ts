/** Public API: the engine seam and the contracts it speaks. */
export { scan, persistScanResult } from "./scan.js";
export { loadConfig, defaultConfig, configSchema, CONFIG_FILE_NAME } from "./config.js";
export type { GunkConfig } from "./config.js";
export { buildFileIndex } from "./file-index.js";
export type { FileEntry, IndexedKind } from "./file-index.js";
export { buildGitIndex } from "./git-index.js";
export type { GitIndex } from "./git-index.js";
export {
  buildDocGraph,
  findBrokenLinks,
  inboundImagesOf,
  inboundLinksOf,
  isInNav,
  isReferencedByReadme,
  outboundReferencesOf,
} from "./doc-graph.js";
export type { DocGraph, DocRefKind, DocReference } from "./doc-graph.js";
export { GunkError } from "./errors.js";
export * from "./schema.js";
