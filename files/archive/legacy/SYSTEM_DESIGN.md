# System Design

## Architecture overview

Synoptic is a five-component system. Each component has a single responsibility and communicates through well-defined interfaces.

```
┌─────────────────────────────────────────────────────────────┐
│                        USER (Human)                         │
│                    Browser / OpenClaw CLI                    │
└──────────┬──────────────────────────────────┬───────────────┘
           │                                  │
           ▼                                  ▼
┌─────────────────────┐          ┌──────────────────────────┐
│   Synoptic Dashboard │          │    OpenClaw Gateway       │
│   (Next.js Web App)  │          │    + Synoptic Skill       │
│                      │          │                          │
│  • Agent management  │          │  • Heartbeat-triggered   │
│  • Live tx feed      │◄────┐   │  • Autonomous browse     │
│  • Spending controls │     │   │  • x402 payment signing  │
│  • Payment flow viz  │     │   │  • Order execution       │
└──────────┬───────────┘     │   └──────────┬───────────────┘
           │                 │              │
           ▼                 │              ▼
┌─────────────────────┐      │   ┌──────────────────────────┐
│   Synoptic API       │      │   │   Synoptic MCP Server    │
│   (Express.js)       │      │   │   (stdio / SSE)          │
│                      │◄─────┼───│                          │
│  • Agent CRUD        │      │   │  • identity.provision    │
│  • Vault management  │      │   │  • marketplace.browse    │
│  • Order processing  │      │   │  • payment.execute       │
│  • x402 middleware   │      │   │  • order.place           │
│  • Event streaming   │      │   │  • vault.status          │
└──────────┬───────────┘      │   └──────────┬───────────────┘
           │                  │              │
           ▼                  │              ▼
┌─────────────────────────────┴──────────────────────────────┐
│                    Kite AI Testnet                           │
│                    Chain ID: 2368                            │
│                                                             │
│  ┌──────────────┐ ┌──────────────┐ ┌─────────────────────┐ │
│  │  KitePass     │ │  Agent Vault │ │  Marketplace        │ │
│  │  Registry     │ │  (per agent) │ │  Contract           │ │
│  │              │ │              │ │                     │ │
│  │  • Agent DID  │ │  • USDC hold │ │  • Product listings │ │
│  │  • Delegation │ │  • Spend     │ │  • Order escrow     │ │
│  │  • Reputation │ │    rules     │ │  • Settlement       │ │
│  └──────────────┘ └──────────────┘ └─────────────────────┘ │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Event Indexer (listens to contract events)           │   │
│  │  → WebSocket push to Dashboard                        │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Component details

### 1. Dashboard (Next.js)

The dashboard is a server-rendered Next.js app that serves as the human control plane. It does not directly interact with the blockchain. All chain interactions go through the Synoptic API.

**Pages:**

- `/` — Landing page. Connect wallet. See overview of all deployed agents.
- `/agents/[id]` — Single agent view. Identity card, vault balance, live activity feed, order history.
- `/agents/[id]/configure` — Edit spending rules, allowed merchants, budget limits. Submits a transaction to update the agent's ClientAgentVault.
- `/agents/new` — Provision a new agent. Generates KitePass, deploys vault, returns skill installation URL.
- `/marketplace` — Browse the mock product/asset catalog. This is what the agent sees programmatically, rendered for human inspection.

**Real-time updates:**

The dashboard subscribes to a WebSocket endpoint on the API server. The API server runs an event indexer that polls Kite testnet for new blocks and filters for events emitted by Synoptic contracts. When a relevant event fires (OrderPlaced, PaymentSettled, VaultFunded, etc.), it's pushed to all connected dashboard clients.

No polling from the frontend. Pure push via WebSocket.

**Auth:**

Wallet-based. User signs a SIWE (Sign-In with Ethereum) message. The API server verifies the signature and issues a JWT. All subsequent API calls carry the JWT. The JWT encodes the user's address, which is used to scope agent queries (you only see your own agents).

### 2. Synoptic API (Express.js)

The API is the central backend. It handles:

**Agent lifecycle:**
- `POST /agents` — Provision a new agent. Calls the GokiteAccountFactory to deploy a new AA wallet. Registers a KitePass identity on-chain. Returns the agent's address and skill config.
- `GET /agents` — List all agents for the authenticated user.
- `GET /agents/:id` — Agent detail: identity, vault balance, active rules, recent transactions.
- `PUT /agents/:id/rules` — Update spending rules on the ClientAgentVault contract.
- `DELETE /agents/:id` — Revoke the agent's session keys and freeze the vault.

**Marketplace:**
- `GET /marketplace/products` — Returns mock product catalog (stored in a JSON file or lightweight SQLite db). Products have: name, description, price (USDC), seller address, category.
- `GET /marketplace/pairs` — Returns mock trading pairs (e.g., KITE/USDC, ETH/USDC) with simulated price feeds.
- `POST /marketplace/orders` — Protected by x402 middleware. The agent must include a signed x402 payment header to place an order. The middleware verifies the payment, settles it on-chain via the facilitator, and then creates the order in the marketplace contract.

**x402 middleware:**

Every monetized endpoint responds with HTTP 402 and a `PAYMENT-REQUIRED` header if no valid `X-PAYMENT` header is present. The header specifies:
```json
{
  "scheme": "exact",
  "network": "eip155:2368",
  "asset": "0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63",
  "amount": "1000",
  "payTo": "0xSynopticTreasury",
  "maxAge": 300
}
```

The agent signs an EIP-3009 `TransferWithAuthorization` and retries. The middleware forwards the signed payload to a facilitator (self-hosted or Coinbase's), which settles the USDC transfer on-chain. Only after settlement confirmation does the endpoint return the requested data.

**Event indexer:**

A background process using ethers.js that:
1. Connects to `wss://rpc-testnet.gokite.ai` (or polls via HTTP if WS unavailable)
2. Filters for events from Synoptic's deployed contracts
3. Parses event data and pushes to connected WebSocket clients
4. Stores events in a lightweight SQLite database for historical queries

