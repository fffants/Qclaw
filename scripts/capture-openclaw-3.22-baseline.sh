#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

exec bash "$REPO_ROOT/local-tools/ralph/missions/openclaw-3.22/capture-baseline.sh" "$@"
