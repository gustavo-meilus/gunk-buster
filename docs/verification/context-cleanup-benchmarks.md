# Context cleanup benchmark evidence

Status: **exploratory evidence, not a product performance guarantee**.

This record captures repeated Codex CLI measurements of the fixed Context
Benchmark prompt before and after repository context filtering. It supplements
the MVP 5 plugin proof, but it does not replace that proof's pre-plugin versus
post-plugin activation test.

## Fixed prompt and measurements

Every run used a fresh ephemeral Codex CLI session and the byte-identical prompt:

```text
Explain all that this repository contains, including its purpose, important documentation, agent instructions, available commands, and any concerns you would want resolved before making a change.
```

The harness recorded wall-clock time, input and cached-input tokens, output and
reasoning-output tokens, session ID, Codex exit code, and whether the target
worktree changed. Uncached input is calculated as input minus cached input.
Medians are reported because individual agent exploration paths vary.

## Dominus Pax experiment

Date: 2026-07-15. Platform: Windows 11 with Codex CLI 0.144.4 running through
WSL. Model: `gpt-5.6-luna`. Base commit:
`c44320c3a5e8732005702636988a4ab6e8b72774`.

The source checkout contained extensive user-owned changes, so it was not
modified or reset. Two ordinary local clones at the same base commit isolated
the conditions. Ordinary clones were required because Gunk Buster 0.1.1 did not
recognize a Git linked worktree on the WSL/Windows path.

The repository was a deliberately difficult candidate:

- 398 tracked files;
- 6.8 MB of tracked generated files under `output/`;
- 338 structural scan findings;
- 505 Radar findings.

The post condition added only `.codexignore`. It excluded generated pipeline
runs (`output/`), historical `docs/superpowers/` artifacts, subtitle golden
fixtures, caches, rendered subtitle exports, and Gunk's local indexes. Core code,
current documentation, and `.opencode/agents/` remained visible. No repository
content was deleted and no ambiguous finding was automatically repaired.

### Median results

Negative deltas mean that the post-cleanup condition used less time or fewer
tokens.

| Effort | Complete runs per phase | Pre wall (s) | Post wall (s) | Wall delta | Input delta | Cached delta | Uncached delta | Output delta | Reasoning delta |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Low | 3 | 92.502 | 90.659 | -2.0% | +30.6% | +37.0% | -6.6% | +1.1% | -17.3% |
| Medium | 3 | 146.330 | 128.475 | -12.2% | +6.8% | +11.2% | +2.1% | -8.8% | -12.1% |
| High | 2 | 294.207 | 368.048 | +25.1% | +78.1% | +80.5% | +50.0% | +20.5% | +1.1% |

All 16 included sessions exited successfully and reported unchanged worktrees.
The interrupted Luna/high third pre run had no summary and was excluded. No
Terra run completed, so Terra is excluded rather than mixed into the evidence.

### Raw completed runs

| Effort | Phase | Wall (s) | Input | Cached | Uncached | Output | Reasoning | Session |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Low | Pre | 93.902 | 194,242 | 152,832 | 41,410 | 3,535 | 313 | `019f678c-85c5-74c3-ae06-42a6791f1e1f` |
| Low | Post | 81.024 | 145,607 | 112,128 | 33,479 | 3,227 | 259 | `019f678e-72e5-77c1-bac6-6bb82c79c1db` |
| Low | Pre | 77.293 | 157,970 | 115,968 | 42,002 | 3,595 | 293 | `019f678f-be35-7d41-b8e1-1e0a74b5fcf7` |
| Low | Post | 90.659 | 254,029 | 214,784 | 39,245 | 3,769 | 294 | `019f6790-f56c-7800-98c2-4504abb4c370` |
| Low | Pre | 92.502 | 243,191 | 197,632 | 45,559 | 4,256 | 383 | `019f6792-6874-7bd3-aa98-058b17b085fb` |
| Low | Post | 98.280 | 253,637 | 209,408 | 44,229 | 3,636 | 253 | `019f6793-dcf7-7a50-b124-d8115e1ac057` |
| Medium | Pre | 166.059 | 627,070 | 548,096 | 78,974 | 7,623 | 1,316 | `019f6795-6863-7773-b666-ab40725fce03` |
| Medium | Post | 128.475 | 462,177 | 395,264 | 66,913 | 5,744 | 794 | `019f6797-fee9-7d53-82ab-6269b2b7eda1` |
| Medium | Pre | 146.330 | 418,460 | 309,248 | 109,212 | 6,377 | 903 | `019f6799-fce3-7bf0-a008-742522d8d1b5` |
| Medium | Post | 123.639 | 435,226 | 354,560 | 80,666 | 5,818 | 737 | `019f679c-424b-7811-aab7-09ed78e9bc5e` |
| Medium | Pre | 130.891 | 432,684 | 355,584 | 77,100 | 5,947 | 889 | `019f679e-2f1e-73a1-960a-2bde2a2bce17` |
| Medium | Post | 170.985 | 612,070 | 503,552 | 108,518 | 6,860 | 1,177 | `019f67a0-3578-7af3-82ca-18a0b1b40d18` |
| High | Pre | 306.642 | 1,893,282 | 1,753,344 | 139,938 | 13,835 | 5,965 | `019f67a2-db9d-7d71-9920-7761b12c0e7f` |
| High | Post | 357.639 | 3,086,413 | 2,912,768 | 173,645 | 14,920 | 5,363 | `019f67a7-9484-7b53-9116-27dcf5fbdad9` |
| High | Pre | 281.772 | 1,489,898 | 1,364,480 | 125,418 | 13,231 | 4,368 | `019f67ad-0efe-7f03-86ca-8fa2cd7cb58a` |
| High | Post | 378.457 | 2,938,560 | 2,714,112 | 224,448 | 17,683 | 5,080 | `019f67b1-618a-75f3-9768-b7bb34344ec7` |

Local artifacts are stored outside the repositories under
`~/.local/state/gunk-buster/benchmarks/dominus-pax-matrix/`.

## Earlier repository evidence

The Dominus Pax result is consistent with earlier experiments: context cleanup
does not produce a universal latency or token reduction.

- AIBoarding, Terra/high, one run per condition: wall time increased 7.3%, input
  increased 24.3%, output decreased 9.1%, and reasoning decreased 2.9%. This is
  weak evidence because the cleanup mainly introduced line-ending changes and
  metadata while scan counts remained unchanged.
- Superpipelines, three runs per condition across five model/effort
  configurations: wall time improved in 1/5 configurations, input improved in
  3/5, output improved in 2/5, and reasoning improved in 4/5. Terra/high was the
  only configuration where every measured median improved.

## Interpretation and claim boundary

The strongest recurring signal is reduced reasoning usage in some
model/effort combinations. Latency and total input are not reliable gains.
Dominus Pax medium effort improved wall time and reasoning while increasing
input; high effort regressed substantially in both completed pairs.

The evidence supports this limited statement:

> Filtering duplicated or misleading repository context can reduce agent
> reasoning in some configurations, but performance gains vary by model and
> reasoning effort and must be measured rather than assumed.

It does not support claims that Gunk Buster automatically makes every task
faster, lowers every token category, or improves answer quality. The benchmark
has no factual-quality rubric, the open-ended prompt permits different
exploration paths, cached-token behavior dominates some runs, and service load
and filesystem warming remain uncontrolled. A stronger follow-up would use
randomized or interleaved conditions, 5–10 runs per cell, and a fixed factual
answer-quality checklist.
