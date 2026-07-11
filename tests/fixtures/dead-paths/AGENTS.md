# Agent Instructions

See `src/old-module.ts` for the legacy loader.

Tracked file check: `src/index.ts` is still here.

Tracked directory check: `src/` holds the source.

Globs are skipped: `src/*.ts`

Placeholders are skipped: `<repo>/config.json`, `{project}/README.md`, `$HOME/notes.md`

URLs are skipped: `https://example.com/src/old-module.ts`

Gitignored paths are skipped: `dist/bundle.js`

```
scripts/build-legacy.sh
```
