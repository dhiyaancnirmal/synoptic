# Synoptic handoff — production E2E state

Use this as the single source of truth for “what works” and “what to do next” after the Codex backend phase 0 baseline.

---

## Deployed URLs

| Service   | URL |
|----------|-----|
| Agent API (Railway) | https://agent-server-production-e47b.up.railway.app |
| Dashboard (Vercel)  | https://dashboard-sigma-sooty.vercel.app |

---

## What works right now

- **Branch**: `codex/backend-phase0-baseline` is pushed.
- **P0/P1 harness**: Passes locally (`bash scripts/p0-p1-evidence-harness.sh`): backend guardrails, Uniswap acceptance, oracle + trade acceptance, dashboard legacy guard.
- **Railway agent-server**:
  - `/health` returns `ok`, `database: up`, `facilitator: real`, `auth: passport`.
  - Has: `DATABASE_URL`, `UNISWAP_API_KEY`, `KITE_FACILITATOR_URL`, `KITE_SERVICE_PAYTO`.
- **Vercel dashboard**: Deployed and can talk to the agent server (when CORS/env point to it).
- **E2E flow (code path)**:
  - `/oracle/price` — x402 challenge → settle → Uniswap quote-derived ETH/USD price (falls back to local static price if Uniswap is unavailable).
  - `/trade/quote` — needs trading configured (see below).
  - `/trade/execute` — executes swap on Monad then, if attestation is configured, records on Kite via ServiceRegistry.

---

## Exact blockers (production E2E trade + attestation)

1. **Railway missing env**
   - `AGENT_PRIVATE_KEY` — required for signing swaps (Monad) and attestations (Kite). Must be an EOA funded on **both** Monad testnet and Kite testnet.
   - `SERVICE_REGISTRY_ADDRESS` — Kite contract address; required for attestation after each trade. Contract not yet deployed to Kite testnet.

2. **Railway likely missing (if not set)**
   - `EXECUTION_RPC_URL` (or `MONAD_RPC_URL`) — Monad testnet RPC, e.g. `https://testnet-rpc.monad.xyz`. Required for `/trade/quote` and `/trade/execute`.
   - `KITE_RPC_URL` — e.g. `https://rpc-testnet.gokite.ai/`. Required for attestation.

3. **ServiceRegistry**
   - Not yet deployed to Kite testnet. Without it, trades can run but attestation step is skipped (no Kite explorer link for attestation).

---

## Verify current deployed env / health

- **Now**: `GET https://agent-server-production-e47b.up.railway.app/health`  
  Confirms server + DB + facilitator. It does **not** yet show why trading/attestation are disabled.

- **After next deploy**: The health response will include:
  - `capabilities.trading`: `"configured"` | `"not_configured"`
  - `capabilities.attestation`: `"configured"` | `"not_configured"`
  Use these to confirm that the two missing vars (and optional RPC vars) are set correctly on Railway, without exposing secrets.

---

## Fastest path to complete Kite bounty E2E

1. **Set missing Railway vars**
   - `AGENT_PRIVATE_KEY` — EOA private key (e.g. `0x...`), funded on Monad testnet and Kite testnet (faucets: Monad, Kite).
   - `EXECUTION_RPC_URL` — `https://testnet-rpc.monad.xyz` (or your Monad RPC).
   - `KITE_RPC_URL` — `https://rpc-testnet.gokite.ai/` (if not already set).
   - Do **not** set `SERVICE_REGISTRY_ADDRESS` until step 2 is done.

2. **Deploy ServiceRegistry to Kite testnet**
   - From repo root, with env loaded (e.g. `.env` with `AGENT_PRIVATE_KEY`, `KITE_TESTNET_RPC` or `KITE_RPC_URL`, `KITE_CHAIN_ID=2368`):
     ```bash
     cd packages/contracts && pnpm exec hardhat run scripts/deploy.ts --network kiteTestnet
     ```
   - Copy the printed `address` and set on Railway: `SERVICE_REGISTRY_ADDRESS=<that address>`.
   - Redeploy or restart the agent-server on Railway so it picks up the new var.

3. **Validate E2E with real tx links**
   - **Oracle**: `GET /oracle/price?pair=ETH/USDT` with x402 (e.g. from dashboard or MCP client). Expect 200 + price.
   - **Quote**: `POST /trade/quote` with x402 and body e.g. `{ "amountIn": "0.01" }`. Expect 200 + quote.
   - **Execute**: `POST /trade/execute` with x402 and body including `quoteResponse` from quote. Expect 200 + `txHash` (Monad) and `attestationTxHash` (Kite).
   - **Proof**: Open Monad explorer link for `txHash` and Kite explorer link for `attestationTxHash` (e.g. `https://testnet.kitescan.ai/tx/<attestationTxHash>`).

4. **Optional: run P0/P1 with live servers**
   - Start dashboard and agent-server (or use deployed URLs), then:
     ```bash
     EXPECT_RUNNING_SERVERS=1 bash scripts/p0-p1-evidence-harness.sh
     ```
   - Capture screenshots and logs per `bounties/kite-ai-agent-native-x402.md` (agents, payments, activity, settlement tx, attestation tx, SUMMARY.txt).

---

## Checklist: done vs remaining

| Item | Status |
|------|--------|
| Railway live, DB + facilitator | Done |
| Vercel dashboard live | Done |
| P0/P1 harness passes (local) | Done |
| `DATABASE_URL`, `UNISWAP_API_KEY`, `KITE_FACILITATOR_URL`, `KITE_SERVICE_PAYTO` on Railway | Done |
| Health endpoint (optional: capabilities flags after next deploy) | Done in code |
| **AGENT_PRIVATE_KEY** on Railway | **Remaining** |
| **EXECUTION_RPC_URL** (Monad RPC) on Railway | **Remaining** (if not set) |
| **KITE_RPC_URL** on Railway | **Remaining** (if not set) |
| Deploy **ServiceRegistry** to Kite testnet | **Remaining** |
| **SERVICE_REGISTRY_ADDRESS** on Railway | **Remaining** |
| Full E2E: `/oracle/price` → `/trade/quote` → `/trade/execute` → attestation with real tx links | **Remaining** until above are done |
| Bounty evidence bundle (screenshots + logs + SUMMARY) | **Remaining** (after E2E works) |

---

## One-shot handoff prompt (for Codex or next session)

```text
Continue from current Synoptic state without re-explaining basics. We are live on Railway (agent-server-production-e47b.up.railway.app) and Vercel (dashboard-sigma-sooty.vercel.app). P0/P1 harness passes and branch codex/backend-phase0-baseline is pushed. Remaining blocker is full production E2E trade+attestation. Railway has DATABASE_URL, UNISWAP_API_KEY, KITE_FACILITATOR_URL, KITE_SERVICE_PAYTO, but is missing AGENT_PRIVATE_KEY and SERVICE_REGISTRY_ADDRESS. First, verify current deployed env/health and confirm exact blockers. Then execute the fastest path to complete Kite bounty requirements: set missing vars, deploy ServiceRegistry, validate /oracle/price -> /trade/quote -> /trade/execute -> attestation end-to-end with real tx links, and produce a final concise checklist of what is done vs remaining. Keep responses action-focused, minimal back-and-forth, and run commands directly unless blocked.
```

Reference: `HANDOFF.md` and `bounties/kite-ai-agent-native-x402.md`.
