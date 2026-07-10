#!/usr/bin/env node
import path from "node:path";
import { Command } from "commander";
import packageJson from "../package.json" with { type: "json" };
import { GunkError } from "./errors.js";
import { persistScanResult, scan } from "./scan.js";
import type { ScanResult } from "./schema.js";

/**
 * The CLI is a thin shell over the engine seam: scan, persist, print.
 * All judgement lives in the engine.
 */

function humanSummary(result: ScanResult): string {
  // Plain summary for now; the Chief voice lands in a later ticket.
  return [
    `Scanned ${result.repoRoot}`,
    `Findings: ${result.findings.length}`,
    `Scan index written to ${path.join(".gunk-buster", "scan.json")}`,
  ].join("\n");
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
    await persistScanResult(result);

    if (options.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      process.stdout.write(`${humanSummary(result)}\n`);
    }
    // Exit 0 on any successful scan, findings or not (ADR-0004).
  });

try {
  await program.parseAsync(process.argv);
} catch (error) {
  const message = error instanceof GunkError ? error.message : String(error);
  process.stderr.write(`gunk: ${message}\n`);
  process.exitCode = 1;
}
