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

Bare filename mentions are not path claims: `CLAUDE.md` and `missing-notes.md`

Slash commands are not paths: run `/deploy-now`, and `/` alone is syntax.

Root-anchored paths are real claims: `/src/index.ts` exists, `/src/gone.ts` does not.

FFmpeg expressions are not paths: `scale=iw*min(1920/iw)` and `scale=1920:-2`.

Numeric ratios are not paths: `16/9` and `4/3`.

Other slash syntax is not a repository claim: `video/mp4` and `@scope/package`.

Machine-local paths are not repository claims: `C:\Users\chief\notes.md` and `\\server\share\notes.md`.
