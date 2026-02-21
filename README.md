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

## Dashboard Auth (Local Dev)

Quick local bypass (no bearer token required):

1. Set these in `.env`:
   - `ALLOW_INSECURE_DEV_AUTH_BYPASS=true`
   - `NEXT_PUBLIC_ALLOW_INSECURE_DEV_AUTH_BYPASS=true`
2. Restart `pnpm dev`.

Manual bearer token flow (no wallet signing):

1. Generate a token:

```bash
node -e 'const crypto=require("node:crypto");const secret=process.env.AUTH_TOKEN_SECRET||"synoptic-prod-secret";const ownerAddress="0x000000000000000000000000000000000000dEaD";const agentId="bootstrap-agent";const now=Math.floor(Date.now()/1000);const claims={sub:ownerAddress,agentId,ownerAddress,authMode:"passport",iat:now,exp:now+3600};const header={alg:"HS256",typ:"JWT"};const h=Buffer.from(JSON.stringify(header),"utf8").toString("base64url");const p=Buffer.from(JSON.stringify(claims),"utf8").toString("base64url");const signed=h+"."+p;const s=crypto.createHmac("sha256",secret).update(signed).digest("base64url");process.stdout.write(signed+"."+s+"\\n");'
```

2. Open `http://localhost:3000/login`, paste the token, click `save token`.

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
