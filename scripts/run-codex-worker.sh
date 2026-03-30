#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEFAULT_CODEX_BIN="/Applications/Codex.app/Contents/Resources/codex"

if [[ $# -lt 1 ]]; then
  echo "Usage: scripts/run-codex-worker.sh <task-file> [extra codex args...]" >&2
  exit 1
fi

TASK_FILE="$1"
shift || true

if [[ ! -f "$TASK_FILE" ]]; then
  echo "Task file not found: $TASK_FILE" >&2
  exit 1
fi

if command -v codex >/dev/null 2>&1; then
  CODEX_BIN="$(command -v codex)"
elif [[ -x "$DEFAULT_CODEX_BIN" ]]; then
  CODEX_BIN="$DEFAULT_CODEX_BIN"
else
  echo "Codex CLI not found. Checked PATH and $DEFAULT_CODEX_BIN" >&2
  exit 1
fi

"$CODEX_BIN" exec --full-auto -C "$REPO_ROOT" "$@" - < "$TASK_FILE"
