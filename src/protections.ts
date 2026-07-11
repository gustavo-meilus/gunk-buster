import type { GunkConfig } from "./config.js";
import type { FileEntry } from "./file-index.js";
import type { GitIndex } from "./git-index.js";

/**
 * Protections — the safety axis, kept separate from evidence (ADR-0002).
 * Hard protections exclude a file from candidacy before any detector runs;
 * soft protections cap whatever verdict the evidence would otherwise earn.
 * Each list holds the rule names that fired, not just a boolean, so a
 * finding's `protections` field can say exactly why it was capped.
 */
export interface FileProtections {
  /** Rule names of hard protections that fired. Non-empty means excluded from candidacy. */
  hard: string[];
  /** Rule names of soft protections that fired. Non-empty means the verdict caps at ASK_CHIEF. */
  soft: string[];
}

const HARD_PROTECTED_NAMES = new Set(["LICENSE", "LICENSE.md", "LICENSE.txt", "SECURITY.md", "CODEOWNERS"]);

const LOCKFILE_NAMES = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "npm-shrinkwrap.json",
  "Cargo.lock",
  "Gemfile.lock",
  "poetry.lock",
  "composer.lock",
  "go.sum",
  "Pipfile.lock",
]);

const MANIFEST_NAMES = new Set([
  "package.json",
  "Cargo.toml",
  "pyproject.toml",
  "composer.json",
  "Gemfile",
  "go.mod",
]);

const SENSITIVE_KEYWORDS = ["migration", "security", "prod", "legal", "billing"];

/**
 * Does `text` contain a sensitive keyword (migration/security/prod/legal/
 * billing)? Case-insensitive substring match, same laxity for path and
 * content on purpose: a false hit only tightens the verdict (cap at
 * ASK_CHIEF), never loosens it. Exported so the RELIC detector and the
 * sensitive-keyword soft protection share one notion of "sensitive" — if
 * they disagreed, a RELIC finding could escape its ASK_CHIEF cap.
 */
export function containsSensitiveKeyword(text: string): boolean {
  const lower = text.toLowerCase();
  return SENSITIVE_KEYWORDS.some((keyword) => lower.includes(keyword));
}

function matchesProtectedPath(relPath: string, protectedPath: string): boolean {
  const normalized = protectedPath.endsWith("/") ? protectedPath.slice(0, -1) : protectedPath;
  return relPath === normalized || relPath.startsWith(`${normalized}/`);
}

function hardProtectionRules(entry: FileEntry, config: GunkConfig): string[] {
  // Code files are always hard-protected, but that gate lives one layer up:
  // the file index already sorts every file into a candidate kind or
  // "other" (code, above all — ADR-0001), and the classification pipeline
  // never calls this function for "other" entries. Repeating that check
  // here would be the same rule enforced twice, with two places to drift.
  const rules: string[] = [];

  const segments = entry.path.split("/");
  const name = segments[segments.length - 1] ?? entry.path;

  if (HARD_PROTECTED_NAMES.has(name)) rules.push("protected-file");
  if (LOCKFILE_NAMES.has(name)) rules.push("lockfile");
  if (MANIFEST_NAMES.has(name)) rules.push("package-manifest");
  if (name === "Dockerfile" || name.startsWith("Dockerfile.")) rules.push("dockerfile");
  if (segments[0] === ".github" && segments[1] === "workflows") rules.push("ci-workflow");
  if (segments[0] === "migrations") rules.push("migrations-path");
  if (segments[0] === "infra") rules.push("infra-path");
  if (segments.includes("terraform")) rules.push("terraform-path");
  if (segments.includes("ansible")) rules.push("ansible-path");
  if (config.protectedPaths.some((p) => matchesProtectedPath(entry.path, p))) {
    rules.push("user-protected-path");
  }

  return rules;
}

function softProtectionRules(
  entry: FileEntry,
  gitIndex: GitIndex,
  contents: ReadonlyMap<string, string>,
  config: GunkConfig,
): string[] {
  const rules: string[] = [];

  const lastTouched = gitIndex.get(entry.path);
  if (lastTouched !== undefined) {
    const ageMs = Date.now() - Date.parse(lastTouched);
    const windowMs = config.recencyWindowDays * 24 * 60 * 60 * 1000;
    if (ageMs < windowMs) rules.push("recently-modified");
  }

  // Sensitive keywords protect via the path or the content (issue #5 —
  // RELIC is defined by sensitive-keyword *content*). `contents` only holds
  // doc-kind files (see DetectorContext), so binary assets and generated
  // files are judged by path alone.
  if (
    containsSensitiveKeyword(entry.path) ||
    containsSensitiveKeyword(contents.get(entry.path) ?? "")
  ) {
    rules.push("sensitive-keyword");
  }

  return rules;
}

/** Classify every protection that applies to `entry`. */
export function classifyProtections(
  entry: FileEntry,
  gitIndex: GitIndex,
  contents: ReadonlyMap<string, string>,
  config: GunkConfig,
): FileProtections {
  return {
    hard: hardProtectionRules(entry, config),
    soft: softProtectionRules(entry, gitIndex, contents, config),
  };
}
