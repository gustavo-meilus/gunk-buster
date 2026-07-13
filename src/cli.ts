#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import path from "node:path";
import { Command } from "commander";
import packageJson from "../package.json" with { type: "json" };
import { findAskItems } from "./ask.js";
import { bust, findSafeFindings } from "./bust.js";
import { loadConfig, type GunkConfig } from "./config.js";
import { GunkError, refuse } from "./errors.js";
import { fix } from "./fix.js";
import { resolveRepoRoot } from "./git.js";
import { writeKeep } from "./keeps.js";
import { buildPileResult } from "./pile.js";
import { buildFixPlan, loadRadarResult, persistRadarResult, radar, tryLoadRadarResult } from "./radar.js";
import { writeReport } from "./report.js";
import { loadScanResult, persistScanResult, scan } from "./scan.js";
import type { RadarResult, ScanResult, TrapReceipt } from "./schema.js";
import { loadReceipts, restore, type RestoreRef } from "./restore.js";
import { buildBatchId, findTrappableFinding, trap } from "./trap.js";
import { verify } from "./verify.js";
import {
  renderAskChiefConfirmation,
  renderAskEmptyHuman,
  renderAskItemPrompt,
  renderAskKeptHuman,
  renderAskSummaryHuman,
  renderBustConfirmation,
  renderBustEmptyHuman,
  renderBustHuman,
  renderRestoreHuman,
  renderVerifyHuman,
  renderFixConfirmation,
  renderFixEmptyHuman,
  renderFixHuman,
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
 * present and stay byte-identical to MVP 1 output otherwise — and every trap
 * receipt on disk (#23), an empty array when `gunk trap`/`bust` has never
 * run here.
 */
async function loadViewContext(): Promise<{
  config: GunkConfig;
  scanResult: ScanResult;
  radarResult: RadarResult | undefined;
  receipts: TrapReceipt[];
}> {
  const root = await resolveRepoRoot(process.cwd());
  const config = await loadConfig(root);
  const scanResult = await loadScanResult(root);
  const radarResult = await tryLoadRadarResult(root);
  const receipts = await loadReceipts(root);
  return { config, scanResult, radarResult, receipts };
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
  .option(
    "--fix",
    "apply every suggestion-carrying claim finding behind one Chief confirmation, then run verify",
  )
  .option("--yes", "pre-approve the single --fix batch confirmation")
  .option("--force", "apply a --fix edit to a dirty or untracked target anyway")
  .action(
    async (options: {
      json?: boolean;
      fixPlan?: boolean;
      fix?: boolean;
      yes?: boolean;
      force?: boolean;
    }) => {
      if (options.fix) {
        // --fix's input contract mirrors trap's (spec: "requires a
        // persisted radar.json — same principle as trap's input contract"):
        // it reads back a PRIOR "gunk radar" run rather than recomputing one
        // itself, so "no radar, no fix" is a real refusal, and the
        // staleness guard has something genuinely stale to catch.
        const root = await resolveRepoRoot(process.cwd());
        const config = await loadConfig(root);
        const radarResult = await loadRadarResult(root);
        const plan = buildFixPlan(radarResult);

        if (plan.items.length === 0) {
          process.stdout.write(`${renderFixEmptyHuman(config.voice)}\n`);
          return;
        }

        let confirmed = options.yes ?? false;
        if (!confirmed) {
          // No TTY under --json — the single confirmation can't happen, so
          // --yes is the only way in (spec: "radar --fix refuses to act
          // without --yes" under --json).
          if (options.json) {
            refuse(
              config.voice,
              "Fix needs your yes, Chief — pass --yes under --json.",
              "radar --fix requires --yes under --json.",
            );
          }
          confirmed = await confirm(renderFixConfirmation(config.voice, plan.items));
          if (!confirmed) {
            process.stdout.write(`${renderTrapDeclinedHuman(config.voice)}\n`);
            return;
          }
        }

        const fixResult = await fix(root, {
          config,
          confirmed: true,
          force: options.force ?? false,
          onWarning: (warning) => process.stderr.write(`${warning}\n`),
        });

        if (options.json) {
          printJson(fixResult);
        } else {
          process.stdout.write(`${renderFixHuman(config.voice, fixResult)}\n`);
        }
        // Exit 0 unless the auto-run verify finds damage (ADR-0005) — same
        // convention as trap/bust/restore.
        await runVerifyAndSetExit(root, config, options.json ?? false);
        return;
      }

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
    },
  );

program
  .command("pile")
  .description("Show findings grouped by label, from the persisted scan index")
  .option("--json", "print the PileResult document to stdout")
  .action(async (options: { json?: boolean }) => {
    const { config, scanResult, radarResult, receipts } = await loadViewContext();
    const pile = buildPileResult(scanResult, radarResult, receipts);

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
    const { config, scanResult, radarResult, receipts } = await loadViewContext();
    const report = await writeReport(scanResult, radarResult, receipts);

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

/**
 * Reads one raw answer, trimmed and lowercased, for `gunk ask`'s per-item
 * [t/k/s/q] action — or `null` when stdin ended before answering (treated
 * as an implicit quit). `lines` must be a readline interface's own async
 * iterator (`rl[Symbol.asyncIterator]()`), not repeated `rl.question()`
 * calls: over piped, non-TTY stdin, a chunk can carry more than one line at
 * once, and `.question()` only ever captures the first — anything already
 * buffered past it is lost the moment its one-shot listener detaches. The
 * async-iterator protocol is what readline documents for exactly this case:
 * it queues lines that arrive before anyone's asked for them.
 */
async function nextAskAction(
  lines: AsyncIterator<string>,
  promptText: string,
): Promise<string | null> {
  process.stderr.write(promptText);
  const next = await lines.next();
  return next.done ? null : next.value.trim().toLowerCase();
}

program
  .command("trap")
  .description(
    "Move a scan-judged file finding to the vault (ASK_CHIEF only behind its mandatory confirmation), and write a git-tracked receipt",
  )
  .argument("<path>", "path (relative to cwd, or absolute) of the file finding to trap")
  .option("--yes", "skip the SAFE/PROPOSE confirmation prompt (never the ASK_CHIEF one)")
  .option("--force", "trap a tracked file with uncommitted changes anyway")
  .option("--json", "print the Receipt document to stdout")
  .action(async (pathArg: string, options: { yes?: boolean; force?: boolean; json?: boolean }) => {
    const root = await resolveRepoRoot(process.cwd());
    const config = await loadConfig(root);
    const scanResult = await loadScanResult(root);
    const relPath = toFindingPath(root, process.cwd(), pathArg);
    const finding = findTrappableFinding(scanResult, relPath, config.voice);

    // ASK_CHIEF: the confirmation is mandatory and interactive — --yes does
    // not apply, and under --json the engine refuses (agents must surface
    // these to the Chief; the moat has no flag-shaped gate).
    let askChiefConfirmed = false;
    if (finding.verdict === "ASK_CHIEF" && !options.json) {
      const proceed = await confirm(renderAskChiefConfirmation(config.voice, finding));
      if (!proceed) {
        process.stdout.write(`${renderTrapDeclinedHuman(config.voice)}\n`);
        return;
      }
      askChiefConfirmed = true;
    } else if (finding.verdict !== "ASK_CHIEF" && !options.yes) {
      const proceed = await confirm(renderTrapConfirmation(config.voice, finding));
      if (!proceed) {
        process.stdout.write(`${renderTrapDeclinedHuman(config.voice)}\n`);
        return;
      }
    }

    const receipt = await trap(root, relPath, {
      config,
      askChiefConfirmed,
      force: options.force ?? false,
      onWarning: (warning) => process.stderr.write(`${warning}\n`),
    });

    if (options.json) {
      printJson(receipt);
    } else {
      process.stdout.write(`${renderTrapHuman(config.voice, receipt)}\n`);
    }
    // Exit 0 unless the auto-run verify finds damage (ADR-0005) — a
    // successful trap itself is never a failure (ADR-0004 is about findings).
    await runVerifyAndSetExit(root, config, options.json ?? false);
  });

program
  .command("bust")
  .description(
    'Batch-trap every SAFE-verdict finding behind one Chief confirmation, then run verify once ("safe" is the only tier)',
  )
  .argument("[tier]", 'must be "safe" — the only bust tier in MVP 3')
  .option("--yes", "pre-approve the single batch confirmation")
  .option("--json", "print the BustResult document to stdout")
  .action(async (tier: string | undefined, options: { yes?: boolean; json?: boolean }) => {
    const root = await resolveRepoRoot(process.cwd());
    const config = await loadConfig(root);

    if (tier === undefined) {
      refuse(
        config.voice,
        'Bust what, Chief? Try "gunk bust safe".',
        'bust requires a tier argument — try "gunk bust safe".',
      );
    }
    if (tier !== "safe") {
      refuse(
        config.voice,
        `I don't know a "${tier}" tier, Chief — only "safe" exists so far.`,
        `Unknown bust tier "${tier}" — only "safe" exists.`,
      );
    }

    const scanResult = await loadScanResult(root);
    const findings = findSafeFindings(scanResult);

    if (findings.length === 0) {
      process.stdout.write(`${renderBustEmptyHuman(config.voice)}\n`);
      return;
    }

    let confirmed = options.yes ?? false;
    if (!confirmed) {
      // No TTY under --json — the single confirmation can't happen, so
      // --yes is the only way in (spec: "bust refuses to act without --yes").
      if (options.json) {
        refuse(
          config.voice,
          "Bust needs your yes, Chief — pass --yes under --json.",
          "bust requires --yes under --json.",
        );
      }
      confirmed = await confirm(renderBustConfirmation(config.voice, findings));
      if (!confirmed) {
        process.stdout.write(`${renderTrapDeclinedHuman(config.voice)}\n`);
        return;
      }
    }

    const result = await bust(root, {
      config,
      confirmed: true,
      onWarning: (warning) => process.stderr.write(`${warning}\n`),
    });

    if (options.json) {
      printJson(result);
    } else {
      process.stdout.write(`${renderBustHuman(config.voice, result)}\n`);
    }
    // Exit 0 unless the auto-run verify finds damage (ADR-0005) — same
    // convention as trap/restore.
    await runVerifyAndSetExit(root, config, options.json ?? false);
  });

program
  .command("ask")
  .description(
    "Walk PROPOSE findings, then ASK_CHIEF, one at a time: [t]rap, [k]eep, [s]kip, [q]uit",
  )
  .option("--json", "not supported — ask is interactive by definition")
  .action(async (options: { json?: boolean }) => {
    const root = await resolveRepoRoot(process.cwd());
    const config = await loadConfig(root);

    if (options.json) {
      refuse(
        config.voice,
        "Ask is interactive, Chief — no --json for this one.",
        "ask is interactive — --json is not supported.",
      );
    }

    const scanResult = await loadScanResult(root);
    const items = findAskItems(scanResult);

    if (items.length === 0) {
      process.stdout.write(`${renderAskEmptyHuman(config.voice)}\n`);
      return;
    }

    const now = () => new Date();
    const batchId = buildBatchId(now(), "ask");
    let trappedCount = 0;
    let keptCount = 0;
    let skippedCount = 0;

    // One readline interface for the whole session, consumed as an async
    // iterator — see `nextAskAction`'s doc comment for why.
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    const lines = rl[Symbol.asyncIterator]();
    try {
      for (const finding of items) {
        const action = await nextAskAction(lines, renderAskItemPrompt(config.voice, finding));

        if (action === null || action === "q") {
          break;
        } else if (action === "t") {
          try {
            const receipt = await trap(root, finding.path, {
              config,
              batchId,
              now,
              ...(finding.verdict === "ASK_CHIEF" ? { askChiefConfirmed: true } : {}),
              onWarning: (warning) => process.stderr.write(`${warning}\n`),
            });
            trappedCount++;
            process.stdout.write(`${renderTrapHuman(config.voice, receipt)}\n`);
          } catch (error) {
            const message = error instanceof GunkError ? error.message : String(error);
            process.stderr.write(`${message}\n`);
          }
        } else if (action === "k") {
          await writeKeep(root, {
            path: finding.path,
            contentHash: finding.contentHash,
            decidedAt: now().toISOString(),
          });
          keptCount++;
          process.stdout.write(`${renderAskKeptHuman(config.voice, finding.path)}\n`);
        } else {
          // s (or anything unrecognized): skip, records nothing (spec).
          skippedCount++;
        }
      }
    } finally {
      rl.close();
    }

    process.stdout.write(
      `${renderAskSummaryHuman(config.voice, { trapped: trappedCount, kept: keptCount, skipped: skippedCount })}\n`,
    );

    // Verify runs once after the session, only if anything was trapped
    // (spec) — a session of pure keeps/skips mutated nothing to check.
    if (trappedCount > 0) {
      await runVerifyAndSetExit(root, config, false);
    }
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
      await runVerifyAndSetExit(root, config, options.json ?? false);
    },
  );

/**
 * The one place verify's `passed: false` becomes a non-zero exit — the sole
 * findings-independent failure exit in the tool (ADR-0005; ADR-0004 stands
 * everywhere else). Shared by the standalone command and the auto-run
 * closing trap/restore. Under `--json` the primary command owns stdout (one
 * schema-valid document), so verify's human rendering goes to stderr — the
 * same surface refusals use.
 */
async function runVerifyAndSetExit(root: string, config: GunkConfig, json: boolean): Promise<void> {
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

    if (options.json) {
      // Standalone --json is the one caller that wants the document itself.
      const result = await verify(root, { config });
      printJson(result);
      if (!result.passed) process.exitCode = 1;
    } else {
      await runVerifyAndSetExit(root, config, false);
    }
  });

try {
  await program.parseAsync(process.argv);
} catch (error) {
  const message = error instanceof GunkError ? error.message : String(error);
  process.stderr.write(`gunk: ${message}\n`);
  process.exitCode = 1;
}
