import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { GunkError } from "./errors.js";
import { GUNK_BUSTER_GITIGNORE } from "./gunk-buster-dir.js";
import { keepEntrySchema, type KeepEntry } from "./schema.js";

/**
 * The keep ledger (docs/specs/mvp-3-trap.md "Keep decisions"):
 * `.gunk-buster/keeps.json`, git-tracked, tool-owned — the config stays
 * read-only (MVP 1 law), this file is Gunk Buster's own durable record of
 * Chief rulings. A plain JSON array of `{ path, contentHash, decidedAt }`;
 * `scan()` consults it after the verdict function to override a finding's
 * verdict to `KEEP` (schema.ts, scan.ts).
 */

const keepsFileSchema = z.array(keepEntrySchema);
const KEEPS_RELATIVE_PATH = path.join(".gunk-buster", "keeps.json");

/** The persisted keep ledger, or an empty list when `gunk ask` has never kept anything here. */
export async function loadKeeps(repoRoot: string): Promise<KeepEntry[]> {
  const keepsPath = path.join(repoRoot, KEEPS_RELATIVE_PATH);

  let raw: string;
  try {
    raw = await readFile(keepsPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw new GunkError(`cannot read keep ledger: ${String(error)}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new GunkError(`invalid keep ledger at ${keepsPath}: ${String(error)}`);
  }

  const result = keepsFileSchema.safeParse(parsed);
  if (!result.success) {
    throw new GunkError(`invalid keep ledger at ${keepsPath}: ${z.prettifyError(result.error)}`);
  }
  return result.data;
}

/**
 * Record a Chief keep decision, pinned to the file's current content hash
 * (spec: "pinned to content: when the file changes, the decision expires").
 * Replaces any existing entry for the same path — a fresh keep on changed
 * content is a fresh decision, not an accumulation.
 */
export async function writeKeep(repoRoot: string, entry: KeepEntry): Promise<void> {
  const existing = await loadKeeps(repoRoot);
  const next = [...existing.filter((keep) => keep.path !== entry.path), entry];

  const gunkBusterDir = path.join(repoRoot, ".gunk-buster");
  await mkdir(gunkBusterDir, { recursive: true });
  // Same constant scan/trap persist — it never ignores keeps.json, so
  // writing it here (idempotently) keeps the ledger git-tracked no matter
  // which command runs first.
  await writeFile(path.join(gunkBusterDir, ".gitignore"), GUNK_BUSTER_GITIGNORE);
  await writeFile(path.join(gunkBusterDir, "keeps.json"), `${JSON.stringify(next, null, 2)}\n`);
}
