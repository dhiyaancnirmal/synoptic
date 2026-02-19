# Synoptic

## One sentence

Synoptic is an agent command center on Kite AI where OpenClaw agents autonomously shop, trade, and transact — and you watch everything happen in real time.

## The problem

The agentic economy has a visibility gap. AI agents like OpenClaw can already browse the web, send emails, and execute code autonomously. Kite AI provides the economic rails — identity, micropayments, settlement — for agents to transact. But there's no unified surface that ties these together. No place where a human can deploy an agent into the Kite economy, set its rules, and then observe its autonomous commercial activity as it happens.

Right now, if you want an AI agent to buy something or trade on your behalf on Kite AI, you'd need to: manually provision a wallet, manually fund it, manually write integration code, manually check the block explorer for receipts, and manually piece together what happened. That's not an agentic economy. That's just crypto with extra steps.

## What Synoptic actually is

Synoptic is three things in one:

**1. A Kite AI skill for OpenClaw** — A drop-in skill (`synoptic-kite`) that gives any OpenClaw agent the ability to authenticate on Kite via KitePass, pay for services via x402, browse a product/asset catalog, and execute purchases or trades. Install the skill, and your OpenClaw agent is now economically autonomous on Kite. No code required from the user.

**2. An MCP server for Kite AI** — For agents that aren't OpenClaw (or for developers who want programmatic access), Synoptic exposes all Kite operations — identity provisioning, x402 payments, marketplace interaction, order management — as MCP tools. Any MCP-compatible agent framework can plug in.

**3. A real-time dashboard** — A web app where you see everything. Agent identity and reputation. Live transaction feed. Spending analytics. Active orders. Payment flow visualization from intent → x402 negotiation → on-chain settlement. Think of it as the "Activity" tab on your bank app, but for your AI agents.

## How it works end-to-end

1. **User signs in** to the Synoptic dashboard with their wallet (MetaMask, Coinbase Wallet, etc.)
2. **Deploys an agent** — Synoptic provisions a KitePass identity and a ClientAgentVault smart contract wallet on Kite testnet. The agent's wallet is deterministically derived (BIP-32) from the user's wallet, so the chain of trust is cryptographically verifiable.
3. **Configures spending rules** — The user sets: max per-transaction spend, daily budget, allowed merchant addresses or categories, and an expiry time. These rules are enforced at the smart contract level. Even a compromised agent can't exceed them.
4. **Installs the skill** — The user gives their OpenClaw the Synoptic skill (one URL paste). The skill picks up the agent's credentials from the vault config.
5. **Agent goes autonomous** — The OpenClaw agent, via its heartbeat or on-demand, can now:
   - Browse a Synoptic marketplace of mock products and token pairs
   - Evaluate options using its LLM reasoning
   - Execute purchases/trades via x402 micropayments (gasless, stablecoin-settled)
   - Log every action on-chain with attestation
6. **User watches in real time** — The dashboard streams events from the chain: order placed, payment signed, settlement confirmed. Every action maps to an x402 payment visible in the UI.

## What the demo looks like

The live demo (deployed on Vercel) shows a split view:

**Left panel: Agent Activity Feed** — A real-time log of what the agent is doing. Each entry shows the action type (browse, evaluate, purchase, trade), the x402 payment amount, the on-chain tx hash, and a status indicator (pending → confirmed).

**Right panel: Agent Dashboard** — Four cards:
- **Identity** — Agent's KitePass address, parent user address, delegation proof, reputation score
- **Vault** — Current balance (USDC), daily spend used/remaining, rule configuration
- **Orders** — Active and completed orders with product/asset details and settlement receipts
- **Payment Flow** — A visual diagram showing the x402 handshake: request → 402 response → signed payment → facilitation → settlement

**Top bar** — Switch between agents (multi-agent support via OpenClaw multi-agent routing). Each agent has its own KitePass and vault.

## Why this wins the bounty

| Bounty Requirement | Synoptic's Answer |
|---|---|
| Build on Kite AI Testnet | All smart contracts deploy to Chain ID 2368. All transactions settle on Kite testnet. |
| x402 payment flows | Every marketplace interaction is an x402 request-response. Agent signs EIP-3009 authorizations. Server verifies via facilitator. Settled in USDC on Kite. |
| Verifiable agent identity | KitePass + BIP-32 hierarchical derivation. Agent proves it belongs to a user without exposing the user's keys. |
| Autonomous execution | OpenClaw heartbeat triggers the skill. No human clicks any wallet popup, ever. Session keys and ClientAgentVault handle authorization autonomously. |
| Open source | MIT license. Monorepo on GitHub. |
| Functional UI | Next.js dashboard with real-time WebSocket event streaming. Publicly accessible on Vercel. |
| Clear visualization | Agent identity card, payment flow diagram, on-chain confirmation links to Kitescan. |

**Bonus points hit:**
- Multi-agent coordination (OpenClaw multi-agent routing, multiple KitePass identities)
- Gasless UX (AA SDK bundler pays gas; agents transact in USDC only)
- Security controls (ClientAgentVault spending rules, session key expiry, rate limits, address whitelists)

## What Synoptic is NOT

- It is **not** a real exchange or marketplace with real liquidity. The "marketplace" is a mock catalog of products and simulated token pairs running on testnet tokens.
- It is **not** a full DeFi protocol. There's no AMM, no liquidity pools, no yield farming.
- It is **not** production-ready financial infrastructure. It's a demonstration that an AI agent can, end-to-end, authenticate itself, discover goods/assets, reason about them, pay for them via x402, and settle on Kite — all without a human touching anything.

The point is to prove the loop works. The marketplace contents are secondary to the infrastructure that makes autonomous agent commerce possible.
