# Synoptic — Master Plan

## What Synoptic Is

An autonomous trading platform where AI agents — identified by their Kite Passport address — pay for market intelligence via x402, execute trades on Monad, and record attestations on Kite. Every agent is a Kite address. Every payment flows through Kite MCP. Every action is verifiable on-chain.

## Core Principle

**The Kite MCP is the payment rail. Every agent is a Kite address. No exceptions.**

```
Agent (Kite address) → calls x402 service → 402 →
  MCP get_payer_addr() → MCP approve_payment() →
  X-Payment header → facilitator settles on Kite →
  service delivered → attestation on Kite
```

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  KITE TESTNET (2368)                  │
│                                                      │
│  Every agent = a Kite Passport AA wallet address     │
│                                                      │
│  ┌────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ Kite MCP   │  │ Facilitator  │  │ ServiceReg   │ │
│  │            │  │ (Pieverse)   │  │ contract     │ │
│  │ get_payer  │  │              │  │              │ │
│  │ approve_pay│  │ /v2/verify   │  │ recordTrade()│ │
│  │            │  │ /v2/settle   │  │ recordPay()  │ │
│  └─────┬──────┘  └──────┬───────┘  └──────┬───────┘ │
│        │                │                 │          │
│    agent pays      settles USDT      attestation     │
│    via MCP         on-chain          on-chain        │
└────────┼────────────────┼─────────────────┼──────────┘
         │                │                 │
┌────────▼────────────────▼─────────────────▼──────────┐
│              AGENT SERVER (Railway)                    │
│                                                       │
│  x402-gated endpoints:                                │
│    /oracle/price    — real-time prices (CoinGecko)    │
│    /oracle/analysis — AI market analysis              │
│    /trade/quote     — get Uniswap quote on Monad     │
│    /trade/execute   — execute swap on Monad           │
│                                                       │
│  All endpoints return 402 → agent pays via MCP →      │
│  server verifies via facilitator → settles on Kite →  │
│  serves data / executes action                        │
│                                                       │
│  Agent EOA wallet (AGENT_PRIVATE_KEY):                │
│    - Signs Uniswap swaps on Monad                     │
│    - Calls ServiceRegistry on Kite                    │
│    - Same address on both chains                      │
└───────────────────────┬───────────────────────────────┘
                        │
         ┌──────────────┼──────────────┐
         ▼                             ▼
┌─────────────────┐          ┌─────────────────┐
│ MONAD TESTNET   │          │ DASHBOARD       │
│ (10143)         │          │ (Vercel)        │
│                 │          │                 │
│ Uniswap V2     │          │ Payment flow    │
│ ETH/USDC/USDT  │          │ Trade history   │
│ WBTC/WETH      │          │ Agent sessions  │
│                 │          │ Activity feed   │
│ Agent EOA       │          │ Cross-chain txs │
│ executes swaps  │          │                 │
└─────────────────┘          └─────────────────┘
```

### The Two Wallet Concerns

| Wallet | Lives On | Purpose | Who Controls |
|--------|----------|---------|-------------|
| Kite Passport AA wallet | Kite (2368) | x402 payments — paying for services | The user/agent via MCP session |
| Agent EOA (AGENT_PRIVATE_KEY) | Kite + Monad | Signing swaps on Monad + attestations on Kite | Server (Railway env var) |

The Passport AA wallet pays. The EOA executes. Both are Kite addresses.

---

## How the Agent Interacts With Our Product

### Path A: Inside Cursor / Claude Desktop (Mode 1)

User has two MCP servers configured:
1. **Kite Passport MCP** — `https://neo.dev.gokite.ai/v1/mcp` (payment tools)
2. **Synoptic MCP** (optional) — our own MCP server exposing trading tools

The AI agent in Cursor:
1. User says "monitor ETH price and trade when momentum is bullish"
2. Agent calls `GET /oracle/price?pair=ETH/USDT` on our server
3. Server returns 402 with payment challenge
4. Agent calls Kite MCP `get_payer_addr()` → gets AA wallet
5. Agent calls Kite MCP `approve_payment()` → gets X-Payment header
6. Agent retries with X-Payment → server verifies + settles → returns price
7. Agent analyzes price, decides to buy
8. Agent calls `POST /trade/execute` → 402 → pays again via MCP → trade executes on Monad
9. Server records attestation on Kite
10. All visible in dashboard

