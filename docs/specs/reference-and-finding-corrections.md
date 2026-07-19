# Reference and Finding Corrections

This specification closes the confirmed false-positive and liveness gaps in Radar and Scan. Vocabulary follows `CONTEXT.md`; architectural rationale is recorded in ADRs 0008–0013.

## Repository inventory

The current Git index is the sole repository inventory. Indexed files and directories implied by indexed descendants are live. Complete Git history and untracked worktree content do not prove liveness.

- An unstaged deletion remains live while indexed.
- A staged deletion is dead.
- A staged rename makes the new path live and the old path dead.
- An untracked replacement remains dead until added.

## Document path contract

Scan and Radar consume one shared extractor and resolver for explicit path mentions. It returns the source location, normalized token, anchor mode, and resolved target.

- Unanchored paths resolve from the containing document.
- A leading `/` anchors at the repository root.
- `/` and `\` are accepted as relative separators and normalize to `/`.
- Drive-qualified and UNC paths are skipped as machine-local claims.
- Repository-root fallback is forbidden.
- Tracked directories are valid targets when at least one indexed descendant exists.
- Explicit references to directories with no indexed descendants are dead, including Markdown links.

A token must match a clean path grammar, contain a non-numeric segment, exclude expression and assignment syntax, and carry at least one repository cue:

- an explicit `/`, `./`, `../` or Windows-equivalent anchor;
- a filename-like terminal extension; or
- an ancestor directory live under the selected resolution base.

URLs, variables, globs, placeholders, drive paths, UNC paths, ratios such as `16/9`, FFmpeg expressions such as `scale=iw*min(1920/iw)`, MIME types, and scoped packages do not become claims merely because they contain a slash.

Explicit non-link mentions are extracted only from inline code spans, fenced code blocks, and table cells. Inline code spans and fenced code blocks are split on whitespace so a path used as a command argument, such as `gunk scan docs/x.md`, is recognized; each whitespace-delimited token is judged independently against the path grammar and cue rules above, so command words that are not paths — flags, scoped packages, ratios, expressions, MIME types — never become claims. A table cell must instead have normalized content that is one path-shaped token. Ordinary prose is not mined. A resolved candidate emits a reference assertion; an unresolved mention may become a Radar dead-path claim.

## Reference assertions

GHOST means that a candidate has no valid inbound reference assertion. Assertions carry source, selector or syntax, and location provenance. Exact duplicates collapse, but every distinct provenance route is retained.

Only built-in or Chief-configured trusted reference sources emit assertions. Unknown manifests and arbitrary text are never auto-discovered as proof of life.

### Custom trusted sources

Custom definitions live under `references.sources` in `gunk.config.json`:

```json
{
  "references": {
    "sources": [
      {
        "name": "superpipelines-registry",
        "files": [".superpipelines/registry.json"],
        "format": "json",
        "selectors": ["pipelines.*.topology_path", "pipelines.*.agents.*"],
        "resolveFrom": "source-directory"
      }
    ]
  }
}
```

Supported formats are JSON, YAML, and text. JSON/YAML selectors support named properties, array indices, and `*` over object values or array elements. Multiple selectors are allowed. Recursive descent, predicates, transformations, and executable extractors are forbidden. Text extraction requires an explicit regular expression with a named `target` capture.

Only string results are targets. Non-string matches, malformed sources, unevaluable selectors, and source globs matching no files emit visible configuration diagnostics in human and JSON output. Valid sibling matches continue. Invalid input emits no assertion and never falls back to raw text scanning. Scan continues under the existing advisory exit-code policy.

A resolved target emits an assertion. A missing target emits a broken-reference finding attributed to the source and target.

## ECHO and intentional copies

Heading similarity nominates comparison pairs but is not ECHO evidence. ECHO requires:

- at least 80% containment of the smaller document in the larger; and
- at least three matching substantive blocks.

Paragraphs, individual list items, table rows, and fenced code blocks are blocks. Headings, blank blocks, and blocks shorter than 40 normalized characters are excluded. Markdown presentation syntax and prose case normalize; code remains exact except for line endings. The threshold is fixed, not configurable.

Intentional derivatives are declared under `references.copies`:

```json
{
  "references": {
    "copies": [
      {
        "canonical": "docs/current.md",
        "derivative": "docs/snapshots/v1.md",
        "reason": "Immutable release snapshot"
      }
    ]
  }
}
```

A copy relationship emits an assertion to its derivative and prevents ECHO only for the declared pair. It persists across content changes until removed. If either endpoint is missing, it emits a broken-reference finding and provides neither assertion nor ECHO suppression.

## Claim exceptions

A legitimate Radar claim is excepted through an explicit CLI action against a persisted finding. The Chief must supply a reason. Gunk Buster writes `.gunk-buster/claim-exceptions.json` with document path, check, exact normalized token, content hash, reason, and decision time.

An active exception keeps the claim in persisted and JSON output with disposition `EXCEPTED` and excludes it from active counts and patch plans. Human output may summarize it separately. Any document content change expires the exception and restores the active finding.

There are no inline suppression comments, whole-document substitutions for this mechanism, broad token allowlists, or manually calculated hashes.

## Implementation sequence

Each slice starts with retained failing reproductions and ends with the complete suite green:

1. Shared path grammar/resolution and current-index inventory.
2. Reference assertions, explicit Markdown mentions, and configurable trusted sources.
3. Content-based ECHO and copy relationships.
4. Content-pinned claim exceptions and `EXCEPTED` presentation.

Keep the slices as separate commits or issues even if released together. Update persisted schemas and release migration notes where their public contracts change, especially the removal of repository-root fallback for nested documents.