### 3. Synoptic MCP Server

An MCP (Model Context Protocol) server that exposes Synoptic's capabilities as tools. This is what makes Synoptic accessible to any MCP-compatible agent — not just OpenClaw.

**Transport:** stdio (for local agent processes) and SSE (for remote agents).

**Tools exposed:**

| Tool | Description | Parameters |
|---|---|---|
| `synoptic.identity.provision` | Create a new agent KitePass and vault | `parentAddress`, `dailyBudget`, `rules` |
| `synoptic.identity.status` | Get agent identity, reputation, vault balance | `agentAddress` |
| `synoptic.marketplace.browse` | Search products/pairs | `category`, `maxPrice`, `query` |
| `synoptic.marketplace.product` | Get single product detail | `productId` |
| `synoptic.payment.prepare` | Get x402 payment requirements for an action | `action`, `params` |
| `synoptic.payment.execute` | Sign and submit x402 payment | `paymentRequirements`, `agentPrivateKey` |
| `synoptic.order.place` | Place a purchase/trade order (wraps prepare + execute) | `productId` or `pair`, `amount` |
| `synoptic.order.status` | Check order status and settlement | `orderId` |
| `synoptic.vault.fund` | Add USDC to agent vault (from faucet on testnet) | `agentAddress`, `amount` |
| `synoptic.vault.rules` | View or update spending rules | `agentAddress`, `rules?` |

