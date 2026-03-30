#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

usage() {
  cat >&2 <<'EOF'
Usage:
  bash scripts/run-codex-guarded-task.sh \
    --task-file <path> \
    --output-file <path> \
    --status-file <path> \
    [--expect-gate <GATE>] \
    [--timeout-seconds <N>] \
    [--max-attempts <N>] \
    [--label <name>] \
    [--allow-blocking-gate] \
    [--force]
EOF
  exit 1
}

TASK_FILE=""
OUTPUT_FILE=""
STATUS_FILE=""
EXPECT_GATE=""
TIMEOUT_SECONDS=3600
MAX_ATTEMPTS=3
LABEL=""
FORCE=0
ALLOW_BLOCKING_GATE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --task-file)
      TASK_FILE="${2:-}"
      shift 2
      ;;
    --output-file)
      OUTPUT_FILE="${2:-}"
      shift 2
      ;;
    --status-file)
      STATUS_FILE="${2:-}"
      shift 2
      ;;
    --expect-gate)
      EXPECT_GATE="${2:-}"
      shift 2
      ;;
    --timeout-seconds)
      TIMEOUT_SECONDS="${2:-}"
      shift 2
      ;;
    --max-attempts)
      MAX_ATTEMPTS="${2:-}"
      shift 2
      ;;
    --label)
      LABEL="${2:-}"
      shift 2
      ;;
    --force)
      FORCE=1
      shift
      ;;
    --allow-blocking-gate)
      ALLOW_BLOCKING_GATE=1
      shift
      ;;
    *)
      usage
      ;;
  esac
done

[[ -n "$TASK_FILE" && -n "$OUTPUT_FILE" && -n "$STATUS_FILE" ]] || usage
[[ -f "$TASK_FILE" ]] || { echo "Task file not found: $TASK_FILE" >&2; exit 1; }

if ! [[ "$TIMEOUT_SECONDS" =~ ^[0-9]+$ ]] || ! [[ "$MAX_ATTEMPTS" =~ ^[0-9]+$ ]]; then
  echo "timeout-seconds and max-attempts must be integers" >&2
  exit 1
fi

if [[ -z "$LABEL" ]]; then
  LABEL="$(basename "$TASK_FILE" .md)"
fi

OUTPUT_DIR="$(cd "$(dirname "$OUTPUT_FILE")" && pwd)"
STATUS_DIR="$(cd "$(dirname "$STATUS_FILE")" && pwd)"
ATTEMPT_DIR="$OUTPUT_DIR/attempts"
LOCK_DIR="$STATUS_FILE.lock"
PID_FILE="$LOCK_DIR/pid"
NORMALIZER_SCRIPT="$REPO_ROOT/scripts/normalize-codex-task-report.mjs"

mkdir -p "$OUTPUT_DIR" "$STATUS_DIR" "$ATTEMPT_DIR"

timestamp() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

write_status() {
  local state="$1"
  local attempt="$2"
  local detail="${3:-}"
  local gate="${4:-}"
  local severity="${5:-}"
  cat > "$STATUS_FILE" <<EOF
LABEL=$LABEL
STATE=$state
ATTEMPT=$attempt
UPDATED_AT=$(timestamp)
EXPECT_GATE=${EXPECT_GATE:-NONE}
DETAIL=${detail:-}
FINAL_GATE=${gate:-}
HIGHEST_OPEN_SEVERITY=${severity:-}
OUTPUT_FILE=$OUTPUT_FILE
TASK_FILE=$TASK_FILE
EOF
}

read_status_field() {
  local key="$1"
  [[ -f "$STATUS_FILE" ]] || return 1
  awk -F= -v search_key="$key" '$1 == search_key { print substr($0, index($0, "=") + 1) }' "$STATUS_FILE" | tail -n 1
}

extract_first_match() {
  local pattern="$1"
  local file_path="$2"
  [[ -s "$file_path" ]] || return 1
  grep -E "$pattern" "$file_path" | tail -n 1 | sed 's/^[^:]*: //'
}

status_is_successful() {
  local state
  state="$(read_status_field "STATE" || true)"
  [[ "$state" == "SUCCEEDED" ]] || return 1
  [[ -s "$OUTPUT_FILE" ]] || return 1

  local status_severity
  status_severity="$(read_status_field "HIGHEST_OPEN_SEVERITY" || true)"
  if [[ "$status_severity" =~ ^(P0|P1)$ ]]; then
    return 1
  fi

  if grep -Eq '^HIGHEST_OPEN_SEVERITY: (P0|P1)$' "$OUTPUT_FILE"; then
    return 1
  fi

  if [[ -n "$EXPECT_GATE" ]]; then
    grep -Eq "^FINAL_GATE: ${EXPECT_GATE}$" "$OUTPUT_FILE"
  else
    return 0
  fi
}

acquire_lock() {
  if mkdir "$LOCK_DIR" 2>/dev/null; then
    printf '%s\n' "$$" > "$PID_FILE"
    return 0
  fi

  if [[ -f "$PID_FILE" ]]; then
    local existing_pid
    existing_pid="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [[ -n "$existing_pid" ]] && kill -0 "$existing_pid" 2>/dev/null; then
      echo "Task is already running for $LABEL (pid $existing_pid)" >&2
      exit 1
    fi
  fi

  rm -rf "$LOCK_DIR"
  mkdir "$LOCK_DIR"
  printf '%s\n' "$$" > "$PID_FILE"
}

cleanup_lock() {
  rm -rf "$LOCK_DIR"
}

