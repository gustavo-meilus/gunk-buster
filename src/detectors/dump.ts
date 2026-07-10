import { generatedMatch } from "../file-index.js";
import type { Detector } from "../detector.js";

/**
 * DUMP — a generated artifact committed by mistake (build output, cache,
 * coverage, tool residue). The only detector that needs just the file
 * index: it reuses the same generated-pattern match the index already
 * computed a "generated" kind from, so DUMP's notion of "generated" can
 * never drift from the file index's.
 *
 * A whole known build/cache/coverage directory (dist/, coverage/, ...) is
 * CERTAIN — there is no legitimate reason to hand-author a file there.
 * A bare extension match (.log, .tsbuildinfo) is weaker evidence — those
 * extensions are common tool residue, but not exclusive to it — so it is
 * only STRONG.
 */
export const dumpDetector: Detector = {
  label: "DUMP",
  examine(entry) {
    if (entry.kind !== "generated") return [];

    const match = generatedMatch(entry.path);
    if (match === null) return [];

    if (match.reason === "build-dir") {
      return [
        {
          rule: "generated-build-dir",
          confidence: "CERTAIN",
          rationale: `sits inside "${match.detail}/", a directory used for build output, caches, or coverage reports — almost certainly committed by mistake`,
        },
      ];
    }

    return [
      {
        rule: "generated-extension",
        confidence: "STRONG",
        rationale: `filename ends in "${match.detail}", an extension tool output commonly leaves behind`,
      },
    ];
  },
};
