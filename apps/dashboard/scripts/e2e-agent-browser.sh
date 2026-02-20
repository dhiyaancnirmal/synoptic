#!/usr/bin/env bash
set -euo pipefail

FRONTEND_PORT="${FRONTEND_PORT:-3000}"
BACKEND_PORT="${BACKEND_PORT:-3001}"
BASE_URL="${BASE_URL:-http://127.0.0.1:${FRONTEND_PORT}}"
API_URL="${API_URL:-http://127.0.0.1:${BACKEND_PORT}}"
EXPECT_RUNNING_SERVERS="${EXPECT_RUNNING_SERVERS:-0}"

is_listening() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1
    return $?
  fi

  if command -v nc >/dev/null 2>&1; then
    nc -z 127.0.0.1 "${port}" >/dev/null 2>&1
    return $?
  fi

  return 1
}

if [[ "${EXPECT_RUNNING_SERVERS}" == "1" ]]; then
  if ! is_listening "${FRONTEND_PORT}"; then
    echo "Expected frontend on port ${FRONTEND_PORT}, but no process is listening."
    exit 1
  fi

  if ! is_listening "${BACKEND_PORT}"; then
    echo "Expected backend on port ${BACKEND_PORT}, but no process is listening."
    exit 1
  fi
else
  if is_listening "${FRONTEND_PORT}" || is_listening "${BACKEND_PORT}"; then
    echo "Refusing to run: required ports are already in use (frontend:${FRONTEND_PORT}, backend:${BACKEND_PORT})."
    echo "Use different FRONTEND_PORT/BACKEND_PORT or rerun with EXPECT_RUNNING_SERVERS=1 if this is intentional."
    exit 1
  fi

  echo "No servers detected. Start frontend/backend and rerun with EXPECT_RUNNING_SERVERS=1."
  exit 1
fi

health_code="$(curl --connect-timeout 3 --max-time 10 -s -o /dev/null -w '%{http_code}' "${API_URL}/health")"
if [[ "${health_code}" != "200" ]]; then
  echo "Backend health check failed: ${API_URL}/health returned ${health_code}"
  exit 1
fi

root_code="$(curl --connect-timeout 3 --max-time 10 -s -o /dev/null -w '%{http_code}' "${BASE_URL}/")"
if [[ "${root_code}" -lt 200 || "${root_code}" -ge 400 ]]; then
  echo "Frontend route check failed: ${BASE_URL}/ returned ${root_code}"
  exit 1
fi

bootstrap_token="$(node -e '
const crypto = require("node:crypto");
const secret = process.env.AUTH_TOKEN_SECRET || "synoptic-prod-secret";
const ownerAddress = "0x000000000000000000000000000000000000dEaD";
const agentId = "bootstrap-agent";
const now = Math.floor(Date.now() / 1000);
const claims = {
  sub: ownerAddress,
  agentId,
  ownerAddress,
  authMode: "passport",
  iat: now,
  exp: now + 3600
};
const header = { alg: "HS256", typ: "JWT" };
const encodedHeader = Buffer.from(JSON.stringify(header), "utf8").toString("base64url");
const encodedPayload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
const signed = `${encodedHeader}.${encodedPayload}`;
const sig = crypto.createHmac("sha256", secret).update(signed).digest("base64url");
process.stdout.write(`${signed}.${sig}`);
')"

canonical_agents_payload="$(curl -sS -H "authorization: Bearer ${bootstrap_token}" "${API_URL}/api/agents")"
agent_id="$(echo "${canonical_agents_payload}" | node -e 'let raw=""; process.stdin.on("data", d => raw += d); process.stdin.on("end", () => { const parsed = JSON.parse(raw); const first = parsed?.data?.agents?.[0]?.id ?? parsed?.data?.agents?.[0]?.agentId ?? parsed?.agents?.[0]?.id ?? parsed?.agents?.[0]?.agentId; if (!first) process.exit(1); process.stdout.write(String(first)); });')"
if [[ -z "${agent_id}" ]]; then
  echo "Could not resolve canonical agent id from ${API_URL}/api/agents"
  exit 1
fi

agent_name="$(echo "${canonical_agents_payload}" | node -e 'let raw=""; process.stdin.on("data", d => raw += d); process.stdin.on("end", () => { const parsed = JSON.parse(raw); const first = parsed?.data?.agents?.[0]?.name ?? parsed?.agents?.[0]?.name; if (!first) process.exit(1); process.stdout.write(String(first)); });')"
if [[ -z "${agent_name}" ]]; then
  echo "Could not resolve canonical agent name from ${API_URL}/api/agents"
  exit 1
fi

curl -sS -X POST -H "authorization: Bearer ${bootstrap_token}" "${API_URL}/api/agents/${agent_id}/trigger" >/dev/null

AB=(agent-browser)
if ! command -v agent-browser >/dev/null 2>&1; then
  AB=(pnpm exec agent-browser)
fi

if ! "${AB[@]}" --help >/dev/null 2>&1; then
  echo "agent-browser is required for UI assertions but was not found."
  exit 1
fi

if [[ -z "${bootstrap_token}" ]]; then
  echo "Could not bootstrap deterministic auth token for dashboard e2e."
  exit 1
fi

bootstrap_dashboard_session() {
  "${AB[@]}" open "${BASE_URL}/login"
  "${AB[@]}" wait --load networkidle
  "${AB[@]}" find label "manual bearer token" fill "${bootstrap_token}"
  "${AB[@]}" find role button click --name "save token"
  "${AB[@]}" wait --load networkidle

  local text
  text="$("${AB[@]}" get text body)"
  if ! echo "${text}" | grep -Fq "Session token saved for this browser session."; then
    echo "Dashboard session bootstrap via /login failed."
    exit 1
  fi
}

assert_page_contains() {
  local route="$1"
  local expected="$2"

  "${AB[@]}" open "${BASE_URL}${route}"
  "${AB[@]}" wait --load networkidle
  local text
  text="$("${AB[@]}" get text body)"

  if echo "${text}" | grep -Fq "Session required"; then
    echo "Auth gate detected on ${route}; dashboard session bootstrap failed."
    exit 1
  fi

  if ! echo "${text}" | grep -Fq "${expected}"; then
    echo "Missing expected text on ${route}: ${expected}"
    exit 1
  fi
}

bootstrap_dashboard_session

assert_page_contains "/agents" "Registry"
"${AB[@]}" open "${BASE_URL}/payments"
"${AB[@]}" wait --load networkidle
assert_page_contains "/payments" "Oracle Challenge / Retry"

assert_page_contains "/trading" "Trade Timeline"

assert_page_contains "/activity" "Timeline"

echo "dashboard e2e passed"
