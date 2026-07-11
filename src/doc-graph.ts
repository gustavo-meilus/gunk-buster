import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Definition, Heading, Image, ImageReference, Link, LinkReference, Root } from "mdast";
import { remark } from "remark";
import { visit } from "unist-util-visit";
import { DOC_EXTENSIONS, type FileEntry } from "./file-index.js";
import type { LinkFinding } from "./schema.js";

/**
 * The markdown/doc graph — the third scan graph (see docs/specs/mvp-1-scan.md):
 * inbound/outbound links, image references, README references, and docs
 * nav/sidebar membership. Built with remark/mdast, never regex (ADR-0003) —
 * hand-rolled link extraction is a false-positive farm the moment a link
 * spans lines, uses reference-style syntax, or sits inside a code span.
 *
 * This is the reference surface detectors (GHOST, ECHO) consume; it is
 * exposed queryably (inboundLinksOf, outboundLinksOf, isReferencedByReadme,
 * isInNav, docStructureOf) rather than folded straight into a finding list,
 * so a detector can ask "does anything reference this file" or "what is
 * this doc's heading skeleton" without recomputing the graph.
 */

export type DocRefKind = "link" | "image";

export interface DocReference {
  /** Repo-relative (forward-slash) path of the file containing the reference. */
  from: string;
  /** The link/image target exactly as written in the markdown source. */
  raw: string;
  /** A markdown link (`[text](url)`) vs. an image (`![alt](url)`). */
  kind: DocRefKind;
  /**
   * An external URL (http/https/mailto/... — anything with a URI scheme).
   * Never resolved, never checked — no network calls, ever (product promise).
   */
  external: boolean;
  /**
   * Repo-relative (posix) path the target resolves to, after stripping any
   * `#anchor` and normalizing `.`/`..`/backslashes — null when the reference
   * is external, a same-document anchor, a directory reference, or escapes
   * the repo root (nothing in the file index could ever confirm or deny it).
   */
  resolved: string | null;
  /** True when `resolved` is set but no file at that path exists in the file index. */
  broken: boolean;
}

/**
 * A document's heading skeleton — what the ECHO duplicate detector compares.
 * Duplicate detection in MVP 1 is title/heading similarity only (fuzzy
 * content hashing is explicitly out of scope), so this is deliberately just
 * the headings, nothing about body text.
 */
export interface DocStructure {
  /** Text of the document's first depth-1 heading (`# Title`), or null when it has none. */
  title: string | null;
  /** Texts of every other heading, in document order (the title heading excluded). */
  headings: readonly string[];
}

export interface DocGraph {
  /** Every reference (link or image) found across every parsed doc, in file order. */
  references: readonly DocReference[];
  /** doc/agent-context path -> its outbound references. */
  outbound: ReadonlyMap<string, readonly DocReference[]>;
  /** doc/agent-context path -> its title/heading skeleton. */
  structures: ReadonlyMap<string, DocStructure>;
  /** repo-relative path -> paths of docs that link to it (valid, resolved link references). */
  inboundLinks: ReadonlyMap<string, ReadonlySet<string>>;
  /** repo-relative path -> paths of docs that reference it as an image. */
  inboundImages: ReadonlyMap<string, ReadonlySet<string>>;
  /** repo-relative paths referenced (linked or imaged) from any README.md. */
  readmeReferenced: ReadonlySet<string>;
  /** repo-relative paths referenced from a recognized nav/sidebar file. */
  navReferenced: ReadonlySet<string>;
}

/** Recognized docs nav/sidebar file basenames (mdbook/gitbook SUMMARY, docsify sidebar). */
const NAV_FILE_NAMES = new Set(["SUMMARY.md", "_sidebar.md", "_Sidebar.md"]);

function basename(relPath: string): string {
  const segments = relPath.split("/");
  return segments[segments.length - 1] ?? relPath;
}

function isReadmeFile(relPath: string): boolean {
  return basename(relPath) === "README.md";
}

function isNavFile(relPath: string): boolean {
  return NAV_FILE_NAMES.has(basename(relPath));
}

/**
 * Any URI scheme (http:, https:, mailto:, tel:, ...) — external, never
 * checked. Requires at least two characters before the colon so a pasted
 * Windows absolute path ("C:\Users\...") is never mistaken for a scheme —
 * every real URI scheme is two or more characters, but a drive letter is
 * exactly one (ADR-0003: cross-platform paths from day one).
 */
const EXTERNAL_SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]+:/;

