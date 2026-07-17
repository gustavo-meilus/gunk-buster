#!/usr/bin/env bash
set -euo pipefail

prompt='Explain all that this repository contains, including its purpose, important documentation, agent instructions, available commands, and any concerns you would want resolved before making a change.'

usage() {
  cat <<'EOF'
Usage: context-benchmark.sh <pre|post> --repo PATH --model MODEL [--reasoning EFFORT] [--output DIR] [--codex PATH]

Runs the fixed Context Benchmark prompt in a fresh ephemeral Codex session.
Use exactly the same --model and --reasoning for the pre and post runs.
Artifacts are written outside the target repository by default.
Use --codex when the Codex executable is not available on PATH.
EOF
}

phase="${1:-}"
[[ "$phase" == pre || "$phase" == post ]] || { usage >&2; exit 2; }
shift

repo=""
model=""
reasoning="high"
codex_bin=""
output_root="${XDG_STATE_HOME:-$HOME/.local/state}/gunk-buster/benchmarks"
while (($#)); do
  case "$1" in
    --repo) repo="${2:?missing --repo value}"; shift 2 ;;
    --model) model="${2:?missing --model value}"; shift 2 ;;
    --reasoning) reasoning="${2:?missing --reasoning value}"; shift 2 ;;
    --output) output_root="${2:?missing --output value}"; shift 2 ;;
    --codex) codex_bin="${2:?missing --codex value}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

[[ -n "$repo" && -d "$repo" ]] || { echo "--repo must name an existing directory" >&2; exit 2; }
[[ -n "$model" ]] || { echo "--model is required; use the exact model slug shown by Codex" >&2; exit 2; }
if [[ -z "$codex_bin" ]]; then
  codex_bin="$(command -v codex 2>/dev/null || true)"
fi
if [[ -z "$codex_bin" ]]; then
  codex_bin="$(command -v codex.exe 2>/dev/null || true)"
fi
if [[ -z "$codex_bin" && -x "$HOME/.local/bin/codex" ]]; then
  codex_bin="$HOME/.local/bin/codex"
fi
[[ -n "$codex_bin" && -x "$codex_bin" ]] || {
  echo "codex is not executable; add it to PATH or pass --codex PATH" >&2
  exit 127
}
command -v python3 >/dev/null || { echo "python3 is required to summarize Codex JSONL output" >&2; exit 127; }

# A post-plugin run is only valid if Codex can actually start the plugin's MCP
# server, which it launches as `node ./dist/mcp.js`. Codex passes this shell's
# environment to that subprocess, so an unresolvable `node` yields a session
# with no gunk tools -- a run that looks successful but silently measures the
# pre-plugin condition. NVM only initializes in interactive shells, so a login
# shell (`bash -lc`) fails this check unless NVM is sourced first.
if [[ "$phase" == post ]] && ! command -v node >/dev/null; then
  if [[ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]]; then
    # shellcheck disable=SC1091
    . "${NVM_DIR:-$HOME/.nvm}/nvm.sh" >/dev/null 2>&1 || true
  fi
fi
if [[ "$phase" == post ]] && ! command -v node >/dev/null; then
  cat >&2 <<'EOF'
INVALID: node does not resolve in this shell, so Codex cannot launch the plugin
MCP server and the session would expose no gunk tools. The run would appear to
succeed while actually measuring the pre-plugin condition.
Put node on PATH before the post run, for example:
  export PATH="$HOME/.nvm/versions/node/<version>/bin:$PATH"
EOF
  exit 4
fi

repo="$(cd "$repo" && pwd -P)"
repo_name="$(basename "$repo")"
run_id="$(date -u +%Y%m%dT%H%M%SZ)-$phase"
run_dir="$output_root/$repo_name/$run_id"
mkdir -p "$run_dir"

git_safe=(git -c "safe.directory=$repo" -C "$repo")
"${git_safe[@]}" status --porcelain=v1 --untracked-files=all > "$run_dir/status-before.txt"
"${git_safe[@]}" rev-parse HEAD > "$run_dir/commit.txt"
"$codex_bin" --version > "$run_dir/codex-version.txt"
printf '%s\n' "$prompt" > "$run_dir/prompt.txt"

start_ns="$(date +%s%N)"
set +e
"$codex_bin" exec --ephemeral --json -s read-only -C "$repo" \
  -m "$model" -c "model_reasoning_effort=\"$reasoning\"" \
  "$prompt" </dev/null > "$run_dir/events.jsonl" 2> "$run_dir/stderr.txt"
codex_status=$?
set -e
end_ns="$(date +%s%N)"

"${git_safe[@]}" status --porcelain=v1 --untracked-files=all > "$run_dir/status-after.txt"
if ! cmp -s "$run_dir/status-before.txt" "$run_dir/status-after.txt"; then
  echo "INVALID: Codex changed the target worktree during the benchmark." >&2
  diff -u "$run_dir/status-before.txt" "$run_dir/status-after.txt" || true
  exit 3
fi

python3 - "$run_dir" "$phase" "$model" "$reasoning" "$start_ns" "$end_ns" "$codex_status" <<'PY'
import json, pathlib, sys

run_dir = pathlib.Path(sys.argv[1])
phase, model, reasoning = sys.argv[2:5]
elapsed = (int(sys.argv[6]) - int(sys.argv[5])) / 1_000_000_000
exit_code = int(sys.argv[7])
usage = {}
session = None
final = None
for raw in (run_dir / "events.jsonl").read_text(encoding="utf-8").splitlines():
    event = json.loads(raw)
    if event.get("type") == "thread.started": session = event.get("thread_id")
    if event.get("type") == "turn.completed": usage = event.get("usage", {})
    item = event.get("item", {})
    if event.get("type") == "item.completed" and item.get("type") == "agent_message":
        final = item.get("text")
summary = {
    "phase": phase, "model": model, "reasoning": reasoning,
    "wallClockSeconds": round(elapsed, 3), "codexExitCode": exit_code,
    "session": session, "usage": usage,
    "worktreeUnchanged": True,
}
(run_dir / "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
if final is not None: (run_dir / "answer.md").write_text(final + "\n", encoding="utf-8")
print(json.dumps(summary, indent=2))
PY

echo "Artifacts: $run_dir"
((codex_status == 0)) || exit "$codex_status"
