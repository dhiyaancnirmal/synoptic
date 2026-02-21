# Agent CLI: Current State and Required Work

Last updated: 2026-02-21

## Purpose

`@synoptic/agent` is the operator interface for autonomous execution:

- manage agent wallet
- run autonomous loop
- interact with x402-gated Synoptic endpoints
- support deployment setup tasks

## What Exists

Implemented command surface:

- `init`
- `fund`
- `start`
- `status`
- `export-key`
- `deploy-key`
- `deploy-contract`

Implemented support modules:

- wallet storage and loading
- x402 auto-retry API client
- Kite MCP detection and instructions
- trading loop and logging

## What Must Be True for Bounty-Ready CLI

- CLI can run end-to-end without manual wallet signing during execution loop.
- Paid API calls map to x402 lifecycle logs that match backend records.
- Errors are explicit for:
- insufficient funds
- invalid/missing payment token
- unavailable MCP integration
- README has one clean quickstart path for judges.

## Required Validation

Run:

```bash
nvm use 22.22.0
pnpm --filter @synoptic/agent test
bash scripts/p0-p1-evidence-harness.sh
```

Collect from one run:

- CLI logs showing x402 payment + retry
- server logs showing corresponding settlement lifecycle
- tx links for executed swap and attestation

## Out of Scope

- New CLI feature expansion unrelated to current bounty requirements
- Alternate chain strategies not tied to Kite + Uniswap + Monad Streams path