### Path B: CLI Tool (`npx @synoptic/agent`)

The CLI is an MCP client (using `@modelcontextprotocol/sdk`):
1. Connects to Kite MCP server programmatically
2. Runs an autonomous loop (same as Path A but headless)
3. Handles 402 → MCP payment → retry automatically
4. Prints activity to terminal, streams to dashboard via WebSocket

### Path C: Agent Server Autonomous Loop (Railway)

The tick runner on Railway:
1. Agent is registered with a Kite Passport address
2. Every 30s: fetch price → strategy → trade → attest
3. x402 payments happen on every oracle call
4. Trades execute on Monad
5. Attestations land on Kite
6. Dashboard shows everything real-time

---

## Phase 1: Core x402 + Monad Trading (Option 2)

**Goal:** Agent authenticates on Kite, pays for market data via x402, trades on Monad, attests on Kite.

### 1.1 Clean Up Agent Server

Remove Sepolia from agent-server and runtime; use Monad env/config. Agent-server and runtime have no Sepolia references. The dashboard and shared types retain only documented compatibility shims (see Documentation policy): `sepoliaTxHash` in the trade mapper and `sepolia` in the explorer when env is set.

**Files to modify:**
- `apps/agent-server/src/env.ts` — replace SEPOLIA vars with MONAD vars
- `apps/agent-server/src/server.ts` — no Sepolia references
- `apps/agent-server/src/oracle/server.ts` — already good (CoinGecko prices)
- `apps/agent-server/src/oracle/middleware.ts` — already good (x402 flow)
- `apps/agent-server/src/routes/compat.ts` — update chain references

**New env vars:**
```
MONAD_RPC_URL=https://testnet-rpc.monad.xyz
MONAD_CHAIN_ID=10143
MONAD_EXPLORER_URL=https://testnet.monadexplorer.com
```

### 1.2 Monad Trading Adapter

Replace `RealTradingAdapter` Sepolia logic with Monad.

**Approach A — Uniswap Trading API:**
- Same API (`https://trade-api.gateway.uniswap.org/v1`) with `chainId: 10143`
- If it works: cleanest path, already have the client code
- Need to verify: does the API accept Monad testnet chainId?

**Approach B — Direct Uniswap V2 Router calls (fallback):**
- Call Uniswap V2 Router contract on Monad directly via ethers.js
- `swapExactETHForTokens()`, `swapExactTokensForETH()`
- Need router contract address on Monad testnet (find via explorer or Uniswap docs)
- More work but guaranteed to work if pools have liquidity

**Key token addresses (Monad testnet):**
- WMON: `0x760afe86e5de5fa0ee542fc7b7b713e1c5425701`
- USDC: `0x62534e4bbd6d9ebac0ac99aeaa0aa48e56372df0` (84K holders)
- ETH (native): `0x0000000000000000000000000000000000000000`

**Files to modify:**
- `packages/agent-core/src/trading/real-trading-adapter.ts` — Monad chain config
- `packages/agent-core/src/trading/uniswap-client.ts` — chainId 10143
- `packages/agent-core/src/trading/swap-executor.ts` — Monad provider
- `packages/agent-core/src/chain/` — add Monad provider config

### 1.3 ServiceRegistry Contract on Kite

Rename `TradeRegistry` → `ServiceRegistry`. Records both payments and trades.

```solidity
contract ServiceRegistry {
    struct ServiceRecord {
        address agent;           // Kite Passport address
        string serviceType;      // "oracle_price", "trade_execute", "analysis"
        uint256 paymentAmount;   // amount paid via x402
        bytes32 paymentTxHash;   // Kite settlement tx
        uint256 targetChainId;   // 10143 for Monad trades
        bytes32 targetTxHash;    // Monad swap tx hash (if trade)
        string metadata;         // strategy reason, pair, etc.
        uint256 timestamp;
    }

    function recordService(...) external;
    function getAgentHistory(address agent) external view returns (ServiceRecord[] memory);
}
```

