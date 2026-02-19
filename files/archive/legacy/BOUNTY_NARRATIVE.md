# Bounty Narrative

## How Synoptic answers the Kite AI bounty

This document maps every bounty requirement, evaluation criterion, and bonus point to a specific Synoptic feature. No hand-waving.

---

## Bounty topic alignment

> "Build an agent-native application on Kite AI using x402 payments and verifiable agent identity."

Synoptic is exactly this. It's not a standalone tool or a theoretical framework — it's a working application where an OpenClaw agent authenticates on Kite, pays for services via x402, and transacts autonomously. The human sees it all happen through a real-time dashboard.

> "Projects should demonstrate autonomous agents that can authenticate, pay, and transact across Web3 or Web2-style APIs with minimal human intervention."

The human's involvement is: connect wallet, set spending rules, install the OpenClaw skill. After that, the agent operates on its own. It browses products, evaluates them, signs x402 payments, places orders, and settles on-chain. The dashboard is observation-only — the human watches but doesn't intervene.

---

## Required topics — all five covered

### 1. Build on Kite AI Testnet

All smart contracts are deployed to Kite AI Testnet (Chain ID 2368, RPC: `https://rpc-testnet.gokite.ai/`). The agent's wallet is created using Kite's Account Abstraction SDK (`gokite-aa-sdk`). Every transaction — identity registration, order placement, payment settlement — is a Kite testnet transaction verifiable on `https://testnet.kitescan.ai`.

Contract addresses will be documented in the README after deployment. The deployment script is deterministic (Hardhat + `hardhat-deploy`) so judges can redeploy and verify independently.

### 2. x402 payment flows (agent-to-API and agent-to-agent)

Every monetized API endpoint in Synoptic uses x402. When an agent calls `POST /marketplace/orders`, the server returns HTTP 402 with a JSON payment requirements header specifying the USDC amount, network (eip155:2368), and recipient. The agent signs an EIP-3009 `TransferWithAuthorization` and retries with the `X-PAYMENT` header. The server verifies and settles.

This is agent-to-API x402. The agent pays the Synoptic marketplace contract for each purchase.

For agent-to-agent: if two agents want to trade (e.g., Agent A sells a product listing to Agent B), the marketplace contract acts as escrow. Both sides pay via x402. The contract settles when both sides confirm. This demonstrates agent-to-agent value transfer mediated by x402.

**Failure handling (explicitly required by judging criteria):**
- Insufficient funds → Vault rejects the spend → Agent receives a `SpendRejected` event → MCP tool returns an error with the reason ("daily budget exceeded" or "transaction exceeds per-tx limit") → Skill reports to user via OpenClaw's messaging channel → Dashboard shows a red "rejected" badge
- Invalid payment signature → Facilitator rejects → 402 returned again → Agent retries up to 3 times → If still failing, skill halts and reports
- Facilitator unavailable → Exponential backoff (1s, 2s, 4s) → After 3 failures, skill reports gracefully

### 3. Verifiable agent identity (wallet-based)

Every agent gets a KitePass identity on-chain. The identity is:
- **Wallet-based**: The agent's address is a smart contract wallet (ERC-4337) created via Kite's AA SDK
- **Hierarchically derived**: The agent address is deterministically derived from the user's wallet via BIP-32, meaning anyone can cryptographically verify that Agent X belongs to User Y
- **On-chain registered**: The `SynopticRegistry` contract maps user → agent(s) with metadata (creation time, status, name)
- **Verifiable**: The dashboard displays a "delegation proof" — the BIP-32 derivation path that proves the agent's parentage

The agent never knows the user's private key. The user never needs to manually sign on behalf of the agent. The chain of trust is entirely cryptographic and on-chain.

### 4. Autonomous execution (no manual wallet clicking)

This is Synoptic's core value proposition. The autonomy stack:

1. **OpenClaw heartbeat**: OpenClaw runs a background daemon with a configurable heartbeat (default: every 30 minutes). On each heartbeat, the agent checks if any marketplace actions are pending.
2. **Synoptic skill**: Tells the agent's LLM when and how to interact with the Kite marketplace. The skill triggers on heartbeat or on explicit user messages.
3. **MCP tools**: The agent calls MCP tools (browse, evaluate, order, pay) — no HTTP requests to craft manually.
4. **Session keys**: The agent's vault has pre-authorized session keys with scoped permissions. These keys sign x402 payments without any wallet popup or human approval.
5. **AA bundler**: The Kite bundler submits transactions on-chain and pays gas. The agent never needs KITE tokens for gas.

The result: from the user's perspective, they configured rules once, and the agent now autonomously shops/trades within those rules. No MetaMask popups. No manual approvals. No human in the loop.

### 5. Open source (MIT license)

The entire monorepo — dashboard, API, MCP server, smart contracts, OpenClaw skill — is MIT licensed. Every component is in a single public GitHub repository. The README includes:
- Architecture diagram
- One-command local setup (`pnpm install && pnpm dev`)
- Docker Compose for reproducible deployment
- Contract deployment instructions
- Live demo URL

---

## Evaluation criteria — direct mapping

### Agent Autonomy — "minimal human involvement"

Human involvement is exactly three actions:
1. Connect wallet and provision agent (one-time, ~2 minutes)
2. Configure spending rules (one-time, ~1 minute)
3. Install OpenClaw skill (one-time, paste one URL)

After that: zero human involvement. The agent operates on heartbeat-triggered autonomy. The dashboard is view-only.