build_attempt_task_file() {
  local attempt="$1"
  local destination_file="$2"
  local allowed_gate_line=""

  if [[ -n "$EXPECT_GATE" ]]; then
    allowed_gate_line="Allowed FINAL_GATE values: $EXPECT_GATE"
    if [[ "$ALLOW_BLOCKING_GATE" -eq 1 ]]; then
      allowed_gate_line="$allowed_gate_line or BLOCK"
    fi
  fi

  {
    printf '%s\n\n' "# Result contract"
    printf '%s\n' "You must keep all conclusions evidence-based and consistent with the real code and test results."
    if [[ "$attempt" -gt 1 ]]; then
      printf '%s\n' "The previous attempt did not satisfy the machine-readable result contract."
    fi
    printf '%s\n' "At the very end of your output, append exact plain-text lines, each on its own line, without backticks or markdown formatting."
    printf '%s\n' "Required footer:"
    printf '%s\n' "FINAL_GATE: <actual result or BLOCK when blocked>"
    printf '%s\n' "HIGHEST_OPEN_SEVERITY: <NONE|P0|P1|P2|P3 when relevant>"
    if [[ -n "$allowed_gate_line" ]]; then
      printf '%s\n' "$allowed_gate_line"
    fi
    printf '\n'
    cat "$TASK_FILE"
  } > "$destination_file"
}

trap cleanup_lock EXIT

if [[ "$FORCE" -eq 0 ]] && status_is_successful; then
  echo "Skipping $LABEL: already succeeded." >&2
  exit 0
fi

acquire_lock

ATTEMPT=1
while [[ "$ATTEMPT" -le "$MAX_ATTEMPTS" ]]; do
  ATTEMPT_OUTPUT="$ATTEMPT_DIR/${LABEL}.attempt-${ATTEMPT}.md"
  rm -f "$ATTEMPT_OUTPUT"

  write_status "RUNNING" "$ATTEMPT" "starting"

  TASK_FILE_FOR_ATTEMPT="$TASK_FILE"
  TEMP_TASK_FILE=""
  if [[ -n "$EXPECT_GATE" ]]; then
    TEMP_TASK_FILE="$(mktemp "${TMPDIR:-/tmp}/codex-task-${LABEL}.XXXXXX.md")"
    build_attempt_task_file "$ATTEMPT" "$TEMP_TASK_FILE"
    TASK_FILE_FOR_ATTEMPT="$TEMP_TASK_FILE"
  fi

  bash "$REPO_ROOT/scripts/run-codex-worker.sh" "$TASK_FILE_FOR_ATTEMPT" -o "$ATTEMPT_OUTPUT" &
  CHILD_PID=$!
  START_TIME="$(date +%s)"
  TIMED_OUT=0

  while kill -0 "$CHILD_PID" 2>/dev/null; do
    NOW="$(date +%s)"
    if (( NOW - START_TIME >= TIMEOUT_SECONDS )); then
      TIMED_OUT=1
      kill -TERM "$CHILD_PID" 2>/dev/null || true
      sleep 2
      kill -KILL "$CHILD_PID" 2>/dev/null || true
      break
    fi
    sleep 5
  done

  if wait "$CHILD_PID"; then
    EXIT_CODE=0
  else
    EXIT_CODE=$?
  fi

  if [[ -n "$TEMP_TASK_FILE" && -f "$TEMP_TASK_FILE" ]]; then
    rm -f "$TEMP_TASK_FILE"
  fi

  [[ -f "$ATTEMPT_OUTPUT" ]] && cp "$ATTEMPT_OUTPUT" "$OUTPUT_FILE"

  if [[ -f "$NORMALIZER_SCRIPT" && -f "$OUTPUT_FILE" ]]; then
    NORMALIZER_OUTPUT="$(node "$NORMALIZER_SCRIPT" --file "$OUTPUT_FILE" --label "$LABEL" --expect-gate "$EXPECT_GATE" 2>/dev/null || true)"
  else
    NORMALIZER_OUTPUT=""
  fi

  FINAL_GATE_VALUE="$(extract_first_match '^FINAL_GATE: ' "$OUTPUT_FILE" || true)"
  HIGHEST_SEVERITY_VALUE="$(extract_first_match '^HIGHEST_OPEN_SEVERITY: ' "$OUTPUT_FILE" || true)"

  if [[ "$TIMED_OUT" -eq 1 ]]; then
    write_status "TIMED_OUT" "$ATTEMPT" "task exceeded ${TIMEOUT_SECONDS}s" "$FINAL_GATE_VALUE" "$HIGHEST_SEVERITY_VALUE"
  elif [[ "$EXIT_CODE" -ne 0 ]]; then
    write_status "FAILED" "$ATTEMPT" "worker exited with code $EXIT_CODE" "$FINAL_GATE_VALUE" "$HIGHEST_SEVERITY_VALUE"
  elif [[ -n "$EXPECT_GATE" && "$FINAL_GATE_VALUE" != "$EXPECT_GATE" ]]; then
    if [[ -n "$FINAL_GATE_VALUE" ]]; then
      write_status "BLOCKED" "$ATTEMPT" "unexpected final gate" "$FINAL_GATE_VALUE" "$HIGHEST_SEVERITY_VALUE"
      if [[ "$ALLOW_BLOCKING_GATE" -eq 1 ]]; then
        exit 0
      fi
      exit 1
    fi
    write_status "FAILED_FORMAT" "$ATTEMPT" "missing expected FINAL_GATE" "$FINAL_GATE_VALUE" "$HIGHEST_SEVERITY_VALUE"
  else
    write_status "SUCCEEDED" "$ATTEMPT" "task completed" "$FINAL_GATE_VALUE" "$HIGHEST_SEVERITY_VALUE"
    exit 0
  fi

  if [[ "$ATTEMPT" -ge "$MAX_ATTEMPTS" ]]; then
    exit 1
  fi

  ATTEMPT=$((ATTEMPT + 1))
  sleep $((ATTEMPT * 3))
done

exit 1
