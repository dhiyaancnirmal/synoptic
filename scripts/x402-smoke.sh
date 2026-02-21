#!/usr/bin/env bash
set -euo pipefail

: "${AGENT_URL:?set AGENT_URL}"
: "${FACILITATOR_URL:?set FACILITATOR_URL}"
: "${X_PAYMENT:?set X_PAYMENT}"

X_PAYMENT_VERIFY="${X_PAYMENT_VERIFY:-$X_PAYMENT}"
X_PAYMENT_SETTLE="${X_PAYMENT_SETTLE:-$X_PAYMENT}"
X_PAYMENT_E2E="${X_PAYMENT_E2E:-$X_PAYMENT}"

TMP_DIR="${TMP_DIR:-/tmp}"
CHALLENGE_FILE="$TMP_DIR/synoptic-402.json"
ENVELOPE_VERIFY_FILE="$TMP_DIR/synoptic-envelope-verify.json"
ENVELOPE_SETTLE_FILE="$TMP_DIR/synoptic-envelope-settle.json"

printf '==> Challenge request\n'
curl -sS "$AGENT_URL/oracle/price?pair=ETH/USDT" | tee "$CHALLENGE_FILE"
REQ_ID="$(jq -r '.paymentRequestId // empty' "$CHALLENGE_FILE")"
if [[ -z "$REQ_ID" ]]; then
  echo "Failed to read paymentRequestId from challenge" >&2
  exit 1
fi

printf '\n==> Build verify envelope\n'
node "$(dirname "$0")/x402-build-envelope.mjs" \
  --challenge-file "$CHALLENGE_FILE" \
  --x-payment "$X_PAYMENT_VERIFY" > "$ENVELOPE_VERIFY_FILE"

printf '\n==> POST /v2/verify\n'
curl -sS -X POST "$FACILITATOR_URL/v2/verify" \
  -H 'content-type: application/json' \
  --data-binary @"$ENVELOPE_VERIFY_FILE"
printf '\n'

printf '\n==> Build settle envelope\n'
node "$(dirname "$0")/x402-build-envelope.mjs" \
  --challenge-file "$CHALLENGE_FILE" \
  --x-payment "$X_PAYMENT_SETTLE" > "$ENVELOPE_SETTLE_FILE"

printf '\n==> POST /v2/settle\n'
curl -sS -X POST "$FACILITATOR_URL/v2/settle" \
  -H 'content-type: application/json' \
  --data-binary @"$ENVELOPE_SETTLE_FILE"
printf '\n'

printf '\n==> Paid endpoint retry (backend-managed verify/settle)\n'
curl -sS "$AGENT_URL/oracle/price?pair=ETH/USDT" \
  -H "x-payment: $X_PAYMENT_E2E" \
  -H "x-payment-request-id: $REQ_ID"
printf '\n'
