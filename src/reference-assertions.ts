import path from "node:path";
import { readIndexedFile, type FileEntry } from "./file-index.js";
import type { GunkConfig } from "./config.js";
import type { BrokenReferenceFinding, ReferenceDiagnostic } from "./schema.js";
import { glob } from "tinyglobby";
import { parse as parseJsonWithPointers } from "json-source-map";
import { LineCounter, parseDocument } from "yaml";

export interface ReferenceAssertion {
  source: string;
  sourcePath: string;
  selector: string;
  location?: number;
  target: string;
}

export interface ReferenceAssertionGraph {
  assertions: readonly ReferenceAssertion[];
  referenced: ReadonlySet<string>;
  broken: readonly BrokenReferenceFinding[];
  diagnostics: readonly ReferenceDiagnostic[];
  copyRelationships: readonly ValidCopyRelationship[];
}

export interface ValidCopyRelationship {
  canonical: string;
  derivative: string;
}

function assertionKey(assertion: ReferenceAssertion): string {
  return JSON.stringify([assertion.source, assertion.sourcePath, assertion.selector, assertion.location ?? null, assertion.target]);
}

export function deduplicateAssertions(assertions: readonly ReferenceAssertion[]): ReferenceAssertion[] {
  return [...new Map(assertions.map((assertion) => [assertionKey(assertion), assertion])).values()];
}

interface SelectedValue { value: unknown; path: (string | number)[] }

function select(value: unknown, selector: string): { failures: number; values: SelectedValue[] } {
  let values: SelectedValue[] = [{ value, path: [] }];
  let failures = 0;
  for (const segment of selector.split(".")) {
    const next: SelectedValue[] = [];
    for (const selected of values) {
      const current = selected.value;
      if (segment === "*") {
        if (Array.isArray(current)) current.forEach((item, index) => next.push({ value: item, path: [...selected.path, index] }));
        else if (typeof current === "object" && current !== null) Object.entries(current).forEach(([key, item]) => next.push({ value: item, path: [...selected.path, key] }));
        else failures++;
      } else if (Array.isArray(current) && /^\d+$/.test(segment)) {
        const found = current[Number(segment)];
        if (found === undefined) failures++; else next.push({ value: found, path: [...selected.path, Number(segment)] });
      } else if (typeof current === "object" && current !== null && Object.hasOwn(current, segment)) {
        next.push({ value: (current as Record<string, unknown>)[segment], path: [...selected.path, segment] });
      } else failures++;
    }
    values = next;
  }
  return { failures, values };
}

function jsonPointer(path: readonly (string | number)[]): string {
  return path.map((segment) => `/${String(segment).replace(/~/g, "~0").replace(/\//g, "~1")}`).join("");
}