Deploy to Kite testnet. Fund deployer from faucet.gokite.ai.

**Files:**
- `packages/contracts/contracts/ServiceRegistry.sol` (new, replaces TradeRegistry)
- `packages/contracts/scripts/deploy.ts` — deploy to Kite testnet
- `packages/agent-core/src/attestation/real-attestation-adapter.ts` — update

### 1.4 Gasless Attestations (Stretch)

Use Kite AA SDK for gasless `recordService()` calls:
```typescript
import { GokiteAASDK } from 'gokite-aa-sdk';
const sdk = new GokiteAASDK(
  'kite_testnet',
  'https://rpc-testnet.gokite.ai',
  'https://bundler-service.staging.gokite.ai/rpc/'
);
```

If AA SDK doesn't support arbitrary contract calls gaslessly, just fund the EOA with KITE from the faucet. Don't overcomplicate this.

### 1.5 Tick Runner Update

`default-tick-runner.ts` flow becomes:

```
1. Verify Kite Passport (eth_chainId === 2368)
2. GET /oracle/price → 402 → pay via x402 → get price
3. Store price snapshot
4. Evaluate strategy (momentum / rebalance)
5. If buy/sell signal:
   a. POST /trade/quote → 402 → pay → get Monad quote
   b. POST /trade/execute → 402 → pay → swap on Monad
   c. Record attestation on Kite via ServiceRegistry
6. Emit events via WebSocket to dashboard
7. Sleep 30s, repeat
```

Every step that touches our API = x402 payment = on-chain settlement on Kite. This is the key demo point.

### 1.6 Judge-Facing Trading Cockpit (Dashboard)

We must ship a dedicated dashboard surface for judges that makes autonomous trading behavior obvious without reading logs.

Required cockpit sections:
1. **Agent Session Panel**
- Session start time
- Agent identity (`kitePassportId` / owner + executor address)
- Budget cap and spend progression

2. **Spot Trading Panel (Monad)**
- Executed trades timeline (pair, size, status, tx hash)
- Live balances/holdings for tracked spot tokens (MON/USDC/USDT/etc.)
- Derived exposure view (spot holdings, not perp positions)

3. **Payment + Attestation Panel**
- x402 challenge/authorization/settlement lifecycle
- Kite settlement tx link per paid action
- Kite attestation tx link for each executed trade/service action

4. **Realtime Stream Panel**
- Render live stream for price/equity/throughput using Liveline (`https://benji.org/liveline`)
- Show last streamed block/event timestamp
- Show ingestion status for QuickNode stream events

Constraints:
- Keep canonical API mode as default.
- Keep explorer links chain-aware and env-driven.
- Preserve compatibility rendering for deprecated payload keys during migration window.

---

## Phase 2: CLI Agent (Option 1)

**Goal:** `npx @synoptic/agent` — a standalone CLI that judges can run.

### 2.1 New Package: `apps/cli` or `packages/agent-cli`

```
packages/agent-cli/
  src/
    index.ts          — entry point, arg parsing
    mcp-client.ts     — connects to Kite MCP as client
    agent-loop.ts     — autonomous trading loop
    display.ts        — terminal UI (ora spinners, tables)
  package.json
  tsconfig.json
```

### 2.2 MCP Client Integration

Using `@modelcontextprotocol/sdk`:

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

const mcpClient = new Client({ name: 'synoptic-agent', version: '1.0.0' });
// Connect to Kite MCP
await mcpClient.connect(transport);

// When we hit 402:
const payer = await mcpClient.callTool('get_payer_addr', {});
const auth = await mcpClient.callTool('approve_payment', {
  payer_addr: payer.payer_addr,
  payee_addr: servicePayeeAddress,
  amount: challengeAmount,
  token_type: 'USDC'
});
// Retry with auth.x_payment as X-Payment header
```

### 2.3 CLI UX

```
$ npx @synoptic/agent --task "trade ETH/USDC on momentum signals"