The MCP server is a thin wrapper around the Synoptic API. It translates MCP tool calls into API requests, handles auth (agent's session key signs requests), and returns structured results the LLM can reason about.

### 4. OpenClaw Skill (`synoptic-kite`)

A SKILL.md file following OpenClaw's skill convention. When installed, it tells the OpenClaw agent:

- **When to activate:** On triggers like "buy", "shop", "trade", "check my agent wallet", "browse marketplace", or on heartbeat if the user has configured autonomous shopping/trading.
- **What tools it has:** The MCP server tools above, accessible via OpenClaw's MCP integration.
- **How to authenticate:** Reads the agent's private key from a config file in the workspace (placed there during provisioning).
- **What rules to follow:** Respect vault spending limits. Always check `vault.status` before attempting a purchase. If insufficient funds, report to user rather than failing silently.
- **How to reason about purchases:** The skill includes a prompt section guiding the LLM to evaluate products on price, relevance to user preferences (if configured), and value — not just buy the first thing it sees.

The skill does NOT embed Kite-specific code. It delegates everything to the MCP server. This keeps the skill lightweight (a single SKILL.md + optional reference docs) and means updates to Kite integration don't require skill reinstallation.

### 5. Smart Contracts (Solidity)

Three contracts deployed to Kite testnet:

**SynopticRegistry.sol**
- Maps user addresses to their agent addresses
- Stores agent metadata (name, creation timestamp, status)
- Emits `AgentRegistered`, `AgentRevoked` events
- Owner-gated registration (only Synoptic API can register, prevents spam)

**SynopticMarketplace.sol**
- Stores product listings (on-chain for verifiability, not for performance)
- Accepts orders: agent calls `placeOrder(productId)` which triggers escrow
- Escrow flow: USDC transferred from agent vault → marketplace contract → held until fulfillment confirmation → released to seller (or refunded on timeout)
- Emits `OrderPlaced`, `OrderFulfilled`, `OrderRefunded`, `PaymentSettled` events
- For trading pairs: simplified AMM-style price calculation (constant product formula) against a mock liquidity pool seeded with testnet tokens

**SynopticVault.sol** (extends Kite's ClientAgentVault pattern)
- UUPS-upgradeable proxy
- Holds USDC for the agent
- Enforces spending rules: per-tx limit, daily budget (rolling 24h window), allowed recipient whitelist
- Session key management: add/revoke session keys with scoped permissions
- Emits `VaultFunded`, `SpendApproved`, `SpendRejected`, `RulesUpdated` events

## Data flow: a complete purchase

```
1. OpenClaw heartbeat fires
2. Skill activates → calls synoptic.marketplace.browse({category: "electronics", maxPrice: 50})
3. MCP server → GET /marketplace/products?category=electronics&maxPrice=50
4. API returns product list
5. LLM evaluates products, selects one
6. Skill calls synoptic.order.place({productId: "prod_001"})
7. MCP server → POST /marketplace/orders {productId: "prod_001"}
8. API responds HTTP 402 with payment requirements ($5 USDC)
9. MCP server calls synoptic.payment.execute() internally
10. Agent's session key signs EIP-3009 TransferWithAuthorization
11. MCP server retries POST /marketplace/orders with X-PAYMENT header
12. API middleware verifies signature, forwards to facilitator
13. Facilitator settles USDC transfer on Kite testnet
14. API creates order in SynopticMarketplace contract
15. Contract emits OrderPlaced + PaymentSettled events
16. Event indexer picks up events
17. WebSocket pushes to dashboard
18. User sees: "Agent purchased 'USB-C Hub' for 5.00 USDC — tx: 0xabc...def ✓"
```

## Security model

**Key hierarchy:**
- User's wallet (MetaMask etc.) = root authority. Never exposed to the agent.
- Agent's wallet = derived via BIP-32 from user's wallet. Holds no funds directly (funds are in the vault contract).
- Session keys = ephemeral, scoped, auto-expiring. Used for individual x402 signatures.

**What an attacker would need to compromise the system:**
- To steal funds: Compromise the agent's private key AND find a way to bypass the vault's on-chain spending rules (which is a smart contract exploit, not just a key leak).
- To exceed budget: Impossible without modifying the vault contract. Rules are enforced on-chain.
- To impersonate an agent: Would need the agent's private key. The KitePass registry verifies ownership.

**Rate limiting:**
- The API enforces per-agent rate limits (configurable, default 60 requests/minute).
- The vault enforces per-time-window budget limits (e.g., $100/day).
- The facilitator has its own rate limits (Coinbase: 1000 free/month).

**Failure handling:**
- Insufficient funds: Vault's `SpendRejected` event fires. Skill reports to user. Dashboard shows rejection.
- Facilitator down: Payment fails. x402 retry with exponential backoff. After 3 failures, skill reports and halts.
- Agent exceeds daily budget: Vault rejects all further spends until window resets. Dashboard shows "budget exhausted" state.
- Malformed payment: Facilitator rejects. No funds move. 402 returned again.