function targetPath(sourcePath: string, target: string, resolveFrom: "source-directory" | "repository-root"): string | null {
  const normalized = target.replace(/\\/g, "/");
  const base = resolveFrom === "source-directory" ? path.posix.dirname(sourcePath) : "";
  const resolved = path.posix.normalize(path.posix.join(base === "." ? "" : base, normalized.replace(/^\//, "")));
  return resolved === ".." || resolved.startsWith("../") ? null : resolved;
}

export async function buildConfiguredAssertions(repoRoot: string, entries: readonly FileEntry[], inventory: ReadonlySet<string>, config: GunkConfig): Promise<ReferenceAssertionGraph> {
  const entryByPath = new Map(entries.filter((entry) => inventory.has(entry.path)).map((entry) => [entry.path, entry]));
  const assertions: ReferenceAssertion[] = [];
  const broken: BrokenReferenceFinding[] = [];
  const diagnostics: ReferenceDiagnostic[] = [];
  const copyRelationships: ValidCopyRelationship[] = [];

  const record = (definition: GunkConfig["references"]["sources"][number], sourcePath: string, selector: string, raw: unknown, line?: number): void => {
    if (typeof raw !== "string") {
      diagnostics.push({ code: "non-string-match", source: definition.name, path: sourcePath, selector, message: `selector ${selector} matched a non-string value` });
      return;
    }
    const target = targetPath(sourcePath, raw, definition.resolveFrom);
    if (target === null) {
      broken.push({ type: "reference", path: sourcePath, target: raw, source: definition.name, selector, ...(line ? { line } : {}), evidence: [{ rule: "broken-reference", confidence: "CERTAIN", rationale: `target "${raw}" cannot resolve inside the repository` }] });
    } else if (inventory.has(target)) {
      assertions.push({ source: definition.name, sourcePath, selector, ...(line ? { location: line } : {}), target });
    } else {
      broken.push({ type: "reference", path: sourcePath, target, source: definition.name, selector, ...(line ? { line } : {}), evidence: [{ rule: "broken-reference", confidence: "CERTAIN", rationale: `target "${target}" does not exist` }] });
    }
  };

  for (const definition of config.references.sources) {
    const matches = (await glob(definition.files, { cwd: repoRoot, onlyFiles: true, dot: true })).filter((match) => inventory.has(match.replace(/\\/g, "/"))).sort();
    if (matches.length === 0) {
      diagnostics.push({ code: "source-glob-empty", source: definition.name, message: `source globs matched no files: ${definition.files.join(", ")}` });
      continue;
    }
    for (const sourcePath of matches) {
      let raw: string;
      try { raw = await readIndexedFile(repoRoot, sourcePath); }
      catch (error) { diagnostics.push({ code: "malformed-source", source: definition.name, path: sourcePath, message: String(error) }); continue; }
      if (definition.format === "text") {
        let regex: RegExp;
        try { regex = new RegExp(definition.regex, "gm"); }
        catch (error) { diagnostics.push({ code: "malformed-source", source: definition.name, path: sourcePath, message: String(error) }); continue; }
        for (const match of raw.matchAll(regex)) {
          record(definition, sourcePath, `regex:${definition.regex}`, match.groups?.target, raw.slice(0, match.index).split(/\r?\n/).length);
        }
        continue;
      }
      let parsed: unknown;
      let locationOf: (selected: SelectedValue) => number;
      try {
        if (definition.format === "json") {
          const sourceMap = parseJsonWithPointers(raw);
          parsed = sourceMap.data;
          locationOf = (selected) => (sourceMap.pointers[jsonPointer(selected.path)]?.value.line ?? 0) + 1;
        } else {
          const lineCounter = new LineCounter();
          const document = parseDocument(raw, { lineCounter });
          if (document.errors.length > 0) throw document.errors[0];
          parsed = document.toJS();
          locationOf = (selected) => {
            const node = document.getIn(selected.path, true) as { range?: [number, number, number] } | undefined;
            return node?.range ? lineCounter.linePos(node.range[0]).line : 1;
          };
        }
      }
      catch (error) { diagnostics.push({ code: "malformed-source", source: definition.name, path: sourcePath, message: String(error) }); continue; }
      for (const selector of definition.selectors) {
        const selected = select(parsed, selector);
        if (selected.failures > 0 || selected.values.length === 0) diagnostics.push({ code: "unevaluable-selector", source: definition.name, path: sourcePath, selector, message: `selector ${selector} cannot be evaluated for ${Math.max(1, selected.failures)} branch(es)` });
        for (const value of selected.values) record(definition, sourcePath, selector, value.value, locationOf(value));
      }
    }
  }

  for (const [index, relationship] of config.references.copies.entries()) {
    const selector = `references.copies.${index}`;
    const invalid = [relationship.canonical, relationship.derivative].filter((target) => entryByPath.get(target)?.kind !== "doc");
    if (invalid.length > 0) {
      for (const target of invalid) {
        const exists = inventory.has(target);
        broken.push({ type: "reference", path: "gunk.config.json", target, source: "copy-relationship", selector, evidence: [{ rule: "broken-reference", confidence: "CERTAIN", rationale: exists ? `copy relationship target "${target}" is not a document` : `copy relationship target "${target}" does not exist` }] });
      }
      continue;
    }
    assertions.push({ source: "copy-relationship", sourcePath: "gunk.config.json", selector, target: relationship.derivative });
    copyRelationships.push({ canonical: relationship.canonical, derivative: relationship.derivative });
  }

  const retained = deduplicateAssertions(assertions);
  return { assertions: retained, referenced: new Set(retained.map((a) => a.target)), broken, diagnostics, copyRelationships };
}
