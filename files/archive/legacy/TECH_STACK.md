# Tech Stack

Every choice here is driven by one question: does this make the bounty demo work end-to-end with the least friction? No over-engineering. No resume-driven development.

## Runtime

**Node.js 22 LTS (22.14.0)**

The entire backend — API server, MCP server, event indexer — runs on Node. OpenClaw itself is a Node project (installed via npm). Kite's AA SDK is a Node package. The x402 reference implementations from Coinbase are TypeScript. Fighting the ecosystem would be pointless. One runtime, one language (TypeScript), one package manager.

**Why not Python?** Kite has a Python SDK too, but the x402 libraries, the AA SDK, and OpenClaw's skill system are all JS/TS-native. Mixing runtimes for a hackathon demo adds complexity for zero benefit.

## Language

**TypeScript 5.7**

Strict mode throughout. The entire monorepo is TypeScript. Smart contract tests use TypeScript via Hardhat. The frontend is TypeScript React. The MCP server is TypeScript. Shared types live in a `packages/types` workspace package and are imported everywhere.

## Frontend

**Next.js 15.1 (App Router)**

Server-side rendering for the initial page load (good for the demo — judges see content immediately, not a loading spinner). Client components for interactive pieces (real-time feed, vault configuration forms). API routes are NOT used — the API server is separate. Next.js is purely a frontend concern here.

**Tailwind CSS 4.0**

Utility-first styling. No component library. For a hackathon, Tailwind + a handful of hand-built components is faster than learning a component library's API. The dashboard needs to look clean, not win a design award.

**shadcn/ui (selected components)**

Not installed as a package — just the components copied in as needed. Specifically: Card, Button, Badge, Table, Dialog, Input, Tabs. These provide accessible, unstyled primitives that Tailwind makes look good. No other UI framework.

**Recharts 2.15**

For the spending analytics chart on the agent dashboard. One line chart (spend over time), one pie chart (spend by category). Recharts is lightweight, React-native, and requires zero configuration.

**Socket.IO Client 4.8**

WebSocket connection to the API server for real-time event streaming. Socket.IO handles reconnection, fallback to long-polling, and room-based filtering (subscribe to events for a specific agent).

## Backend

**Express.js 5.0**

The API server. Express 5 is stable as of late 2024, has proper async error handling, and is the most battle-tested Node HTTP framework. No Fastify, no Hono — Express has the widest middleware ecosystem and the x402 reference middleware is built for it.

**Socket.IO 4.8 (Server)**

Paired with the client. Handles WebSocket connections from dashboard clients. Each agent gets a Socket.IO "room" so events are scoped.

**better-sqlite3 11.8**

Lightweight embedded database. Stores: agent metadata, order history, indexed events. No Postgres, no Redis — this is a testnet demo. SQLite is zero-config, file-based, and fast enough for any demo load. The database file lives at `data/synoptic.db` and is gitignored.

**ethers.js 6.13**

All blockchain interactions. Contract deployment, event listening, transaction signing, ABI encoding/decoding. Not viem — ethers v6 is what Kite's own docs and examples use. Consistency with the ecosystem matters more than marginal DX preferences.

## MCP Server

**@modelcontextprotocol/sdk 1.12**

The official MCP SDK from Anthropic. Implements the MCP protocol over stdio and SSE transports. The Synoptic MCP server registers tools, handles invocations, and returns structured results. This is what makes Synoptic accessible to any MCP-compatible agent — Claude, GPT with MCP support, OpenClaw, etc.

## OpenClaw Integration

**OpenClaw Skill Format (SKILL.md)**

No special SDK needed. An OpenClaw skill is a SKILL.md file (Markdown with YAML frontmatter) plus optional reference docs and scripts. The skill declares:
- `name`, `description`, trigger conditions (`when`)
- `metadata.openclaw.requires` — env vars and binaries needed
- The skill body — instructions for the LLM on how to use the MCP tools

The Synoptic skill configures OpenClaw to connect to the Synoptic MCP server via the `mcpServers` block in `openclaw.json`:

```json
{
  "mcpServers": {
    "synoptic": {
      "command": "npx",
      "args": ["synoptic-mcp-server"],
      "env": {
        "SYNOPTIC_AGENT_KEY": "${SYNOPTIC_AGENT_KEY}",
        "SYNOPTIC_API_URL": "https://synoptic-api.vercel.app"
      }
    }
  }
}
```

## Smart Contracts

**Solidity 0.8.28**

Latest stable Solidity. Using 0.8.x for built-in overflow protection. No need for SafeMath.

**Hardhat 2.22**

Compilation, testing, deployment. Hardhat is the standard for EVM development. Kite's own documentation uses Hardhat for their counter contract walkthrough. We use:
- `hardhat-ethers` — ethers.js integration
- `hardhat-verify` — contract verification on Kitescan (if the explorer supports it)
- `@nomicfoundation/hardhat-toolbox` — all-in-one testing utilities

**OpenZeppelin Contracts 5.2**

Battle-tested building blocks:
- `IERC20` — for USDC interactions
- `Ownable` — access control on registry and marketplace
- `ReentrancyGuard` — on marketplace escrow functions
- `UUPSUpgradeable` — for the vault proxy pattern (matching Kite's ClientAgentVault)
- `ERC1967Proxy` — proxy standard for vault deployment

**Kite AA SDK (`gokite-aa-sdk`)**

The official Account Abstraction SDK from Kite. Used for:
- Creating AA wallets (smart contract wallets) for agents
- Submitting UserOperations to the bundler (gasless transactions)
- Managing session keys on ClientAgentVault contracts

## x402 Payments

**@anthropic-ai/x402 (or Coinbase x402 packages)**

The x402 implementation. Specifically:
- `x402-express` — Express middleware that returns 402 with payment requirements
- `x402-client` — Client library that the MCP server uses to sign x402 payments on behalf of agents
- EIP-3009 signature generation using ethers.js

If official x402 npm packages aren't published yet (Kite's docs say "in progress"), we implement the protocol directly. It's four steps: return 402 with JSON payment requirements, agent signs TransferWithAuthorization, retry with X-PAYMENT header, verify and settle. The Coinbase GitHub repo has reference TypeScript implementations we can adapt.

## Auth

**SIWE (Sign-In with Ethereum) via `siwe` 2.4**

User connects wallet → signs a message → API verifies signature → issues JWT. Standard pattern. No username/password, no OAuth — wallet-native auth for a wallet-native platform.

**jose 6.0**

JWT creation and verification. Lightweight, standard-compliant, no dependencies.

## DevOps / Deployment

**Vercel** — Dashboard (Next.js) deployment. Free tier. Instant preview deploys for demo iteration.

**Railway or Render** — API server and MCP server. Needs a persistent process (Socket.IO, event indexer). Vercel's serverless functions can't do WebSockets. Railway's free tier supports persistent Node processes.

**Docker** — Optional Dockerfile for self-hosting the entire stack. Required by the bounty for CLI tool reproducibility. Single `docker-compose.yml` that spins up: API server, MCP server, and a lightweight SQLite volume.

## Testing

**Vitest 3.0** — Unit tests for API routes, MCP tool handlers, x402 payment logic, vault rule validation. Fast, TypeScript-native, compatible with the Node ecosystem.

**Hardhat test runner (Mocha + Chai)** — Smart contract tests. Deploy to a local Hardhat network, simulate agent purchases, verify vault rule enforcement, test escrow flows.

No E2E testing framework. For a hackathon demo, manual testing of the full flow is more efficient than writing Playwright tests.

## Tooling

**pnpm 9.15** — Package manager. Workspace support for the monorepo. Faster than npm, stricter than yarn. One lockfile for the entire repo.

**Turborepo 2.4** — Monorepo build orchestration. Caches builds, runs tasks in dependency order. `turbo run build` builds everything. `turbo run dev` starts everything.

**ESLint 9.x + Prettier** — Linting and formatting. Single config at repo root. No per-package configs.

**dotenv 16.4** — Environment variable loading. Each package has a `.env.example` with required variables documented.