/**
 * Resolve one raw link/image target against the file it was written in.
 * Every path operation here uses `path.posix` deliberately: the file index
 * always records forward-slash repo-relative paths (file-index.ts), and a
 * markdown target is written with forward slashes regardless of host OS —
 * resolving with the platform `path` module on Windows would join with
 * backslashes and silently fail to match anything in the file index,
 * producing false positives on every relative link. Raw backslashes in an
 * authored target (someone pasted a Windows-style path) are normalized to
 * forward slashes for the same reason.
 *
 * Exported (in addition to being exercised through `buildDocGraph`/`scan`)
 * so relative-path, anchor, and cross-platform-separator resolution can be
 * unit-tested directly without standing up a fixture repo for every edge
 * case — the engine seam is too coarse for that.
 */
export function resolveReference(
  fromPath: string,
  raw: string,
  kind: DocRefKind,
  filePaths: ReadonlySet<string>,
): DocReference {
  const unresolved = (): DocReference => ({
    from: fromPath,
    raw,
    kind,
    external: false,
    resolved: null,
    broken: false,
  });

  const trimmed = raw.trim();
  if (trimmed === "" || EXTERNAL_SCHEME.test(trimmed)) {
    return { from: fromPath, raw, kind, external: true, resolved: null, broken: false };
  }

  const hashIndex = trimmed.indexOf("#");
  const withoutAnchor = hashIndex === -1 ? trimmed : trimmed.slice(0, hashIndex);
  if (withoutAnchor === "") {
    return unresolved(); // pure same-document anchor, e.g. "#section"
  }

  const normalizedRaw = withoutAnchor.replace(/\\/g, "/");
  if (normalizedRaw.endsWith("/")) {
    return unresolved(); // directory reference, e.g. "docs/" — not a file target
  }

  const fromDir = path.posix.dirname(fromPath); // "." for a root-level file
  const joined = normalizedRaw.startsWith("/")
    ? normalizedRaw.slice(1)
    : path.posix.join(fromDir === "." ? "" : fromDir, normalizedRaw);
  const resolved = path.posix.normalize(joined);

  if (resolved === "." || resolved === "") {
    return unresolved(); // resolves to a directory (e.g. the repo root)
  }
  if (resolved === ".." || resolved.startsWith("../")) {
    return unresolved(); // escapes the repo root — outside the file index, can't be confirmed
  }

  return {
    from: fromPath,
    raw,
    kind,
    external: false,
    resolved,
    broken: !filePaths.has(resolved),
  };
}

/**
 * The visible text of one heading node: its text and inline-code children,
 * concatenated in order. Emphasis/strong wrappers contribute their inner
 * text; links inside a heading contribute their label, not their URL.
 */
function headingText(heading: Heading): string {
  const parts: string[] = [];
  visit(heading, (node) => {
    if (node.type === "text" || node.type === "inlineCode") {
      parts.push((node as { value: string }).value);
    }
  });
  return parts.join("");
}

/** Pull the title/heading skeleton out of a parsed markdown tree. */
function structureFromTree(tree: Root): DocStructure {
  let title: string | null = null;
  const headings: string[] = [];

  visit(tree, "heading", (node: Heading) => {
    const text = headingText(node);
    if (title === null && node.depth === 1) {
      title = text;
    } else {
      headings.push(text);
    }
  });

  return { title, headings };
}

/**
 * Parse one document's markdown into its DocStructure. Exported (in
 * addition to being exercised through `buildDocGraph`/`scan`) so heading
 * extraction edge cases (setext titles, inline code in headings, docs with
 * no h1) can be unit-tested directly — the engine seam is too coarse for
 * that.
 */
export function extractDocStructure(content: string): DocStructure {
  return structureFromTree(remark().parse(content) as Root);
}

/** Parse one document's markdown tree into its outbound references (links, images, and reference-style variants of both). */
function extractReferences(
  fromPath: string,
  tree: Root,
  filePaths: ReadonlySet<string>,
): DocReference[] {
  const definitions = new Map<string, string>();
  visit(tree, "definition", (node: Definition) => {
    definitions.set(node.identifier, node.url);
  });

  const refs: DocReference[] = [];
  const record = (rawUrl: string | undefined, kind: DocRefKind): void => {
    if (rawUrl === undefined) return; // dangling reference (no matching definition) — nothing to resolve
    refs.push(resolveReference(fromPath, rawUrl, kind, filePaths));
  };

  visit(tree, (node) => {
    switch (node.type) {
      case "link":
        record((node as Link).url, "link");
        break;
      case "image":
        record((node as Image).url, "image");
        break;
      case "linkReference":
        record(definitions.get((node as LinkReference).identifier), "link");
        break;
      case "imageReference":
        record(definitions.get((node as ImageReference).identifier), "image");
        break;
      default:
        break;
    }
  });

  return refs;
}

