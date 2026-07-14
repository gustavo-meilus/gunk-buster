#!/usr/bin/env node

/**
 * Shared PreToolUse advisory for Claude Edit/Write and Codex apply_patch.
 * Reads only the persisted scan — never scans — and always exits successfully.
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
  const portableFilePath = filePath.replaceAll("\\", "/");
  const portableRepoRoot = repoRoot.replaceAll("\\", "/").replace(/\/$/, "");
  const compareFilePath = portableFilePath.toLowerCase();
  const compareRepoRoot = portableRepoRoot.toLowerCase();

  if (compareFilePath === compareRepoRoot) return "";
  if (compareFilePath.startsWith(`${compareRepoRoot}/`)) {
    return portableFilePath.slice(portableRepoRoot.length + 1);
  }
  if (path.isAbsolute(filePath)) {
    return path.relative(repoRoot, filePath).split(path.sep).join("/");
  }
  return portableFilePath.replace(/^\.\//, "");
}

function targetPaths(input) {
  if (input.tool_name === "Edit" || input.tool_name === "Write") {
    const filePath = input.tool_input?.file_path;
    return typeof filePath === "string" && filePath.length > 0 ? [filePath] : [];
  }
  if (input.tool_name !== "apply_patch") return [];
  const patchText = input.tool_input?.command;
  if (typeof patchText !== "string") return [];
  return [...patchText.matchAll(/^\*\*\* (?:Update|Delete) File: (.+)$/gm)].map((match) => match[1]);
}

async function main() {
  let input;
  try {
    input = JSON.parse(await readStdin());
  } catch {
    return;
  }

  const filePaths = targetPaths(input);
  if (filePaths.length === 0) return;

  const repoRoot = typeof input.cwd === "string" && input.cwd.length > 0 ? input.cwd : process.cwd();
  let scan;
  try {
    scan = JSON.parse(await readFile(path.join(repoRoot, ".gunk-buster", "scan.json"), "utf8"));
  } catch {
    return;
  }
  if (!Array.isArray(scan?.findings)) return;

  for (const filePath of filePaths) {
    const targetPath = toRepoRelativePath(repoRoot, filePath);
    const finding = scan.findings.find(
      (candidate) =>
        candidate?.type === "file" && candidate?.path === targetPath && STALE_LABELS.has(candidate?.label),
    );
    if (finding) {
      console.log(
        `heads up: gunk-buster flagged ${targetPath} as stale (${finding.label}) as of the last scan — verify before relying on it`,
      );
    }
  }
}

main().catch(() => {});