🔑 Connecting to Kite Passport MCP...
✓ Agent address: 0x742d35Cc...
✓ Session budget: 100 USDC

📊 Tick #1 — Fetching ETH/USDC price...
  → 402 Payment Required
  → Paying 0.10 USDC via Kite MCP...
  → Settled on Kite: 0xabc123... (kitescan.ai link)
  → Price: ETH = $1,959.06

🧠 Strategy: MOMENTUM → BUY signal (price above 3-period avg)

💱 Executing swap on Monad...
  → 402 Payment Required
  → Paying 0.25 USDC via Kite MCP...
  → Swapping 0.1 ETH → USDC on Monad Uniswap V2
  → Monad tx: 0xdef456... (monadexplorer.com link)

📝 Recording attestation on Kite...
  → Kite tx: 0x789ghi... (kitescan.ai link)

✓ Tick #1 complete. Budget: 99.65 / 100.00 USDC
  Next tick in 30s...
```

---

## Phase 3: Commerce on Kite (Option 3)

**Goal:** Agent-to-agent marketplace. One agent sells intelligence, another buys via x402.

### 3.1 Multi-Agent Architecture

**Provider Agent** — runs on our server:
- Serves market analysis, price predictions, trade signals
- All endpoints x402-gated
- Receives USDC payments on Kite

**Consumer Agent** — runs as CLI or in Cursor:
- Has a Kite Passport with funded session
- Calls provider agent's x402 endpoints
- Pays per request
- Uses purchased intelligence to make trading decisions

### 3.2 Agentic Commerce Protocol

Aligns with Kite's `agentic-commerce-protocol` repo (OpenAI + Stripe standard):
- Agent discovers services (catalog endpoint)
- Agent evaluates pricing
- Agent pays and consumes
- Everything settled on Kite

### 3.3 Simple AMM on Kite (Stretch)

If time allows: deploy a minimal constant-product AMM on Kite testnet.
- KITE/TestUSD pair
- Seed with faucet tokens
- Agent can trade on Kite directly
- Everything on one chain for the purest demo

---

## Network Reference

### Kite Testnet
| Field | Value |
|-------|-------|
| Chain ID | 2368 |
| RPC | `https://rpc-testnet.gokite.ai/` |
| Explorer | `https://testnet.kitescan.ai/` |
| Faucet | `https://faucet.gokite.ai` |
| Token | KITE |
| Settlement Token (USDT) | `0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63` |
| Settlement Contract | `0x8d9FaD78d5Ce247aA01C140798B9558fd64a63E3` |
| AA Bundler | `https://bundler-service.staging.gokite.ai/rpc/` |
| Gasless API | `https://gasless.gokite.ai` |
| Facilitator | `https://facilitator.pieverse.io` |
| MCP URL | `https://neo.dev.gokite.ai/v1/mcp` |
| Passport Portal | `https://x402-portal-eight.vercel.app/` |

### Monad Testnet
| Field | Value |
|-------|-------|
| Chain ID | 10143 |
| RPC | `https://testnet-rpc.monad.xyz` |
| Explorer | `https://testnet.monadexplorer.com` |
| Faucet | `https://testnet.monad.xyz` |
| Token | MON |
| WMON | `0x760afe86e5de5fa0ee542fc7b7b713e1c5425701` |
| USDC | `0x62534e4bbd6d9ebac0ac99aeaa0aa48e56372df0` |
| Uniswap V2 Router | TBD (find on explorer) |

### Hyperliquid HyperCore (Stretch)
| Field | Value |
|-------|-------|
| Chain ID (EVM) | 998 (testnet) / 999 (mainnet) |
| RPC | `https://rpc.hyperliquid-testnet.xyz/evm` |
| Trading API | HyperCore REST/WS/gRPC (not EVM) |
| QuickNode | Streams + Webhooks supported |

### Cross-Chain Attestation Pattern (Monad + Hyperliquid)

Attestation stays identical across chains: one `ServiceRegistry` contract on Kite records the source chain and source reference.

