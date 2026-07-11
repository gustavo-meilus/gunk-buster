import { resolveTruePackageManager } from "../package-graph.js";
import type { RadarCheck, RadarContext } from "../radar-check.js";
import { labelFor } from "../radar-check.js";
import type { ClaimFinding } from "../schema.js";
import { extractCommandMentions } from "./command-mentions.js";

/**
 * package-manager-drift (#10, docs/specs/mvp-2-radar.md "Package-manager
 * drift"): every command-mention naming a package manager other than the
 * repo's true one is a wrong claim. Ground truth comes from
 * resolveTruePackageManager's strict precedence; when it returns null
 * (multiple lockfiles, no signal, non-Node repo) this check emits nothing —
 * a tool built to kill misleading context never guesses.
 */
export const packageManagerDriftCheck: RadarCheck = {
  name: "package-manager-drift",
  examine(ctx: RadarContext): ClaimFinding[] {
    if (!ctx.config.radar.checks.packageManagerDrift) return [];

    const truth = resolveTruePackageManager(ctx.packages);
    if (truth === null) return [];

    const findings: ClaimFinding[] = [];

    for (const file of ctx.surface) {
      for (const mention of extractCommandMentions(file.content)) {
        if (mention.manager === truth.manager) continue;

        // The manager name always leads `raw` (the extractor anchors on it),
        // so a plain string replace of the leading token rewrites the
        // invocation to the true manager without touching the rest.
        const expected = truth.manager + mention.raw.slice(mention.manager.length);

        const rationale =
          truth.rule === "packageManager-field"
            ? `\`${mention.raw}\` names ${mention.manager}; the root package.json's "packageManager" field says ${truth.manager}`
            : `\`${mention.raw}\` names ${mention.manager}; the repo's lone lockfile is a ${truth.manager} lockfile`;

        findings.push({
          type: "claim",
          path: file.entry.path,
          line: mention.line,
          label: labelFor(file.entry.kind),
          check: "package-manager-drift",
          evidence: [{ rule: "pm-mismatch", confidence: truth.confidence, rationale }],
          expected,
          actual: mention.raw,
          suggestion: { replace: mention.raw, with: expected },
        });
      }
    }

    return findings;
  },
};
