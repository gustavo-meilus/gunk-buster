#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import path from "node:path";
import { Command } from "commander";
import packageJson from "../package.json" with { type: "json" };
import { loadConfig, type GunkConfig } from "./config.js";
import { GunkError } from "./errors.js";
import { resolveRepoRoot } from "./git.js";
import { buildPileResult } from "./pile.js";
import { buildFixPlan, persistRadarResult, radar, tryLoadRadarResult } from "./radar.js";
import { writeReport } from "./report.js";
import { loadScanResult, persistScanResult, scan } from "./scan.js";
import type { RadarResult, ScanResult } from "./schema.js";
import { restore, type RestoreRef } from "./restore.js";
import { findTrappableFinding, trap } from "./trap.js";
import { verify } from "./verify.js";
import {
  renderRestoreHuman,
  renderVerifyHuman,
  renderFixPlanHuman,
  renderPileHuman,
  renderRadarHuman,
  renderReportHuman,
  renderScanHuman,
  renderTrapConfirmation,
  renderTrapDeclinedHuman,
  renderTrapHuman,
} from "./voice.js";

/**
 * The CLI is a thin shell over the engine seam: scan/pile/report load or
 * build a document, then print it — either the schema-versioned document
 * itself (`--json`) or a Chief-voiced (or professional-voiced) rendering of
 * it. All judgement lives in the engine; this file never computes a
 * verdict, a label, or a grouping.
 */

function printJson(document: unknown): void {
  process.stdout.write(`${JSON.stringify(document, null, 2)}\n`);
}

/**
 * The shared view preamble: resolve the repo, read its config (for the
 * voice), and load the persisted scan index — never re-scan (#7). Also
 * loads the persisted radar index when one exists (#13) — `undefined` when
 * `gunk radar` has never run here, so pile/report merge it in only when
 * present and stay byte-identical to MVP 1 output otherwise.
 */
async function loadViewContext(): Promise<{
  config: GunkConfig;
  scanResult: ScanResult;
  radarResult: RadarResult | undefined;
}> {
  const root = await resolveRepoRoot(process.cwd());
  const config = await loadConfig(root);
  const scanResult = await loadScanResult(root);
  const radarResult = await tryLoadRadarResult(root);
  return { config, scanResult, radarResult };
}

const program = new Command();

program
  .name("gunk")
  .description(
    "Finds context gunk — stale, agent-readable repo residue — before AI coding agents consume it.",
  )
  .version(packageJson.version);

program
  .command("scan")
  .description("Scan the current git repo and persist the scan index")
  .option("--json", "print the ScanResult document to stdout")
  .action(async (options: { json?: boolean }) => {
    const result = await scan(process.cwd());
    const scanPath = await persistScanResult(result);
    const config = await loadConfig(result.repoRoot);

    if (options.json) {
      printJson(result);
    } else {
      process.stdout.write(`${renderScanHuman(config.voice, result, scanPath)}\n`);
    }
    // Exit 0 on any successful scan, findings or not (ADR-0004).
  });

program
  .command("radar")
  .description("Run the radar checks over the current git repo and persist the radar index")
  .option("--json", "print the RadarResult document to stdout")
  .option(
    "--fix-plan",
    "render the aggregated per-finding suggestions as a checklist, instead of the findings themselves",
  )
  .action(async (options: { json?: boolean; fixPlan?: boolean }) => {
    const result = await radar(process.cwd());
    const radarPath = await persistRadarResult(result);
    const config = await loadConfig(result.repoRoot);

    if (options.fixPlan) {
      const fixPlan = buildFixPlan(result);
      if (options.json) {
        printJson(fixPlan);
      } else {
        process.stdout.write(`${renderFixPlanHuman(config.voice, fixPlan)}\n`);
      }
    } else if (options.json) {
      printJson(result);
    } else {
      process.stdout.write(`${renderRadarHuman(config.voice, result, radarPath)}\n`);
    }
    // Exit 0 on any successful radar run, findings or not (ADR-0004).
  });

program
  .command("pile")
  .description("Show findings grouped by label, from the persisted scan index")
  .option("--json", "print the PileResult document to stdout")
  .action(async (options: { json?: boolean }) => {
    const { config, scanResult, radarResult } = await loadViewContext();
    const pile = buildPileResult(scanResult, radarResult);

    if (options.json) {
      printJson(pile);
    } else {
      process.stdout.write(`${renderPileHuman(config.voice, pile)}\n`);
    }
    // Exit 0 regardless of findings — pile only ever renders, never judges.
  });

program
  .command("report")
  .description(
    "Write a markdown report into .gunk-buster/reports/ from the persisted scan index",
  )
  .option("--json", "print the ReportResult document to stdout")
  .action(async (options: { json?: boolean }) => {
    const { config, scanResult, radarResult } = await loadViewContext();
    const report = await writeReport(scanResult, radarResult);

    if (options.json) {
      printJson(report);
    } else {
      process.stdout.write(`${renderReportHuman(config.voice, report)}\n`);
    }
    // Exit 0 regardless of findings — report only ever renders, never judges.
  });

/**
 * Turn a user-supplied path (relative to cwd, possibly with backslashes on
 * Windows, possibly absolute) into the repo-relative, forward-slash shape
 * scan.json's finding paths use — the only place that translation happens,
 * so the engine seam (trap.ts) can assume it's already done.
 */