```solidity
// same method for both chains
ServiceRegistry.recordService(
  agent,
  serviceType,
  paymentAmount,
  paymentTxHash,
  targetChainId,
  targetTxHashOrRef,
  metadata
);
```

Examples:
- Monad swap attestation: `recordService(chainId: 10143, targetTxHash: 0xMonad...)`
- HyperEVM attestation: `recordService(chainId: 998, targetTxHash: 0xHyper...)`

| Dimension | Monad | Hyperliquid |
|-----------|-------|-------------|
| Trading method | Uniswap V2 AMM (on-chain swap tx) | HyperCore API (REST/WS orderbook, off-EVM) |
| What gets attested | Monad swap tx hash | HyperCore fill/order ID (or HyperEVM tx hash if wrapped) |
| Agent signing mode | EOA on Monad (`ethers.js`) | HyperCore API auth/signing flow |
| QuickNode bounty mapping | Monad Streams ($1K) | HyperCore Streams ($1K) |

Hyperliquid nuance:
1. HyperCore trades do not always produce a traditional EVM tx hash.
2. We can attest either the HyperCore fill ID directly or a HyperEVM wrapper tx hash.
3. Either way, Kite attestation architecture is unchanged.

---

## Bounty Alignment

### Priority Order (Hard Constraint)

1. **P0: Kite AI bounty** (must fully satisfy all required criteria)
2. **P1: Uniswap bounty** (must use Uniswap Trading API flow end-to-end)
3. **P2: QuickNode bounty/bounties** (only after P0+P1 are complete)

No engineering time should be spent on P2 if it risks P0 or P1 delivery.

### P0/P1 Acceptance Tests (Locked)

These are the blocking acceptance checks. QuickNode work starts only after these pass.

```bash
nvm install 22.21.1
nvm use 22.21.1
corepack enable
pnpm install
bash scripts/p0-p1-evidence-harness.sh
```

Expected pass markers:
1. `backend guardrails: pass`
2. `ok - Uniswap client uses required headers on check_approval, quote, and swap`
3. `ok - Uniswap client validates tx data in /check_approval and /swap responses`
4. `ok - oracle route enforces challenge, settles deterministic payment, and persists payment lifecycle`
5. `ok - trade routes support list/get`
6. `No direct legacy endpoint references found in dashboard route/component code.`

For browser E2E proof in same evidence bundle:

```bash
nvm use 22.21.1
EXPECT_RUNNING_SERVERS=1 bash scripts/p0-p1-evidence-harness.sh
```

Additional pass marker:
1. `dashboard e2e passed`

Evidence output path:
1. `artifacts/evidence/p0-p1/<timestamp-utc>/`
2. Includes per-step logs and `SUMMARY.txt`.

### Kite AI Bounty ($10,000)

| Requirement | How We Hit It |
|-------------|--------------|
| Build on Kite testnet | All identity, payments, attestations on Kite 2368 |
| x402 payment flows | Every API call → 402 → Kite MCP pay → facilitator settle |
| Verifiable agent identity | Every agent = Kite Passport AA wallet address |
| Autonomous execution | Tick runner on Railway, CLI agent, no human intervention |
| Open-source (MIT) | GitHub public repo |
| Agent authenticates | Kite Passport MCP + SIWE |
| Executes paid actions | x402 payments for oracle + trade execution |
| On-chain settlement | Facilitator settles USDT on Kite per payment |
| On-chain attestations | ServiceRegistry contract on Kite |
| Live demo | Dashboard on Vercel + Agent on Railway |
| Clear README | Step-by-step setup + demo instructions |

**Bonus points:**
- Multi-agent coordination (Phase 3 — provider + consumer agents)
- Gas abstraction (AA SDK for gasless attestations)
- Scoped permissions (session budgets, daily limits, auto-pause)
- Integration with Cursor/Claude Desktop (MCP)

### Kite Definition of Done (Must Have)

1. Agent identity is verifiable via Kite Passport or wallet-based identity in the live demo.
2. Every paid action is mapped to an x402 flow and visible in logs/UI.
3. Settlement proof is visible on Kite explorer for paid actions.
4. Autonomous execution is demonstrated without manual wallet confirmation clicks.
5. Open-source core repo is public with a reproducible README demo flow.

