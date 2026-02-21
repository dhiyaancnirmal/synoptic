#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HEALTH_URL="${SYNOPTIC_AGENT_HEALTH_URL:-${AGENT_SERVER_URL:-http://localhost:3001}/health}"

print_section() {
  echo
  echo "== $1 =="
}

safe_run() {
  local description="$1"
  shift
  if "$@" >/tmp/synoptic-check.out 2>/tmp/synoptic-check.err; then
    echo "[ok] ${description}"
    cat /tmp/synoptic-check.out
  else
    echo "[warn] ${description}"
    cat /tmp/synoptic-check.out
    cat /tmp/synoptic-check.err
  fi
  rm -f /tmp/synoptic-check.out /tmp/synoptic-check.err
}

cd "$ROOT_DIR"

print_section "Railway"
if command -v railway >/dev/null 2>&1; then
  safe_run "railway status" railway status
else
  echo "[warn] railway CLI not installed"
fi

print_section "Agent Health"
if command -v curl >/dev/null 2>&1; then
  echo "[info] checking ${HEALTH_URL}"
  if curl --silent --show-error --fail --max-time 10 "${HEALTH_URL}" >/tmp/synoptic-health.json; then
    echo "[ok] agent health endpoint reachable"
    cat /tmp/synoptic-health.json
    rm -f /tmp/synoptic-health.json
  else
    echo "[warn] failed to reach ${HEALTH_URL}"
  fi
else
  echo "[warn] curl not installed"
fi

print_section "Vercel"
if command -v vercel >/dev/null 2>&1; then
  if vercel list --yes --format json >/tmp/synoptic-vercel-list.txt 2>/tmp/synoptic-vercel-list.err; then
    echo "[ok] fetched deployment list"
    awk 'BEGIN{found=0} /^\{/ {found=1} found{print}' /tmp/synoptic-vercel-list.txt >/tmp/synoptic-vercel-list.clean.json

    node -e '
      const fs = require("fs");
      const payload = JSON.parse(fs.readFileSync("/tmp/synoptic-vercel-list.clean.json", "utf8"));
      const deployments = (payload.deployments || []).slice(0, 5);
      for (const item of deployments) {
        console.log(`- ${item.url} | ${item.state} | ${item.target ?? "preview"} | ${new Date(item.createdAt).toISOString()}`);
      }
    ' 2>/dev/null || true

    latest_summary="$(
      node -e '
        const fs = require("fs");
        const text = fs.readFileSync("/tmp/synoptic-vercel-list.clean.json", "utf8").trim();
        const payload = JSON.parse(text);
        const latest = payload.deployments?.[0];
        if (!latest) process.exit(0);
        console.log(`${latest.url} | ${latest.state} | ${latest.target ?? "preview"} | ${new Date(latest.createdAt).toISOString()}`);
      ' 2>/dev/null || true
    )"

    failed_url="$(
      node -e '
        const fs = require("fs");
        const text = fs.readFileSync("/tmp/synoptic-vercel-list.clean.json", "utf8").trim();
        const payload = JSON.parse(text);
        const failed = (payload.deployments || []).find((item) => item.state === "ERROR");
        if (failed?.url) console.log(`https://${failed.url}`);
      ' 2>/dev/null || true
    )"

    if [[ -n "${latest_summary}" ]]; then
      echo
      echo "[info] latest deployment: ${latest_summary}"
    fi

    if [[ -n "${failed_url}" ]]; then
      echo
      echo "[warn] latest failed deployment: ${failed_url}"
      echo "[info] inspecting failed deployment logs"
      vercel inspect "${failed_url}" --logs >/tmp/synoptic-vercel-inspect.txt 2>/tmp/synoptic-vercel-inspect.err || true
      failure_reason="$(
        {
          grep -E 'Error:' /tmp/synoptic-vercel-inspect.txt || true
          grep -E 'Error:' /tmp/synoptic-vercel-inspect.err || true
        } | tail -n 1
      )"
      if [[ -n "${failure_reason}" ]]; then
        echo "[warn] last failed reason: ${failure_reason}"
      else
        echo "[warn] failed deployment found, but no explicit Error: line detected"
      fi
      tail -n 20 /tmp/synoptic-vercel-inspect.txt || true
      tail -n 20 /tmp/synoptic-vercel-inspect.err || true
    else
      echo "[ok] no recent failed deployment detected in current list"
    fi
  else
    echo "[warn] could not fetch Vercel deployments"
    cat /tmp/synoptic-vercel-list.err
  fi
  rm -f /tmp/synoptic-vercel-list.txt /tmp/synoptic-vercel-list.err /tmp/synoptic-vercel-list.clean.json /tmp/synoptic-vercel-inspect.txt /tmp/synoptic-vercel-inspect.err
else
  echo "[warn] vercel CLI not installed"
fi
