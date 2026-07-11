import type { CommandMention } from "./command-mentions.js";
import { extractCommandMentions } from "./command-mentions.js";
import type { RadarCheck, RadarContext } from "../radar-check.js";
import { labelFor } from "../radar-check.js";
import type { ClaimFinding } from "../schema.js";

/**
 * dead-command (#10, docs/specs/mvp-2-radar.md "Dead commands"): script
 * invocations (`npm run X`, `pnpm X`, `yarn X`, `bun run X`) resolved
 * against the union of scripts from every package.json in the file index.
 * Deliberately permissive — a script defined in ANY manifest (root or a
 * workspace) is never flagged, so monorepo docs never get a false positive
 * for a workspace-only script (no --filter/-w routing in MVP 2).
 */

/**
 * Package-manager built-in subcommands — never themselves script names, so
 * a bare pnpm/yarn invocation naming one of these is not a script call
 * ("pnpm install" is not "run the install script"). Not exhaustive of every
 * manager's CLI, but covers the common surface a doc would plausibly
 * mention.
 */
const BUILTIN_SUBCOMMANDS = new Set([
  "install",
  "i",
  "ci",
  "add",
  "remove",
  "rm",
  "uninstall",
  "un",
  "exec",
  "dlx",
  "create",
  "init",
  "run",
  "run-script",
  "test",
  "start",
  "publish",
  "update",
  "up",
  "upgrade",
  "outdated",
  "list",
  "ls",
  "link",
  "unlink",
  "dedupe",
  "prune",
  "audit",
  "config",
  "cache",
  "why",
  "root",
  "bin",
  "version",
  "login",
  "logout",
  "whoami",
  "pack",
  "rebuild",
  "restart",
  "stop",
  "view",
  "info",
  "show",
  "doctor",
  "fund",
  "help",
  "set",
  "get",
  "workspace",
  "workspaces",
]);

/**
 * Resolve a command mention to the script name it invokes, per manager
 * convention (spec: "npm run X", "pnpm X", "yarn X", "bun run X"). Returns
 * undefined when the mention is not a script invocation at all — a
 * built-in subcommand, or a manager/form this check does not resolve.
 * Exported for the truth-table unit suite.
 */
export function resolveScriptName(mention: CommandMention): string | undefined {
  if (mention.subcommand === undefined) return undefined;

  if (mention.subcommand === "run" || mention.subcommand === "run-script") {
    return mention.arg;
  }

  if (mention.manager === "npm" || mention.manager === "bun") {
    // npm/bun script invocation is only the explicit "run" form (spec).
    return undefined;
  }

  // pnpm/yarn bare form: "pnpm build", "yarn build" run the "build" script,
  // unless the token is itself a built-in subcommand.
  if (BUILTIN_SUBCOMMANDS.has(mention.subcommand)) return undefined;
  return mention.subcommand;
}

export const deadCommandCheck: RadarCheck = {
  name: "dead-command",
  examine(ctx: RadarContext): ClaimFinding[] {
    if (!ctx.config.radar.checks.deadCommands) return [];
    if (ctx.packages.manifests.length === 0) return []; // no manifest anywhere — non-Node repo, silent when unsure

    const findings: ClaimFinding[] = [];

    for (const file of ctx.surface) {
      for (const mention of extractCommandMentions(file.content)) {
        const scriptName = resolveScriptName(mention);
        if (scriptName === undefined) continue;
        if (ctx.packages.scriptUnion.has(scriptName)) continue;

        findings.push({
          type: "claim",
          path: file.entry.path,
          line: mention.line,
          label: labelFor(file.entry.kind),
          check: "dead-command",
          evidence: [
            {
              rule: "unknown-script",
              confidence: "CERTAIN",
              rationale: `\`${mention.raw}\` invokes script "${scriptName}", which is not defined in any package.json in the repo`,
            },
          ],
          expected: "a script name defined in some package.json in the repo",
          actual: mention.raw,
        });
      }
    }

    return findings;
  },
};
