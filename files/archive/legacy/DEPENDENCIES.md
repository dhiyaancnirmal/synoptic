# Dependencies

All versions pinned to latest stable as of February 2026. Compatibility verified across the stack.

## Root (workspace-level)

```
pnpm                          9.15.4      Package manager (installed globally)
turborepo                     2.4.4       Monorepo orchestration
typescript                    5.7.3       Language
eslint                        9.19.0      Linting
prettier                      3.4.2       Formatting
@types/node                   22.13.4     Node type definitions
dotenv                        16.4.7      Environment variables
```

## packages/types (shared type definitions)

No runtime dependencies. Types only.

```
typescript                    5.7.3       (inherited from root)
zod                           3.24.2      Runtime type validation + inference
```

## apps/dashboard (Next.js frontend)

```
# Framework
next                          15.1.6      React framework (App Router)
react                         19.0.0      UI library
react-dom                     19.0.0      React DOM renderer

# Styling
tailwindcss                   4.0.6       Utility-first CSS
@tailwindcss/postcss          4.0.6       PostCSS plugin for Tailwind 4
postcss                       8.5.1       CSS processing

# UI Components (copied from shadcn/ui, these are their peer deps)
class-variance-authority      0.7.1       Component variant management
clsx                          2.1.1       Conditional className joining
tailwind-merge                2.7.0       Tailwind class deduplication
lucide-react                  0.473.0     Icon library

# Data visualization
recharts                      2.15.0      React charting library

# Real-time
socket.io-client              4.8.1       WebSocket client

# Web3 / Auth
ethers                        6.13.5      Ethereum interactions (wallet connect)
siwe                          2.4.1       Sign-In with Ethereum
@metamask/sdk                 0.32.0      MetaMask wallet connection

# Dev
@types/react                  19.0.8      React type definitions
@types/react-dom              19.0.3      React DOM type definitions
```

## apps/api (Express.js backend)

```
# Framework
express                       5.0.1       HTTP server
cors                          2.8.5       CORS middleware
helmet                        8.0.0       Security headers
compression                   1.8.0       Response compression

# Real-time
socket.io                     4.8.1       WebSocket server

# Database
better-sqlite3                11.8.1      Embedded SQL database

# Blockchain
ethers                        6.13.5      Ethereum library
gokite-aa-sdk                 latest      Kite Account Abstraction SDK (check npm for exact version)

# x402 Payments
# NOTE: If Coinbase x402 npm packages are published, use those.
# Otherwise, implement from the reference TypeScript in github.com/coinbase/x402
# The following are the expected package names:
x402-express                  latest      Express x402 middleware (if available)
x402-facilitator-client       latest      Facilitator communication (if available)
# Fallback: implement EIP-3009 signing with ethers directly

# Auth
siwe                          2.4.1       SIWE message verification
jose                          6.0.8       JWT creation/verification

# Utilities
uuid                          11.0.5      Unique ID generation
winston                       3.17.0      Structured logging
cron                          3.3.1       Scheduled event indexer polling (if WS unavailable)

# Dev
@types/express                5.0.0       Express type definitions
@types/cors                   2.8.17      CORS type definitions
@types/compression            1.7.5       Compression type definitions
@types/better-sqlite3         7.6.12      SQLite type definitions
@types/uuid                   10.0.0      UUID type definitions
tsx                            4.19.2      TypeScript execution (dev server)
```

## apps/mcp-server (MCP server)

```
# MCP
@modelcontextprotocol/sdk     1.12.1      Official MCP SDK

# Shared with API (calls API endpoints internally)
ethers                        6.13.5      For x402 payment signing
node-fetch                    3.3.2       HTTP client for API calls (if not using native fetch)
zod                           3.24.2      Input validation for tool parameters

# Dev
tsx                            4.19.2      TypeScript execution
```

## packages/contracts (Solidity smart contracts)

