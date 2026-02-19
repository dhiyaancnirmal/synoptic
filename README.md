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
pnpm install
pnpm dev
```

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
- `pnpm --filter @synoptic/contracts compile` compile contracts

## Interface Governance
Interface contracts are frozen by policy in `files/architecture/04_INTERFACE_CONTRACTS.md`.
Breaking changes require semver bump + changelog + migration note.
