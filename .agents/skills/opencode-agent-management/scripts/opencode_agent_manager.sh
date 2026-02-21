#!/usr/bin/env bash
set -euo pipefail

PORT_DEFAULT="${OPENCODE_PORT:-4096}"
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/codex-opencode-agent-manager"
mkdir -p "$STATE_DIR"

usage() {
  cat <<'USAGE'
Usage:
  opencode_agent_manager.sh serve-start [port]
  opencode_agent_manager.sh serve-stop [port]
  opencode_agent_manager.sh serve-status [port]
  opencode_agent_manager.sh run [opencode-run-args...]
  opencode_agent_manager.sh run-attached [opencode-run-args...]
  opencode_agent_manager.sh session-list [extra-args...]
  opencode_agent_manager.sh stats [extra-args...]
  opencode_agent_manager.sh export <session-id> [output-file]

Examples:
  opencode_agent_manager.sh serve-start 4096
  opencode_agent_manager.sh run "Write tests for utils.ts" --agent tester --model openai/gpt-4.1 --title "Utils tests"
  opencode_agent_manager.sh session-list --format json
  opencode_agent_manager.sh stats --days 7 --models
USAGE
}

require_opencode() {
  if ! command -v opencode >/dev/null 2>&1; then
    echo "error: opencode is not installed or not on PATH" >&2
    exit 1
  fi
}

is_listening() {
  local port="$1"
  lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
}

serve_start() {
  local port="$1"
  local pid_file="$STATE_DIR/opencode-serve-${port}.pid"
  local log_file="$STATE_DIR/opencode-serve-${port}.log"

  if is_listening "$port"; then
    echo "opencode serve already listening on port $port"
    return 0
  fi

  nohup opencode serve --hostname 127.0.0.1 --port "$port" < /dev/null >"$log_file" 2>&1 &
  local pid=$!
  echo "$pid" >"$pid_file"

  sleep 1
  if is_listening "$port"; then
    echo "started opencode serve on http://127.0.0.1:$port (pid $pid)"
  else
    echo "failed to start opencode serve; check $log_file" >&2
    exit 1
  fi
}

serve_stop() {
  local port="$1"
  local pid_file="$STATE_DIR/opencode-serve-${port}.pid"

  if [[ -f "$pid_file" ]]; then
    local pid
    pid="$(cat "$pid_file")"
    if kill -0 "$pid" >/dev/null 2>&1; then
      kill "$pid" || true
      sleep 1
    fi
    rm -f "$pid_file"
  fi

  local pids
  pids="$(lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    # shellcheck disable=SC2086
    kill $pids || true
    sleep 1
  fi

  if is_listening "$port"; then
    echo "failed to stop opencode serve on port $port" >&2
    exit 1
  fi

  echo "stopped opencode serve on port $port"
}

serve_status() {
  local port="$1"
  local pid_file="$STATE_DIR/opencode-serve-${port}.pid"
  if is_listening "$port"; then
    local pid_info="unknown"
    if [[ -f "$pid_file" ]]; then
      pid_info="$(cat "$pid_file")"
    fi
    echo "running on http://127.0.0.1:$port (pid $pid_info)"
  else
    echo "not running on port $port"
    return 1
  fi
}

run_task() {
  local has_format=0
  local has_dir=0
  local args=("$@")

  local i
  for ((i = 0; i < ${#args[@]}; i++)); do
    case "${args[$i]}" in
      --attach)
        i=$((i + 1))
        ;;
      --format)
        has_format=1
        i=$((i + 1))
        ;;
      --dir)
        has_dir=1
        i=$((i + 1))
        ;;
    esac
  done

  if [[ "$has_format" -eq 0 ]]; then
    args+=(--format json)
  fi

  if [[ "$has_dir" -eq 0 ]]; then
    args+=(--dir "$PWD")
  fi

  exec opencode run "${args[@]}"
}

run_task_attached() {
  local port="$PORT_DEFAULT"
  local attach_url="http://127.0.0.1:${port}"
  local has_attach=0
  local has_format=0
  local has_dir=0
  local args=("$@")

  local i
  for ((i = 0; i < ${#args[@]}; i++)); do
    case "${args[$i]}" in
      --attach)
        has_attach=1
        i=$((i + 1))
        ;;
      --format)
        has_format=1
        i=$((i + 1))
        ;;
      --dir)
        has_dir=1
        i=$((i + 1))
        ;;
    esac
  done

  if [[ "$has_attach" -eq 0 ]]; then
    args+=(--attach "$attach_url")
  fi

  if [[ "$has_format" -eq 0 ]]; then
    args+=(--format json)
  fi

  if [[ "$has_dir" -eq 0 ]]; then
    args+=(--dir "$PWD")
  fi

  exec opencode run "${args[@]}"
}

main() {
  require_opencode

  local cmd="${1:-}"
  if [[ -z "$cmd" ]]; then
    usage
    exit 1
  fi
  shift || true

  case "$cmd" in
    serve-start)
      serve_start "${1:-$PORT_DEFAULT}"
      ;;
    serve-stop)
      serve_stop "${1:-$PORT_DEFAULT}"
      ;;
    serve-status)
      serve_status "${1:-$PORT_DEFAULT}"
      ;;
    run)
      run_task "$@"
      ;;
    run-attached)
      run_task_attached "$@"
      ;;
    session-list)
      exec opencode session list "$@"
      ;;
    stats)
      exec opencode stats "$@"
      ;;
    export)
      local session_id="${1:-}"
      if [[ -z "$session_id" ]]; then
        echo "error: missing session id" >&2
        usage
        exit 1
      fi
      if [[ -n "${2:-}" ]]; then
        exec opencode export "$session_id" >"$2"
      fi
      exec opencode export "$session_id"
      ;;
    *)
      usage
      exit 1
      ;;
  esac
}

main "$@"
