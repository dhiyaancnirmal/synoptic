#!/usr/bin/env bash
set -euo pipefail

EXPECTED_NODE="22.21.1"
EXPECTED_NODE_RAW="v${EXPECTED_NODE}"
NOW_UTC="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_DIR="${OUT_DIR:-artifacts/evidence/p0-p1/${NOW_UTC}}"
EXPECT_RUNNING_SERVERS="${EXPECT_RUNNING_SERVERS:-0}"

mkdir -p "${OUT_DIR}"

run_step() {
  local name="$1"
  shift
  local logfile="${OUT_DIR}/${name}.log"

  echo ""
  echo "== ${name} =="
  echo "command: $*"
  "$@" 2>&1 | tee "${logfile}"
}

if [[ "$(node -v)" != "${EXPECTED_NODE_RAW}" ]]; then
  echo "Node.js version mismatch: expected ${EXPECTED_NODE_RAW}, got $(node -v)"
  echo "Use: nvm install ${EXPECTED_NODE} && nvm use ${EXPECTED_NODE}"
  exit 1
fi

run_step "00-check-node" pnpm check:node
run_step "01-backend-guardrails" pnpm guard:backend
run_step "02-uniswap-acceptance-tests" \
  pnpm --filter @synoptic/agent-core test -- --test-name-pattern \
  "Uniswap client uses required headers|Uniswap client validates tx data"
run_step "03-kite-oracle-trade-acceptance-tests" \
  pnpm --filter @synoptic/agent-server test -- --test-name-pattern \
  "oracle route enforces challenge, settles deterministic payment, and persists payment lifecycle|trade routes support list/get"
run_step "04-dashboard-legacy-endpoint-guard" pnpm --filter @synoptic/dashboard test:legacy-routes

if [[ "${EXPECT_RUNNING_SERVERS}" == "1" ]]; then
  run_step "05-dashboard-e2e-agent-browser" bash apps/dashboard/scripts/e2e-agent-browser.sh
else
  cat <<EOF | tee "${OUT_DIR}/05-dashboard-e2e-agent-browser.log"
Skipped dashboard e2e (EXPECT_RUNNING_SERVERS=${EXPECT_RUNNING_SERVERS}).
To run:
  1) Start frontend and backend on ports 3000/3001
  2) EXPECT_RUNNING_SERVERS=1 bash scripts/p0-p1-evidence-harness.sh
EOF
fi

cat <<EOF | tee "${OUT_DIR}/SUMMARY.txt"
P0/P1 evidence harness completed.
Output directory: ${OUT_DIR}
Expected pass markers:
- backend guardrails: pass
- Uniswap client uses required headers on check_approval, quote, and swap
- Uniswap client validates tx data in /check_approval and /swap responses
- oracle route enforces challenge, settles deterministic payment, and persists payment lifecycle
- trade routes support list/get
- No direct legacy endpoint references found in dashboard route/component code.
- dashboard e2e passed (only when EXPECT_RUNNING_SERVERS=1)
EOF