### Correct x402 Usage — "payments tied to actions"

> "Each paid API call must clearly map to an x402 payment in your logs/UI"

The dashboard's Activity Feed shows every action with its corresponding x402 payment. Each entry displays:
- Action: "Purchased USB-C Hub" or "Traded 10 USDC → KITE"
- x402 amount: "5.00 USDC"
- Payment tx: linked to Kitescan
- Settlement tx: linked to Kitescan
- Status: pending → confirmed → settled

The API server logs every x402 interaction with structured Winston logging:
```
{
  "level": "info",
  "action": "x402_payment_settled",
  "agentAddress": "0x...",
  "amount": "5000000",
  "asset": "USDC",
  "txHash": "0x...",
  "orderId": "order_001",
  "timestamp": "2026-02-18T12:34:56Z"
}
```

> "Submissions must show how mis-use or insufficient funds are handled"

See failure handling above. The dashboard visualizes rejected payments with a distinct red state, the reason for rejection, and the vault's current balance/limits for context. The agent gracefully degrades — it doesn't crash or retry infinitely.

### Security & Safety — "key handling, scopes, limits"

- **Key handling**: User keys never leave the browser (MetaMask/Coinbase Wallet). Agent keys are derived, never manually created. Session keys are ephemeral and auto-expire.
- **Scopes**: Session keys are scoped to specific function selectors (e.g., "can call `placeOrder` but not `withdrawAll`").
- **Limits**: ClientAgentVault enforces on-chain: per-tx max, daily budget, recipient whitelist. These are smart contract constraints — even a malicious agent binary cannot bypass them.
- **Rate limits**: API-level rate limiting (60 req/min per agent). Vault-level budget enforcement. Facilitator-level transaction caps.

### Developer Experience — "clarity, docs, usability"

- **One-command setup**: `pnpm install && pnpm dev` starts everything
- **Docker Compose**: `docker compose up` for zero-config reproducibility
- **Typed everything**: Shared TypeScript types across all packages. Zod validation on all inputs.
- **MCP server**: Any agent framework (not just OpenClaw) can integrate via the MCP protocol
- **Skill installation**: Paste one URL into OpenClaw. No manual configuration.
- **Documentation**: This document set (6 files) covers architecture, dependencies, and rationale.

### Real-world Applicability — "beyond local demos"

Synoptic demonstrates a pattern, not just a product:

- The **x402 middleware** is reusable — any Express API can be gated with per-request micropayments
- The **MCP server** is framework-agnostic — it works with any MCP-compatible agent, not just OpenClaw
- The **vault pattern** is generalizable — any autonomous agent system needs programmable spending rules
- The **event indexer + dashboard** pattern applies to any agent monitoring use case

The mock marketplace is intentionally simple. The infrastructure around it — identity, payments, rules, monitoring — is the real contribution. Swap the mock catalog for a real Shopify API (which Kite already supports), and you have production agent commerce.

---

## Bonus points claimed

### Multi-agent coordination

OpenClaw supports multi-agent routing. In Synoptic:
- A user can deploy multiple agents, each with its own KitePass and vault
- The dashboard's top nav has an agent switcher
- Agents can be configured with different strategies (one shops for electronics, another monitors token prices)
- Agent-to-agent trading works through the marketplace contract: Agent A lists, Agent B buys

### Gasless / abstracted UX

- All agent transactions go through Kite's AA bundler — gas is paid by the bundler, not the agent
- Agents hold only USDC, never KITE tokens
- x402 payments use EIP-3009 (off-chain signing) — no gas cost for the payment authorization itself
- The human never interacts with gas at all

### Security controls

- Per-transaction spending limits (enforced on-chain)
- Daily rolling budget windows (enforced on-chain)
- Recipient whitelists (only approved merchants, enforced on-chain)
- Session key expiry (auto-revoke after configurable time)
- Agent revocation (user can freeze agent from dashboard, immediate effect)
- Rate limiting (API-level, per-agent)
- Structured audit logging (every x402 payment, every vault interaction)

---

## Demo walkthrough (for judges)

1. Visit the live URL (Vercel deployment)
2. Connect a MetaMask wallet (Kite testnet configured)
3. Click "Deploy New Agent" — watch the KitePass registration tx confirm on Kitescan
4. Set rules: $50/day budget, $10/tx max
5. Click "Get Skill URL" — copy it
6. In your OpenClaw terminal, paste the URL to install the Synoptic skill
7. Send your OpenClaw a message: "Browse the Synoptic marketplace and buy something interesting under $10"
8. Watch the dashboard Activity Feed light up: browse → evaluate → x402 payment → order placed → settled
9. Click any tx hash to verify on Kitescan
10. Try exceeding the daily budget — watch the rejection appear in the feed with the reason

Alternative (no OpenClaw required): The dashboard has a "Simulate Agent Action" button that triggers the same flow programmatically, so judges can see the full loop without installing OpenClaw.

---

## What we're NOT doing (and why)

- **No real AMM or liquidity pools**: The trading pairs use simulated prices. Building a real AMM is an entire DeFi project — it would dilute focus from the agent infrastructure, which is what the bounty evaluates.
- **No cross-chain**: Everything runs on Kite testnet. Cross-chain adds complexity that doesn't demonstrate the core thesis better.
- **No mobile app**: Web dashboard only. The bounty requires a web app or CLI, not mobile.
- **No AI model training**: The agent's intelligence comes from its LLM (Claude, GPT, etc. via OpenClaw). We don't train anything. We build the rails the agent transacts on.
