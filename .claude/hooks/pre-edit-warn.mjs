#!/usr/bin/env node

/**
 * PreToolUse advisory hook for Edit/Write (MVP4-T4, docs/adr/0007-mcp-fresh-hooks-cached.md):
 * warns when the file about to be edited was labeled stale as of the last
 * persisted `gunk scan`. Reads only the cached .gunk-buster/scan.json —
 * never triggers a rescan — and always exits 0, since an advisory must never
 * block the edit it's warning about. radar.json is not read: its claim
 * findings carry the BAIT/MOLD label set (src/schema.ts CLAIM_LABELS), which
 * is disjoint from the GHOST/RELIC/DUMP file-finding labels this hook warns
 * on, so it has nothing this hook's one warn condition could use.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

const STALE_LABELS = new Set(["GHOST", "RELIC", "DUMP"]);

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function toRepoRelativePath(repoRoot, filePath) {
  const absolute = path.isAbsolute(filePath) ? filePath : path.resolve(repoRoot, filePath);
  return path.relative(repoRoot, absolute).split(path.sep).join("/");
}

async function main() {
  let input;
  try {
    input = JSON.parse(await readStdin());
  } catch {
    return;
  }

  if (input.tool_name !== "Edit" && input.tool_name !== "Write") return;
  const filePath = input.tool_input?.file_path;
  if (typeof filePath !== "string" || filePath.length === 0) return;

  const repoRoot = typeof input.cwd === "string" && input.cwd.length > 0 ? input.cwd : process.cwd();
  const scanPath = path.join(repoRoot, ".gunk-buster", "scan.json");

  let scan;
  try {
    scan = JSON.parse(await readFile(scanPath, "utf8"));
  } catch {
    return;
  }
  if (!Array.isArray(scan?.findings)) return;

  const targetPath = toRepoRelativePath(repoRoot, filePath);
  const finding = scan.findings.find(
    (f) => f?.type === "file" && f?.path === targetPath && STALE_LABELS.has(f?.label),
  );
  if (!finding) return;

  console.log(
    `heads up: gunk-buster flagged this file as stale (${finding.label}) as of the last scan — verify before relying on it`,
  );
}

main().catch(() => {});