### Judging Criteria Mapping

| Criteria | Our Story |
|----------|-----------|
| Agent Autonomy | 30s tick loop, budget-scoped, auto-pause on errors |
| Correct x402 | Every paid API call maps to x402 payment with on-chain settlement. Budget exhaustion = graceful 403 + pause. |
| Security | Session-scoped budgets, no private key exposure, AA wallet via MCP, rate limits, consecutive error limits |
| Developer Experience | `npx @synoptic/agent`, clear docs, MCP integration for Cursor |
| Real-world Applicability | Any API can be x402-gated using this pattern. Reference implementation. |

### QuickNode Bounties ($2,000)

| Track | Prize | What We Build |
|-------|-------|--------------|
| Best Use of QuickNode Monad Streams | $1,000 | Stream Monad swap events to dashboard via webhook |
| Best Use of QuickNode HyperCore Streams | $1,000 | Stream perp data for market analysis (stretch) |

### QuickNode Execution Policy (ROI + Account Constraint)

Given free-plan endpoint limits, default strategy is:
1. Ship **one** QuickNode track first (recommended: Monad Streams, lower integration risk).
2. Only pursue both tracks if a second account/endpoint is provisioned and P0+P1 are already locked.
3. If pursuing HyperCore, treat it as a stretch item because perp execution is on HyperCore (off-EVM), which increases integration complexity.

### QuickNode Single-Track Plan (Post-Gate Only)

Activation gate:
1. `scripts/p0-p1-evidence-harness.sh` must pass with no P0/P1 failures.
2. Reviewer evidence bundle must exist under `artifacts/evidence/p0-p1/<timestamp-utc>/`.

Single-track scope (Monad Streams only):
1. Create QuickNode Streams pipeline for Monad swap event ingestion.
2. Filter to swap events consumed by Synoptic.
3. Deliver to webhook receiver endpoint in agent-server.
4. Persist transformed events in DB and surface in dashboard activity feed.

Evidence harness for this phase (run only after activation gate):
```bash
nvm use 22.21.1
# Run after a passing P0/P1 harness bundle exists.
# 1) Capture webhook receiver logs in agent-server
# 2) Trigger known Monad swap activity
# 3) Confirm DB write + dashboard event render
```

QuickNode proof points:
1. Stream configuration screenshot (dataset, filters, destination webhook).
2. Webhook delivery log with event id and timestamp.
3. Database row/log confirmation of transformed event ingestion.
4. Dashboard screenshot showing streamed event in activity feed.
5. Mapping note to Kite attestation (`targetChainId=10143`, `targetTxHash=<swapTxHash>`).

### Uniswap Definition of Done (Must Have)

Uniswap bounty delivery must use the Trading API flow explicitly:
1. `POST /check_approval`
2. `POST /quote`
3. `POST /swap`

Required headers in server-side calls:
- `x-api-key`
- `x-universal-router-version: 2.0`
- `Content-Type: application/json`

Evidence required:
1. Live swap execution on supported testnet/mainnet path used in the submission.
2. Public interface URL for judges.
3. Open-source code showing Trading API integration points.

---

## Env Vars Required

### Railway (agent-server)
```
# Auth
AUTH_TOKEN_SECRET=<random-secret>

# Kite
KITE_RPC_URL=https://rpc-testnet.gokite.ai/
KITE_FACILITATOR_URL=https://facilitator.pieverse.io
KITE_SERVICE_PAYTO=<our-oracle-payee-address>
SERVICE_REGISTRY_ADDRESS=<deployed-contract>
AGENT_PRIVATE_KEY=<funded-on-both-chains>

# Monad
MONAD_RPC_URL=https://testnet-rpc.monad.xyz
MONAD_CHAIN_ID=10143

# Uniswap
UNISWAP_API_KEY=<from-developers.uniswap.org>

# DB
DATABASE_URL=<neon-postgres-url>

# Dashboard
DASHBOARD_URL=https://synoptic-dashboard.vercel.app
```

