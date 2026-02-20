# Synoptic

Synoptic is an agent-native trading system where AI agents authenticate and pay via Kite x402, execute trades (Monad/Hyperliquid tracks), and attest outcomes on Kite.

## Canonical Documentation

- `/Users/dhiyaan/Code/synoptic/PLAN.md` is the single source of truth for architecture, delivery plan, and implementation decisions.
- `/Users/dhiyaan/Code/synoptic/bounties/` contains source bounty specs used for submission targeting.

## Reviewer Quickstart (Node 22.22.0 exact)

```bash
nvm install 22.22.0
nvm use 22.22.0
corepack enable
pnpm install
cp .env.example .env
pnpm db:push
pnpm dev
```

Local services:

- Dashboard: `http://localhost:3000`
- Agent server: `http://localhost:3001`

## P0 + P1 Acceptance Lock (Kite + Uniswap First)

Run the evidence harness:

```bash
nvm use 22.22.0
bash scripts/p0-p1-evidence-harness.sh
```

If services are already running and you want UI E2E evidence in the same run:

```bash
nvm use 22.22.0
EXPECT_RUNNING_SERVERS=1 bash scripts/p0-p1-evidence-harness.sh
```

Expected pass markers:

- `backend guardrails: pass`
- `ok - Uniswap client uses required headers on check_approval, quote, and swap`
- `ok - Uniswap client validates tx data in /check_approval and /swap responses`
- `ok - oracle route enforces challenge, settles deterministic payment, and persists payment lifecycle`
- `ok - trade routes support list/get`
- `No direct legacy endpoint references found in dashboard route/component code.`
- `dashboard e2e passed` (only with `EXPECT_RUNNING_SERVERS=1`)

Harness outputs are written to `artifacts/evidence/p0-p1/<timestamp-utc>/`.

Explorer and trade mapping default to Kite + Monad; legacy Sepolia payload/explorer support is retained as documented compatibility shims (see PLAN.md).

## Evidence Checklist (Fresh Reviewer)

Collect the following in one review session:

- Terminal log bundle from `artifacts/evidence/p0-p1/<timestamp-utc>/`.
- Screenshot of dashboard `/agents` page (agent identity visible).
- Screenshot of dashboard `/payments` page showing `Oracle Challenge / Retry`.
- Screenshot of dashboard `/trading` page showing `Trade Timeline`.
- Screenshot of dashboard `/activity` page showing `Timeline`.
- One Kite explorer link/screenshot proving settlement tx for a paid action.
- One Monad explorer link/screenshot proving swap tx.
- One Kite explorer link/screenshot proving attestation tx.

## QuickNode Track Policy (After P0/P1 Only)

QuickNode is explicitly non-blocking for acceptance:

- Do not start QuickNode integration until the P0/P1 harness passes.
- Default to one track only: Monad Streams.
- HyperCore Streams remains stretch, only if extra endpoint/account exists and no P0/P1 risk remains.
