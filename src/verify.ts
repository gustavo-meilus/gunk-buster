import { exec } from "node:child_process";
import { promisify } from "node:util";
import { loadConfig, type GunkConfig } from "./config.js";
import { buildDocGraph, findBrokenLinks } from "./doc-graph.js";
import { buildFileIndex, readIndexedFile } from "./file-index.js";
import { resolveRepoRoot, runGit } from "./git.js";
import { mentionsPath } from "./reference-graphs.js";
import { loadReceipts } from "./restore.js";
import {
  verifyResultSchema,
  type LinkFinding,
  type TrapReceipt,
  type VerifyCommandRun,
  type VerifyDamage,
  type VerifyResult,
} from "./schema.js";

/**
 * `gunk verify` — the delta-focused damage check that closes every mutation
 * (docs/specs/mvp-3-trap.md "Verify"): four checks in order — doc-graph link
 * check, agent-context-refs check, informational git status, user-configured
 * `verify.commands`. It answers "did this mutation break anything?", never
 * "is the repo perfect?" — scan answers the latter.
 *
 * The delta is the receipts: every `status: "trapped"` receipt names a path
 * whose absence is the tool's doing, so any remaining reference to one is
 * damage — and the receipt's own `restoreCommand` is the exact undo. All
 * other breakage (broken links to never-trapped targets) predates or is
 * unrelated to the mutation and stays informational (ADR-0005).
 */

const execAsync = promisify(exec);

export interface VerifyContext {
  /** Pre-loaded config, so callers that already have one (the CLI, trap/restore auto-runs) don't re-read the file. */
  config?: GunkConfig;
  /**
   * Whether to execute repository-configured shell commands. The CLI keeps
   * this enabled; read-only surfaces such as MCP must disable it.
   */
  runConfiguredCommands?: boolean;
  /** Clock injection for deterministic tests. */
  now?: () => Date;
}

/** Run one `verify.commands` entry through the shell at the repo root, capturing combined output. */
async function runVerifyCommand(root: string, command: string): Promise<VerifyCommandRun> {
  try {
    const { stdout, stderr } = await execAsync(command, { cwd: root, maxBuffer: 16 * 1024 * 1024 });
    return { command, exitCode: 0, output: `${stdout}${stderr}` };
  } catch (error) {
    const e = error as { code?: number; stdout?: string; stderr?: string };
    return {
      command,
      exitCode: typeof e.code === "number" ? e.code : 1,
      output: `${e.stdout ?? ""}${e.stderr ?? ""}`,
    };
  }
}

/**
 * The engine seam (spec): `verify(repoRoot, context) -> VerifyResult`.
 * Read-only apart from running the user's own `verify.commands` — verify
 * never mutates the repo, the vault, or git. Exit-code translation
 * (`passed: false` -> non-zero, ADR-0005) is the CLI's job, not this seam's.
 */
export async function verify(repoRoot: string, context: VerifyContext = {}): Promise<VerifyResult> {
  const root = await resolveRepoRoot(repoRoot);
  const config = context.config ?? (await loadConfig(root));
  const now = (context.now ?? (() => new Date()))();

  const trapped = (await loadReceipts(root)).filter((r) => r.status === "trapped");
  const trappedByPath = new Map<string, TrapReceipt>();
  for (const receipt of trapped) {
    if (!trappedByPath.has(receipt.originalPath)) trappedByPath.set(receipt.originalPath, receipt);
  }

  const damage: VerifyDamage[] = [];
  // One damage entry per (referencing file, trapped path) pair — a markdown
  // link in an agent-context file would otherwise show up in both checks.
  const seenRefs = new Set<string>();
  const recordRef = (check: "links" | "agent-context-refs", from: string, receipt: TrapReceipt): void => {
    const key = `${from} -> ${receipt.originalPath}`;
    if (seenRefs.has(key)) return;
    seenRefs.add(key);
    damage.push({
      check,
      from,
      target: receipt.originalPath,
      trapId: receipt.trapId,
      restoreCommand: receipt.restoreCommand,
    });
  };

  // 1. Link check — the doc graph's broken-link detection. A broken link to
  //    a trapped path is the mutation's damage; the rest is pre-existing.
  const fileIndex = await buildFileIndex(root);
  const docGraph = await buildDocGraph(root, fileIndex);
  const preexistingBrokenLinks: LinkFinding[] = [];
  for (const link of findBrokenLinks(docGraph)) {
    const receipt = trappedByPath.get(link.target);
    if (receipt) {
      recordRef("links", link.path, receipt);
    } else {
      preexistingBrokenLinks.push(link);
    }
  }

  // 2. Agent-context-refs check — does any agent-context file still mention
  //    a trapped path? Mention-scanned like reference-graphs.ts, because
  //    .cursorrules/YAML sources have no link syntax to parse.
  for (const entry of fileIndex) {
    if (entry.kind !== "agent-context") continue;
    const text = (await readIndexedFile(root, entry.path)).replace(/\\/g, "/");
    for (const [trappedPath, receipt] of trappedByPath) {
      if (mentionsPath(text, trappedPath)) recordRef("agent-context-refs", entry.path, receipt);
    }
  }

  // Reference damage is fixed from here on — capture the undo commands in
  // damage order before command damage (which has no restore) can append.
  const restoreCommands = [...new Set(damage.map((d) => ("restoreCommand" in d ? d.restoreCommand : "")))].filter(
    (c) => c !== "",
  );

  // 3. Git status — informational only (pending deletions, untracked receipts).
  const gitStatus = (await runGit(root, ["status", "--porcelain"]))
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line !== "");

  // 4. User commands — run in order, output captured; non-zero exit is damage.
  const commands: VerifyCommandRun[] = [];
  for (const command of context.runConfiguredCommands === false ? [] : config.verify.commands) {
    const run = await runVerifyCommand(root, command);
    commands.push(run);
    if (run.exitCode !== 0) {
      damage.push({ check: "commands", command: run.command, exitCode: run.exitCode });
    }
  }

  return verifyResultSchema.parse({
    schemaVersion: 1,
    verifiedAt: now.toISOString(),
    repoRoot: root,
    passed: damage.length === 0,
    damage,
    preexistingBrokenLinks,
    gitStatus,
    commands,
    restoreCommands,
  });
}