/**
 * Build the doc graph for a repo: parse every doc/agent-context markdown
 * file's links and images, and index the results for the queries later
 * detectors need. Only markdown-extension files are parsed — a `.cursorrules`
 * or `.aider.conf.yml` agent-context file is prose/YAML, not markdown, and
 * feeding it to remark would silently find no links rather than crash, so
 * this is a deliberate scope choice, not a gap masked by a try/catch.
 */
export async function buildDocGraph(
  repoRoot: string,
  fileIndex: readonly FileEntry[],
): Promise<DocGraph> {
  const filePaths = new Set(fileIndex.map((entry) => entry.path));
  const parsable = fileIndex.filter(
    (entry) =>
      (entry.kind === "doc" || entry.kind === "agent-context") &&
      DOC_EXTENSIONS.has(path.posix.extname(entry.path).toLowerCase()),
  );

  const references: DocReference[] = [];
  const outbound = new Map<string, readonly DocReference[]>();
  const structures = new Map<string, DocStructure>();

  for (const entry of parsable) {
    const absPath = path.join(repoRoot, ...entry.path.split("/"));
    const content = await readFile(absPath, "utf8");
    const tree = remark().parse(content) as Root;
    const refs = extractReferences(entry.path, tree, filePaths);
    outbound.set(entry.path, refs);
    references.push(...refs);
    structures.set(entry.path, structureFromTree(tree));
  }

  const inboundLinks = new Map<string, Set<string>>();
  const inboundImages = new Map<string, Set<string>>();
  const readmeReferenced = new Set<string>();
  const navReferenced = new Set<string>();

  for (const ref of references) {
    if (ref.external || ref.resolved === null || ref.broken) continue;

    const bucket = ref.kind === "image" ? inboundImages : inboundLinks;
    const set = bucket.get(ref.resolved) ?? new Set<string>();
    set.add(ref.from);
    bucket.set(ref.resolved, set);

    if (isReadmeFile(ref.from)) readmeReferenced.add(ref.resolved);
    if (isNavFile(ref.from)) navReferenced.add(ref.resolved);
  }

  return {
    references,
    outbound,
    structures,
    inboundLinks,
    inboundImages,
    readmeReferenced,
    navReferenced,
  };
}

/** The title/heading skeleton of `docPath`, or null when it was never parsed (not a markdown doc). */
export function docStructureOf(graph: DocGraph, docPath: string): DocStructure | null {
  return graph.structures.get(docPath) ?? null;
}

/** Every parsed doc's [path, skeleton], sorted by path — the ECHO detector's counterpart universe. */
export function allDocStructures(graph: DocGraph): readonly (readonly [string, DocStructure])[] {
  return [...graph.structures.entries()].sort(([a], [b]) => a.localeCompare(b));
}

/** Paths of docs that link to `targetPath` (valid, resolved link references only — not images). */
export function inboundLinksOf(graph: DocGraph, targetPath: string): readonly string[] {
  return [...(graph.inboundLinks.get(targetPath) ?? [])];
}

/** Paths of docs that reference `targetPath` as an image. */
export function inboundImagesOf(graph: DocGraph, targetPath: string): readonly string[] {
  return [...(graph.inboundImages.get(targetPath) ?? [])];
}

/** Every outbound reference (link or image) `sourcePath` contains. */
export function outboundReferencesOf(graph: DocGraph, sourcePath: string): readonly DocReference[] {
  return graph.outbound.get(sourcePath) ?? [];
}

/** Is `targetPath` linked or imaged from any README.md in the repo? */
export function isReferencedByReadme(graph: DocGraph, targetPath: string): boolean {
  return graph.readmeReferenced.has(targetPath);
}

/** Is `targetPath` referenced from a recognized docs nav/sidebar file (SUMMARY.md, _sidebar.md)? */
export function isInNav(graph: DocGraph, targetPath: string): boolean {
  return graph.navReferenced.has(targetPath);
}

/**
 * The first graph-driven finding (#4): every internal, non-external
 * reference whose target does not exist in the file index becomes a
 * `type: "link"` finding with CERTAIN evidence — this is a graph fact, not
 * a judgement call, so it bypasses the verdict lattice entirely (no label,
 * no verdict, no protections; ADR-0002's lattice governs file findings only).
 */
export function findBrokenLinks(graph: DocGraph): LinkFinding[] {
  const findings = graph.references
    .filter((ref) => !ref.external && ref.resolved !== null && ref.broken)
    .map(
      (ref): LinkFinding => ({
        type: "link",
        path: ref.from,
        target: ref.resolved as string,
        evidence: [
          {
            rule: ref.kind === "image" ? "broken-image-link" : "broken-link",
            confidence: "CERTAIN",
            rationale: `target "${ref.resolved}" does not exist`,
          },
        ],
      }),
    );

  return findings.sort((a, b) => a.path.localeCompare(b.path) || a.target.localeCompare(b.target));
}