### Vercel (dashboard)
```
NEXT_PUBLIC_AGENT_SERVER_URL=https://agent-server-production-e47b.up.railway.app
NEXT_PUBLIC_AGENT_SERVER_WS=wss://agent-server-production-e47b.up.railway.app/ws
NEXT_PUBLIC_KITE_EXPLORER_URL=https://testnet.kitescan.ai
NEXT_PUBLIC_MONAD_EXPLORER_URL=https://testnet.monadexplorer.com
```

---

## Parallel Execution Plan

### Critical Path (Non-Parallel)
1. Deploy `ServiceRegistry` to Kite and set `SERVICE_REGISTRY_ADDRESS`.
2. Validate paid oracle flow end-to-end (`402 → MCP approve_payment → facilitator settle`).
3. Validate Monad swap execution path (Uniswap API or direct V2 router fallback).
4. Merge paid oracle + trade execution in tick runner with Kite attestations.
5. Ship production demo deploys (Railway + Vercel) and submission assets.

### Parallel Workstreams (Maximum Concurrency)

| Lane | Scope | Can Start Immediately | Depends On | Deliverables |
|------|-------|------------------------|------------|--------------|
| A | Kite contracts + attestations | Yes | None | `ServiceRegistry` deployed, ABI exported, attestation adapter updated |
| B | Agent server chain cutover | Yes | None | Sepolia removed from agent-server/runtime; Monad env/config live; dashboard/types retain documented compatibility shims (see Documentation policy) |
| C | Trading execution on Monad | Yes | Lane B config baseline | Quote + execute working with fallback path decided |
| D | Dashboard chain UX + trading cockpit | Yes | None | Monad explorer links, Kite settlement links, payment/trade lifecycle UI, session/trades/holdings cockpit, Liveline realtime panel |
| E | CLI autonomous agent | Yes | None | `npx @synoptic/agent` with MCP payment + trade loop |
| F | DevOps + quality gates | Yes | None | Railway/Vercel envs, smoke scripts, CI checks, demo script artifacts |
| G | QuickNode Streams integration | After Lane C first trade event schema | Lane C output shape | Streams webhook ingestion + dashboard event feed + cockpit stream status |
| H | Multi-agent commerce stretch | After Lanes A/B/C stable | Paid endpoint baseline | Provider+consumer agent flow and docs |

Execution gating:
1. Lanes A/B/C/F are mandatory for Kite P0.
2. Uniswap API acceptance criteria must be met before allocating time to G/H.
3. Lanes G/H are suspended if they threaten P0/P1 completion dates.

### Dependency Graph

```
A (ServiceRegistry) ─────┐
                         ├──> Tick Runner E2E (CP4) ───> Demo Deploy (CP5)
B (Monad Cutover) ──┐    │
                    ├──> C (Monad Trading) ─┘
D (Dashboard UX) ───────────────────────────────┘
E (CLI Agent) ──────────────────────────────────┘
F (DevOps/CI) ──────────────────────────────────┘
G (QuickNode) <── C
H (Commerce)  <── A+B+C
```

### Parallel Sprint Cadence

#### Sprint 0 (Day 0): Alignment + Interfaces
1. Freeze canonical event contracts (`payment_settled`, `trade_executed`, `attested`).
2. Freeze env var schema and chain constants (`2368`, `10143`).
3. Assign lane owners and daily merge windows.

#### Sprint 1 (Days 1-2): Core Rails in Parallel
1. Lane A deploys `ServiceRegistry` and publishes ABI/address.
2. Lane B removes Sepolia from agent-server/runtime and lands Monad runtime config; dashboard/types retain documented compatibility shims (see Documentation policy).
3. Lane C validates Uniswap API on Monad; if blocked, switches to direct router fallback.
4. Lane D updates dashboard explorer links and payment/trade state mapping.
5. Lane E scaffolds CLI MCP client and autonomous loop.
6. Lane F prepares Railway/Vercel env templates and smoke test scripts.