function toFindingPath(root: string, cwd: string, input: string): string {
  const absolute = path.isAbsolute(input) ? input : path.resolve(cwd, input);
  return path.relative(root, absolute).split(path.sep).join("/");
}

/** y/yes (case-insensitive) confirms; anything else (including Enter) declines. Prompts on stderr so `--json` stdout stays clean even without `--yes`. */
async function confirm(promptText: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = await rl.question(promptText);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

program
  .command("trap")
  .description(
    "Move a SAFE- or PROPOSE-verdict file finding to the vault, and write a git-tracked receipt",
  )
  .argument("<path>", "path (relative to cwd, or absolute) of the file finding to trap")
  .option("--yes", "skip the confirmation prompt")
  .option("--json", "print the Receipt document to stdout")
  .action(async (pathArg: string, options: { yes?: boolean; json?: boolean }) => {
    const root = await resolveRepoRoot(process.cwd());
    const config = await loadConfig(root);
    const scanResult = await loadScanResult(root);
    const relPath = toFindingPath(root, process.cwd(), pathArg);
    const finding = findTrappableFinding(scanResult, relPath, config.voice);

    if (!options.yes) {
      const proceed = await confirm(renderTrapConfirmation(config.voice, finding));
      if (!proceed) {
        process.stdout.write(`${renderTrapDeclinedHuman(config.voice)}\n`);
        return;
      }
    }

    const receipt = await trap(root, relPath, { config });

    if (options.json) {
      printJson(receipt);
    } else {
      process.stdout.write(`${renderTrapHuman(config.voice, receipt)}\n`);
    }
    // Exit 0 unless the auto-run verify finds damage (ADR-0005) — a
    // successful trap itself is never a failure (ADR-0004 is about findings).
    await verifyAfterMutation(root, config, options.json ?? false);
  });

/** A trap-id starts with its filesystem-safe UTC timestamp — the one shape a repo path can't take. */
const TRAP_ID_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z-/;

program
  .command("restore")
  .description(
    "Restore a trapped file byte-identically from its receipt (the vault keeps its copy)",
  )
  .argument("[ref]", "trap-id, or path (relative to cwd, or absolute) of the trapped file")
  .option("--batch <batchId>", "restore every trapped file from one bust/ask run")
  .option("--all", "restore everything currently trapped (the panic button)")
  .option("--force", "overwrite an occupied original path whose content differs")
  .option("--json", "print the RestoreResult document to stdout")
  .action(
    async (
      refArg: string | undefined,
      options: { batch?: string; all?: boolean; force?: boolean; json?: boolean },
    ) => {
      const modes = [refArg !== undefined, options.batch !== undefined, options.all ?? false];
      if (modes.filter(Boolean).length !== 1) {
        throw new GunkError(
          'restore takes exactly one target: a trap-id or path, "--batch <batchId>", or "--all"',
        );
      }

      const root = await resolveRepoRoot(process.cwd());
      const config = await loadConfig(root);

      let ref: RestoreRef;
      if (options.all) {
        ref = { all: true };
      } else if (options.batch !== undefined) {
        ref = { batchId: options.batch };
      } else if (TRAP_ID_PATTERN.test(refArg as string)) {
        ref = { trapId: refArg as string };
      } else {
        ref = { path: toFindingPath(root, process.cwd(), refArg as string) };
      }

      const result = await restore(root, ref, { config, force: options.force ?? false });

      if (options.json) {
        printJson(result);
      } else {
        process.stdout.write(`${renderRestoreHuman(config.voice, result)}\n`);
      }
      // Exit 0 unless the auto-run verify finds damage (ADR-0005) — the
      // restore itself, done as told, is never a failure (ADR-0004).
      await verifyAfterMutation(root, config, options.json ?? false);
    },
  );

/**
 * The auto-run closing every mutation (spec: verify runs after trap and
 * restore). Under `--json` the primary command owns stdout (one schema-valid
 * document), so verify's human rendering goes to stderr — the same surface
 * refusals use. A failed verify sets the non-zero exit either way (ADR-0005).
 */
async function verifyAfterMutation(root: string, config: GunkConfig, json: boolean): Promise<void> {
  const result = await verify(root, { config });
  const rendered = `${renderVerifyHuman(config.voice, result)}\n`;
  (json ? process.stderr : process.stdout).write(rendered);
  if (!result.passed) process.exitCode = 1;
}

program
  .command("verify")
  .description(
    "Check that no mutation left damage behind: links, agent-context refs, git status, verify.commands",
  )
  .option("--json", "print the VerifyResult document to stdout")
  .action(async (options: { json?: boolean }) => {
    const root = await resolveRepoRoot(process.cwd());
    const config = await loadConfig(root);
    const result = await verify(root, { config });

    if (options.json) {
      printJson(result);
    } else {
      process.stdout.write(`${renderVerifyHuman(config.voice, result)}\n`);
    }
    // The sole findings-independent failure exit in the tool (ADR-0005):
    // damage attributable to a mutation, never findings-as-failure (ADR-0004).
    if (!result.passed) process.exitCode = 1;
  });

try {
  await program.parseAsync(process.argv);
} catch (error) {
  const message = error instanceof GunkError ? error.message : String(error);
  process.stderr.write(`gunk: ${message}\n`);
  process.exitCode = 1;
}
