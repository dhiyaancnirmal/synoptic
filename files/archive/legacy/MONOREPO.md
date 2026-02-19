# Monorepo Layout

pnpm workspaces + Turborepo. Every package is independently buildable but shares types and config from the root.

```
synoptic/
│
├── .github/
│   └── workflows/
│       └── ci.yml                    # Lint + type-check + contract tests on push
│
├── apps/
│   ├── dashboard/                    # Next.js 15 frontend
│   │   ├── app/
│   │   │   ├── layout.tsx            # Root layout: wallet provider, socket context
│   │   │   ├── page.tsx              # Landing: connect wallet, agent overview grid
│   │   │   ├── agents/
│   │   │   │   ├── page.tsx          # Agent list
│   │   │   │   ├── new/
│   │   │   │   │   └── page.tsx      # Provision new agent flow
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx      # Single agent dashboard (identity, vault, feed)
│   │   │   │       └── configure/
│   │   │   │           └── page.tsx  # Edit spending rules
│   │   │   └── marketplace/
│   │   │       └── page.tsx          # Browse mock catalog (human view)
│   │   ├── components/
│   │   │   ├── ui/                   # shadcn/ui primitives (Card, Button, Badge, etc.)
│   │   │   ├── agent-card.tsx        # Agent identity + status card
│   │   │   ├── vault-card.tsx        # Balance, rules, daily spend meter
│   │   │   ├── activity-feed.tsx     # Real-time transaction log (WebSocket-driven)
│   │   │   ├── order-table.tsx       # Order history with settlement links
│   │   │   ├── payment-flow.tsx      # x402 handshake visualization
│   │   │   ├── spending-chart.tsx    # Recharts spend-over-time line chart
│   │   │   ├── wallet-connect.tsx    # MetaMask/Coinbase wallet connection
│   │   │   └── nav.tsx               # Top navigation with agent switcher
│   │   ├── lib/
│   │   │   ├── api.ts                # Typed API client (fetch wrapper)
│   │   │   ├── socket.ts             # Socket.IO client singleton + hooks
│   │   │   ├── wallet.ts             # ethers.js wallet utilities + SIWE
│   │   │   └── format.ts             # Address truncation, USDC formatting, time ago
│   │   ├── public/
│   │   │   └── logo.svg
│   │   ├── next.config.ts
│   │   ├── postcss.config.mjs
│   │   ├── tailwind.css              # Tailwind 4 entry (no config file needed)
│   │   ├── tsconfig.json
│   │   ├── package.json
│   │   └── .env.example
│   │
│   ├── api/                          # Express.js backend
│   │   ├── src/
│   │   │   ├── index.ts              # Server entry: Express + Socket.IO + event indexer
│   │   │   ├── routes/
│   │   │   │   ├── agents.ts         # CRUD: provision, list, detail, update rules, revoke
│   │   │   │   ├── marketplace.ts    # Products, pairs, order placement (x402 protected)
│   │   │   │   ├── auth.ts           # SIWE verify + JWT issue
│   │   │   │   └── health.ts         # Health check (chain connectivity, db status)
│   │   │   ├── middleware/
│   │   │   │   ├── x402.ts           # x402 payment verification middleware
│   │   │   │   ├── auth.ts           # JWT verification middleware
│   │   │   │   └── ratelimit.ts      # Per-agent rate limiting
│   │   │   ├── services/
│   │   │   │   ├── kite.ts           # Kite chain interactions (ethers provider, contracts)
│   │   │   │   ├── vault.ts          # Agent vault deployment + management (AA SDK)
│   │   │   │   ├── identity.ts       # KitePass provisioning + verification
│   │   │   │   ├── marketplace.ts    # Product catalog + order logic
│   │   │   │   ├── payment.ts        # x402 payment creation + facilitator interaction
│   │   │   │   └── indexer.ts        # On-chain event listener + WebSocket broadcaster
│   │   │   ├── db/
│   │   │   │   ├── schema.ts         # SQLite table definitions (agents, orders, events)
│   │   │   │   ├── migrations.ts     # Auto-run on startup
│   │   │   │   └── index.ts          # Database singleton
│   │   │   ├── data/
│   │   │   │   ├── products.json     # Mock product catalog
│   │   │   │   └── pairs.json        # Mock trading pairs with simulated prices
│   │   │   └── utils/
│   │   │       ├── logger.ts         # Winston structured logger
│   │   │       └── errors.ts         # Typed error classes
│   │   ├── tsconfig.json
│   │   ├── package.json
│   │   ├── Dockerfile                # Production container
│   │   └── .env.example
│   │
│   └── mcp-server/                   # MCP server for agent frameworks
│       ├── src/
│       │   ├── index.ts              # MCP server entry: register tools, start transport
│       │   ├── tools/
│       │   │   ├── identity.ts       # synoptic.identity.* tool handlers
│       │   │   ├── marketplace.ts    # synoptic.marketplace.* tool handlers
│       │   │   ├── payment.ts        # synoptic.payment.* tool handlers
│       │   │   ├── order.ts          # synoptic.order.* tool handlers
│       │   │   └── vault.ts          # synoptic.vault.* tool handlers
│       │   ├── client/
│       │   │   ├── api.ts            # HTTP client for Synoptic API
│       │   │   └── signer.ts         # Agent key management + EIP-3009 signing
│       │   └── utils/
│       │       └── validation.ts     # Zod schemas for tool inputs
│       ├── tsconfig.json
│       ├── package.json
│       └── .env.example
│
├── packages/
│   ├── types/                        # Shared TypeScript types
│   │   ├── src/
│   │   │   ├── agent.ts              # Agent, AgentConfig, AgentStatus
│   │   │   ├── vault.ts              # VaultRules, SpendingWindow, SessionKey
│   │   │   ├── marketplace.ts        # Product, TradingPair, Order, OrderStatus
│   │   │   ├── payment.ts            # PaymentRequirements, X402Payment, Settlement
│   │   │   ├── events.ts             # On-chain event types (OrderPlaced, etc.)
│   │   │   └── index.ts              # Barrel export
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   ├── contracts/                    # Solidity smart contracts
│   │   ├── contracts/
│   │   │   ├── SynopticRegistry.sol  # Agent registration + ownership mapping
│   │   │   ├── SynopticMarketplace.sol # Product listings, orders, escrow, settlement
│   │   │   ├── SynopticVault.sol     # Agent spending wallet with rule enforcement
│   │   │   └── interfaces/
│   │   │       ├── ISynopticRegistry.sol
│   │   │       ├── ISynopticMarketplace.sol
│   │   │       └── ISynopticVault.sol
│   │   ├── test/
│   │   │   ├── Registry.test.ts      # Agent registration, ownership, revocation
│   │   │   ├── Marketplace.test.ts   # Order flow, escrow, settlement, refund
│   │   │   └── Vault.test.ts         # Spending rules, budget enforcement, session keys
│   │   ├── scripts/
│   │   │   ├── deploy.ts             # Deploy all contracts to Kite testnet
│   │   │   ├── seed.ts               # Seed marketplace with mock products
│   │   │   └── verify.ts             # Verify contracts on Kitescan
│   │   ├── hardhat.config.ts
│   │   ├── tsconfig.json
│   │   ├── package.json
│   │   └── .env.example
│   │
│   └── openclaw-skill/               # OpenClaw skill package
│       ├── SKILL.md                  # The skill definition (triggers, instructions, MCP config)
│       ├── references/
│       │   ├── kite-x402.md          # x402 payment protocol reference for the LLM
│       │   ├── marketplace-api.md    # Available products/pairs and how to query them
│       │   └── vault-rules.md        # How spending rules work, what limits apply
│       └── scripts/
│           └── install.sh            # Appends MCP server config to openclaw.json
│
├── docker/
│   ├── docker-compose.yml            # Full stack: api + mcp-server (dashboard via Vercel)
│   ├── Dockerfile.api                # API server container
│   └── Dockerfile.mcp               # MCP server container
│
├── docs/
│   ├── PROJECT_OVERVIEW.md           # This set of documents
│   ├── SYSTEM_DESIGN.md
│   ├── TECH_STACK.md
│   ├── DEPENDENCIES.md
│   ├── MONOREPO.md
│   └── BOUNTY_NARRATIVE.md
│
├── turbo.json                        # Turborepo pipeline config
├── pnpm-workspace.yaml               # Workspace package definitions
├── tsconfig.base.json                # Shared TypeScript config
├── .eslintrc.cjs                     # Root ESLint config
├── .prettierrc                       # Prettier config
├── .gitignore
├── LICENSE                           # MIT
└── README.md                         # Quick start, demo link, architecture diagram
```

