# Synoptic Monorepo (Bootstrap)

Synoptic is a docs-first TypeScript monorepo scaffold for a dashboard, API, MCP server, CLI, shared types, smart contracts, and OpenClaw skill package.

## Architecture Summary
- `apps/dashboard`: Next.js shell for human visibility.
- `apps/api`: Express + Socket.IO shell.
- `apps/mcp-server`: MCP tool host shell.
- `apps/cli`: operator/agent command shell.
- `packages/types`: frozen contract-first shared interfaces.
- `packages/contracts`: Solidity/Hardhat scaffold.
- `packages/openclaw-skill`: OpenClaw skill scaffold.
- `packages/config`: shared ESLint/Prettier/tsconfig presets.

## Workspace Map
- `apps/*` executable services and UI
- `packages/*` shared libraries, contracts, and skill assets
- `docker/` local runtime containers
- `.github/workflows/` CI automation
- `files/` canonical architecture and workstream docs

## Quickstart
```bash
corepack enable
corepack prepare pnpm@9.15.4 --activate
nvm use
pnpm install
pnpm dev
```

Node requirement: use Node `22.x` (Hardhat is not supported on Node `25.x`).

## Environment Setup
Copy examples to real env files where needed:
- `apps/api/.env.example`
- `apps/dashboard/.env.example`
- `apps/mcp-server/.env.example`
- `apps/cli/.env.example`
- `packages/contracts/.env.example`

## Command Matrix
- `pnpm dev` run all services in watch/dev mode
- `pnpm lint` run lint across workspaces
- `pnpm typecheck` run TypeScript checks
- `pnpm test` run scaffold tests
- `pnpm build` build all workspaces
- `pnpm --filter @synoptic/api dev:setup` apply migrations + seed data for local API
- `pnpm --filter @synoptic/contracts compile` compile contracts
- `pnpm --filter @synoptic/api prisma:migrate:deploy` apply API DB migrations
- `pnpm --filter @synoptic/api test:integration` run API Postgres integration tests

## Backend Reliability Test Flow
1. Start Postgres (for local defaults: `docker compose -f docker/docker-compose.yml up -d postgres`).
2. Ensure `apps/api/.env` has valid `DATABASE_URL`.
3. Run migrations: `pnpm --filter @synoptic/api prisma:migrate:deploy`.
4. Run integration suite: `pnpm --filter @synoptic/api test:integration`.

Note:
- Payment verification/settlement endpoint is configured as a generic provider URL.
- Use `PAYMENT_PROVIDER_URL` (preferred) or `FACILITATOR_URL` (backward-compatible alias).
- Override facilitator paths with `PAYMENT_PROVIDER_VERIFY_PATH`/`PAYMENT_PROVIDER_SETTLE_PATH`
  (or `FACILITATOR_VERIFY_PATH`/`FACILITATOR_SETTLE_PATH`) for real Passport deployments.
- `AUTH_MODE=passport` is the production-first path and requires `PASSPORT_VERIFY_URL`.
- `AUTH_MODE=siwe` keeps wallet signature verification available for fallback/testing.
- `AUTH_MODE=dev` is for local bootstrap only and is rejected in production.
- `PAYMENT_MODE=http` is required (Passport facilitator flow only).
- Only spot execution is enabled in this release.

## Agent-Native Runtime Bootstrap
- API token resolution order in CLI/MCP:
  1. `SYNOPTIC_API_TOKEN`
  2. Passport exchange via `/auth/passport/exchange` using:
     - `SYNOPTIC_PASSPORT_TOKEN`
     - `SYNOPTIC_AGENT_ID`
     - `SYNOPTIC_OWNER_ADDRESS`
- x402 header resolution order in CLI/MCP/dashboard demo:
  1. explicit `xPayment` argument/flag
  2. static `SYNOPTIC_X_PAYMENT`/`SYNOPTIC_DEMO_X_PAYMENT`
  3. mint endpoint:
     - `SYNOPTIC_X402_MINT_URL`
     - `SYNOPTIC_X402_MINT_TOKEN`

This keeps runtime flows autonomous while preserving manual overrides for debugging.

## Interface Governance
Interface contracts are frozen by policy in `files/architecture/04_INTERFACE_CONTRACTS.md`.
Breaking changes require semver bump + changelog + migration note.

## Current Bounty Tracks
- Kite AI bounty (primary):
  - `/Users/dhiyaan/Code/synoptic/files/bounty/KITE_AI_BOUNTY_2026.md`
- Uniswap Foundation bounty (add-on):
  - `/Users/dhiyaan/Code/synoptic/files/bounty/UNISWAP_FOUNDATION_BOUNTY_2026.md`
- Unified delivery tracker:
  - `/Users/dhiyaan/Code/synoptic/files/bounty/PROGRESS_TRACKER.md`
