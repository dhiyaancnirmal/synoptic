# Synoptic

Synoptic is an agent-native application that combines:

- Kite x402 payments and verifiable agent identity
- Uniswap API swap execution
- QuickNode Streams on Monad as primary blockchain data ingestion

## Canonical Planning Inputs

Use these files first before planning or implementation changes:

- `/Users/dhiyaan/Code/synoptic/PLAN.md`
- `/Users/dhiyaan/Code/synoptic/bounties/kite-ai-agent-native-x402.md`
- `/Users/dhiyaan/Code/synoptic/bounties/uniswap-api-integration.md`
- `/Users/dhiyaan/Code/synoptic/bounties/quicknode-streams-monad.md`

## Local Setup

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

## P0/P1 Harness

```bash
nvm use 22.22.0
bash scripts/p0-p1-evidence-harness.sh
```

Optional UI E2E (when services are already running):

```bash
nvm use 22.22.0
EXPECT_RUNNING_SERVERS=1 bash scripts/p0-p1-evidence-harness.sh
```

Harness outputs:

- `/Users/dhiyaan/Code/synoptic/artifacts/evidence/p0-p1/<timestamp-utc>/`

## Current Delivery Focus

- Keep one submission path aligned to the three canonical bounty files.
- Use QuickNode Streams (Monad) as primary data source for streamed blockchain insights.
- Keep x402 payment mapping explicit for every paid action.

