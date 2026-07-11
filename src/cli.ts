#!/usr/bin/env node
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
import {
  renderFixPlanHuman,
  renderPileHuman,
  renderRadarHuman,
  renderReportHuman,
  renderScanHuman,
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

try {
  await program.parseAsync(process.argv);
} catch (error) {
  const message = error instanceof GunkError ? error.message : String(error);
  process.stderr.write(`gunk: ${message}\n`);
  process.exitCode = 1;
}
