# Onboarding Runbook (Phase 1)

This runbook gets a new operator from zero to a paid request against Synoptic with wallet auth, session persistence, and identity linking.

## 1) Prerequisites

- Node `22.22.0`
- `pnpm` `9.15.4`
- Running agent server (`@synoptic/agent-server`)
- Optional but recommended: Kite MCP configured for payer linking and x402 approvals

## 2) Install and configure

```bash
nvm use 22.22.0
pnpm install
cp .env.example .env
```

Minimum agent-server env for Phase 1:

- `AUTH_TOKEN_SECRET`
- `KITE_PAYMENT_MODE` (`facilitator` or `demo`)
- `KITE_FACILITATOR_URL` (required when mode is `facilitator`)

## 3) Start server

```bash
pnpm --filter @synoptic/agent-server dev
```

Health check:

```bash
curl -s http://localhost:3001/health | jq
```

Expected `payment` object includes:

- `mode`
- `verifyReachable`
- `settleReachable`
- `lastCheckedAt`

## 4) Run CLI setup

```bash
npx @synoptic/agent setup
```

What setup does:

1. Creates or loads `~/.synoptic/wallet.json` (idempotent)
2. Calls `POST /api/auth/wallet/challenge`
3. Signs challenge locally and calls `POST /api/auth/wallet/verify`
4. Persists `~/.synoptic/session.json` with `0600` permissions
5. Tries payer link (`POST /api/identity/link`) if MCP is available

If payer link is unavailable, setup completes as `ready_with_warnings`.

## 5) Validate identity + readiness

```bash
npx @synoptic/agent status
```

Confirm:

- Session file exists
- `readiness.walletReady=true`
- `readiness.identityLinked=true` for strict paid-route identity checks
- Health payment probe reports expected mode/reachability

## 6) First paid request smoke

With CLI (MCP configured):

```bash
npx @synoptic/agent start --dry-run
```

Or raw API:

1. Call `GET /oracle/price?pair=ETH/USDT` without `x-payment` to receive `402` challenge
2. Approve via Kite MCP `approve_payment`
3. Retry same endpoint with:
   - `x-payment`
   - `x-payment-request-id`
   - `Authorization: Bearer <accessToken>`

## 7) Canonical tuple and asset

Keep these fixed:

- `scheme=gokite-aa`
- `network=kite-testnet`
- `x402Version=1`
- `asset=0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63`
- atomic units with `decimals=18`