## Workspace configuration

### pnpm-workspace.yaml

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

### turbo.json

```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": [".env"],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "dist/**", "artifacts/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "lint": {},
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "deploy:testnet": {
      "dependsOn": ["build"],
      "cache": false
    }
  }
}
```

### Package naming

All packages use the `@synoptic/` scope:

| Package | npm name | Purpose |
|---|---|---|
| `apps/dashboard` | (not published) | Next.js web app |
| `apps/api` | (not published) | Express API server |
| `apps/mcp-server` | `@synoptic/mcp-server` | Published so agents can `npx @synoptic/mcp-server` |
| `packages/types` | `@synoptic/types` | Shared types (internal workspace dep) |
| `packages/contracts` | `@synoptic/contracts` | Contract ABIs + deployment addresses |
| `packages/openclaw-skill` | (not published) | Distributed as a SKILL.md file |

### Cross-package imports

```typescript
// In apps/api/src/services/marketplace.ts
import type { Product, Order, OrderStatus } from "@synoptic/types";

// In apps/dashboard/lib/api.ts
import type { Agent, VaultRules } from "@synoptic/types";

// In apps/mcp-server/src/tools/order.ts
import type { PaymentRequirements, X402Payment } from "@synoptic/types";
```

### Build order

Turborepo resolves this automatically via `dependsOn: ["^build"]`:

```
1. packages/types          (no deps)
2. packages/contracts      (no deps, but tests need types)
3. apps/api                (depends on types)
4. apps/mcp-server         (depends on types)
5. apps/dashboard          (depends on types)
```

### Dev command

```bash
pnpm dev
```

This starts in parallel:
- Dashboard: `next dev` on port 3000
- API: `tsx watch src/index.ts` on port 3001
- MCP server: `tsx watch src/index.ts` (stdio mode, no port)
- Contracts: not started in dev (deploy separately)