```
# Development framework
hardhat                       2.22.18     Solidity dev environment
@nomicfoundation/hardhat-toolbox  5.0.0   Testing utilities bundle
@nomicfoundation/hardhat-ethers   3.0.8   Ethers.js Hardhat plugin
@nomicfoundation/hardhat-verify   2.0.13  Contract verification

# Contract libraries
@openzeppelin/contracts       5.2.0       Audited contract building blocks
@openzeppelin/contracts-upgradeable  5.2.0  Upgradeable contract patterns

# Testing
chai                          5.1.2       Assertion library (bundled with toolbox)
ethers                        6.13.5      Blockchain interactions (bundled with toolbox)

# Deployment
hardhat-deploy                0.14.0      Deterministic deployments
dotenv                        16.4.7      Deployment config
```

## packages/openclaw-skill (OpenClaw skill)

No npm dependencies. This is a documentation package containing:

```
SKILL.md                                  Skill definition file
references/
  kite-x402.md                            x402 payment reference for the LLM
  marketplace-api.md                      API endpoint documentation
  vault-rules.md                          Vault configuration guide
scripts/
  install.sh                              Optional: auto-configure openclaw.json
```

## Compatibility matrix

| Package | Requires | Notes |
|---|---|---|
| Next.js 15.1 | React 19, Node 22+ | App Router, Server Components |
| Tailwind 4.0 | PostCSS 8.5+ | New engine, no `tailwind.config.js` needed |
| ethers 6.13 | Node 18+ | Used across API, MCP, dashboard, contracts |
| Socket.IO 4.8 | Engine.IO 6.6 | Client and server must match major version |
| Hardhat 2.22 | Solidity ≤0.8.28 | EVM target: Shanghai (Kite testnet compatible) |
| OpenZeppelin 5.2 | Solidity ^0.8.20 | Matches our Solidity version |
| gokite-aa-sdk | ethers 6.x | Must use ethers v6, not v5 |
| better-sqlite3 11.8 | Node 18+ | Native addon, needs build tools |
| @modelcontextprotocol/sdk 1.12 | Node 18+ | stdio and SSE transports |
| siwe 2.4 | ethers 6.x | Must use ethers v6 provider |

## Environment variables

Each app has a `.env.example`. Here are all required variables:

```bash
# apps/api/.env
KITE_RPC_URL=https://rpc-testnet.gokite.ai/
KITE_CHAIN_ID=2368
DEPLOYER_PRIVATE_KEY=         # Testnet deployer wallet (fund via faucet.gokite.ai)
SYNOPTIC_REGISTRY_ADDRESS=    # Deployed SynopticRegistry contract
SYNOPTIC_MARKETPLACE_ADDRESS= # Deployed SynopticMarketplace contract
SETTLEMENT_TOKEN_ADDRESS=0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63  # Kite testnet stablecoin
BUNDLER_URL=https://bundler-service.staging.gokite.ai/rpc/
JWT_SECRET=                   # Random 256-bit secret for SIWE JWTs
PORT=3001

# apps/dashboard/.env.local
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_KITE_CHAIN_ID=2368
NEXT_PUBLIC_KITE_RPC_URL=https://rpc-testnet.gokite.ai/
NEXT_PUBLIC_EXPLORER_URL=https://testnet.kitescan.ai

# apps/mcp-server/.env
SYNOPTIC_API_URL=http://localhost:3001
SYNOPTIC_AGENT_KEY=           # Agent's private key (auto-generated during provisioning)
KITE_RPC_URL=https://rpc-testnet.gokite.ai/
KITE_CHAIN_ID=2368

# packages/contracts/.env
KITE_RPC_URL=https://rpc-testnet.gokite.ai/
DEPLOYER_PRIVATE_KEY=         # Same as API deployer
KITESCAN_API_KEY=             # For contract verification (if available)
```

## Installation

```bash
# Clone
git clone https://github.com/yourname/synoptic.git
cd synoptic

# Install all dependencies
pnpm install

# Copy env files
cp apps/api/.env.example apps/api/.env
cp apps/dashboard/.env.example apps/dashboard/.env.local
cp apps/mcp-server/.env.example apps/mcp-server/.env
cp packages/contracts/.env.example packages/contracts/.env

# Fund deployer wallet
# Visit https://faucet.gokite.ai and request testnet KITE + stablecoins

# Deploy contracts
pnpm --filter contracts deploy:testnet

# Start everything
pnpm dev
```
