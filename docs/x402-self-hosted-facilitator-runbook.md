# x402 Self-Hosted Facilitator Runbook

## Goal
Run a Kite-compatible self-hosted facilitator and route Synoptic backend x402 verification/settlement through it.

## Canonical Tuple
- `scheme`: `gokite-aa`
- `network`: `kite-testnet`
- `x402Version`: `1`
- Asset: Kite testnet Test USDT `0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63`
- Amount units: atomic (`6` decimals)

## Required Env Vars

### Agent server (`apps/agent-server`)
- `KITE_FACILITATOR_URL=https://<your-facilitator-domain>`
- `KITE_PAYMENT_SCHEME=gokite-aa`
- `KITE_NETWORK=kite-testnet`
- `KITE_TEST_USDT_ADDRESS=0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63`
- `KITE_PAYMENT_ASSET_DECIMALS=6`
- `KITE_SERVICE_PAYTO=<service recipient address>`

### Facilitator service (`apps/x402-facilitator`)
- `FACILITATOR_RPC_URL=https://rpc-testnet.gokite.ai/`
- `FACILITATOR_PRIVATE_KEY=<relayer private key>`
- `FACILITATOR_CANONICAL_SCHEME=gokite-aa`
- `FACILITATOR_CANONICAL_NETWORK=kite-testnet`
- `FACILITATOR_CHAIN_ID=2368`
- Optional: `FACILITATOR_SETTLE_CONFIRMATIONS=1`

## Current Deployment (As Of 2026-02-21)
- Facilitator service domain: `https://x402-facilitator-production-804f.up.railway.app`
- Backend env reference:
  - `KITE_FACILITATOR_URL=https://x402-facilitator-production-804f.up.railway.app`
- Agent server domain: `https://agent-server-production-e47b.up.railway.app`

## Railway Deploy Steps
1. Create service (one-time):
```bash
cd /Users/dhiyaan/Code/synoptic-x402-facilitator
railway add --service x402-facilitator
```
2. Set facilitator env vars (do not commit secrets).
3. Deploy facilitator from app path:
```bash
railway up --service x402-facilitator --path-as-root /Users/dhiyaan/Code/synoptic-x402-facilitator/apps/x402-facilitator
```
4. Get or create facilitator domain:
```bash
railway domain -s x402-facilitator
```
5. Point backend to self-hosted facilitator:
```bash
railway variable set -s agent-server KITE_FACILITATOR_URL=https://<facilitator-domain>
```
6. Restart/redeploy `agent-server` after variable changes:
```bash
railway service restart agent-server
```

## Smoke Tests
Use the helper scripts:

```bash
export AGENT_URL=https://agent-server-production-e47b.up.railway.app
export FACILITATOR_URL=https://<facilitator-domain>
export X_PAYMENT='<token-from-approve_payment>'

node /Users/dhiyaan/Code/synoptic-x402-facilitator/scripts/x402-build-envelope.mjs \
  --challenge-file /tmp/synoptic-402.json \
  --x-payment "$X_PAYMENT" > /tmp/synoptic-envelope.json
```

Or run end-to-end smoke:

```bash
AGENT_URL=https://agent-server-production-e47b.up.railway.app \
FACILITATOR_URL=https://<facilitator-domain> \
X_PAYMENT='<token-from-approve_payment>' \
bash /Users/dhiyaan/Code/synoptic-x402-facilitator/scripts/x402-smoke.sh
```

`X_PAYMENT` must be a real signed payment from Kite MCP `approve_payment` for full verify/settle/e2e success.
For complete smoke runs, use fresh signed tokens per settlement path (or set `X_PAYMENT_VERIFY`, `X_PAYMENT_SETTLE`, `X_PAYMENT_E2E`) because a settled authorization cannot be reused.

### Exact curl flow
```bash
export AGENT_URL=https://agent-server-production-e47b.up.railway.app
export FACILITATOR_URL=https://<facilitator-domain>
export X_PAYMENT='<token-from-approve_payment>'

curl -sS "$AGENT_URL/oracle/price?pair=ETH/USDT" | tee /tmp/synoptic-402.json
REQ_ID=$(jq -r '.paymentRequestId' /tmp/synoptic-402.json)

node /Users/dhiyaan/Code/synoptic-x402-facilitator/scripts/x402-build-envelope.mjs \
  --challenge-file /tmp/synoptic-402.json \
  --x-payment "$X_PAYMENT" > /tmp/synoptic-envelope.json

curl -sS -X POST "$FACILITATOR_URL/v2/verify" \
  -H 'content-type: application/json' \
  --data-binary @/tmp/synoptic-envelope.json

curl -sS -X POST "$FACILITATOR_URL/v2/settle" \
  -H 'content-type: application/json' \
  --data-binary @/tmp/synoptic-envelope.json

curl -sS "$AGENT_URL/oracle/price?pair=ETH/USDT" \
  -H "x-payment: $X_PAYMENT" \
  -H "x-payment-request-id: $REQ_ID"
```

## Failure Debugging
- Verify tuple mismatch:
  - Expected: `gokite-aa + kite-testnet + x402Version=1`
  - Check backend challenge + facilitator request body.
- Amount mismatch:
  - Ensure `maxAmountRequired` is atomic and matches the decimals used by your payment approval path.
  - Note: Kite testnet token metadata for `0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63` currently reports `18` decimals.
- Simulation failure:
  - Inspect facilitator response `details.reason` for contract revert reason.
  - This facilitator settles through payer AA wallet call `executeTransferWithAuthorization(...)` on `authorization.from`, not on the token contract.
  - If reason includes `simulation_failed`, verify `sessionId`, authorization tuple values, and that payer account contract is deployed.
- Settle failure:
  - Confirm relayer key has KITE gas and `FACILITATOR_PRIVATE_KEY` is configured.
  - Confirm the same signed `x-payment` is not re-used after successful settlement.
- Backend failed verify/settle:
  - Inspect `agent-server` logs for `x402 verify rejected` / `x402 settle rejected` and reason details.

## Rollback
Switch backend back to hosted facilitator:

```bash
railway variable set -s agent-server KITE_FACILITATOR_URL=https://facilitator.pieverse.io
railway service restart agent-server
```