#### Sprint 2 (Days 3-4): Integrate + Harden
1. Merge lanes A+B+C into end-to-end paid tick flow.
2. Connect lane D UI to live end-to-end data.
3. Connect lane E CLI to live end-to-end data.
4. Run resilience tests: insufficient funds, quote failure, swap revert, facilitator failure.
5. Enable QuickNode lane G if lane C event shape is stable.

#### Sprint 3 (Days 5-6): Submission Surface
1. Final demo runbook validation (dashboard + CLI + explorer proofs).
2. Optional lane H multi-agent commerce if critical path is complete.
3. Record demo and package submission.

---

## Documentation Policy and Cleanup

### Delete
- All Sepolia references in agent-server env, chain config, and provider code. Dashboard and packages/types retain only documented compatibility shims (legacy mapper key `sepoliaTxHash`, explorer chain fallback for `sepolia` when `NEXT_PUBLIC_SEPOLIA_EXPLORER_URL` is set).
- `apps/api/` (old API, already deleted in git status)
- `apps/cli/` (old CLI, replace with new agent-cli)
- `apps/mcp-server/` (old MCP server, already deleted)
- Redundant root docs: `AGENT_SERVER.md`, `ARCHITECTURE.md`, `BOUNTY_CHECKLIST.md`, `CONTRACTS.md`, `DATABASE.md`, `ENV.md`, `FRONTEND.md`, `INDEX.md`, `PHASE_GATES.md`, `PROJECT_STRUCTURE.md`, `ROOT_CONFIG.md`, `STACK.md`, `UNISWAP_INTEGRATION.md`, `errors.md`
- Redundant dashboard docs: `apps/dashboard/FRONTEND_CONTRACTS.md`, `apps/dashboard/FRONTEND_PHASE_GATES.md`
- `files/` directory (legacy docs)
- Placeholder token addresses (`0x000...`, `0x111...`)

### Compatibility shims (dashboard/types)

The following are retained as deprecated compatibility only. No agent-server or runtime Sepolia config remains.

1. **Trade mapper**: `mapTrade` accepts `sepoliaTxHash` as a fallback for `executionTxHash` (legacy API payloads).
2. **Explorer**: Explorer supports `chain=sepolia` when `NEXT_PUBLIC_SEPOLIA_EXPLORER_URL` is set (legacy links/payloads).

### Canonical Docs Kept
- `PLAN.md` (single source of truth for architecture, execution, and delivery)
- `README.md` (short entry point that links to `PLAN.md`)
- `bounties/*.md` (source bounty specs used for submission targeting)

### Keep
- Agent-server core (Fastify, WebSocket, orchestrator, tick runner)
- Oracle middleware (x402 flow — already production-ready)
- Facilitator adapter (verify + settle — already done)
- Dashboard structure (pages, WebSocket, real-time updates)
- Database schema (agents, payments, trades, activity_events, price_snapshots)
- Agent-core adapters pattern (TradingAdapter, AttestationAdapter, PaymentAdapter)
- Strategy implementations (momentum, rebalance)

---

## Demo Script (3 minutes)

**0:00 — "This is Synoptic"**
Show dashboard. Explain: autonomous trading agents on Kite AI.

**0:30 — "Every agent is a Kite address"**
Show agent list. Each has a Kite Passport address, daily budget, strategy.

**1:00 — "Watch a payment happen"**
Start agent. Show 402 → MCP payment → Kite settlement in real-time.
Click Kite explorer link — show on-chain USDT transfer.

**1:30 — "Now it trades"**
Agent gets price, momentum signal fires, swap executes on Monad.
Click Monad explorer link — show on-chain swap.
Click Kite explorer link — show attestation.

**2:00 — "The CLI"**
Run `npx @synoptic/agent`. Show it connecting to Kite MCP, paying, trading.
Everything logged in terminal AND visible in dashboard simultaneously.

**2:30 — "Budget controls"**
Show budget exhaustion. Agent hits limit → graceful pause → 403 in logs.
Show scoped session — user controls how much the agent can spend.

**2:50 — "Open source, production-deployed"**
Show GitHub, README, Vercel URL, Railway URL. Done.
