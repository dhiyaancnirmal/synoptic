# Backend Workstream

## Scope
Implement API, settlement, and observability layers for autonomous commerce/trading on Kite.

## Core Responsibilities
- API server with authenticated agent/user operations
- x402 handling (HTTP 402 challenge + `X-PAYMENT` retry)
- Facilitator integration (`/verify`, `/settle` style flow)
- On-chain execution and indexing
- Event publication to UI/runtime
- Persistence for agents, orders, settlements, and events

## Kite-Specific Requirements
- Testnet default: Chain ID 2368, RPC `https://rpc-testnet.gokite.ai/` ([Kite docs](https://docs.gokite.ai/kite-chain/1-getting-started/network-information))
- Testnet payment token: `0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63` ([Service Provider Guide](https://docs.gokite.ai/kite-agent-passport/service-provider-guide))
- AA SDK support for vault/session patterns ([AA SDK](https://docs.gokite.ai/kite-chain/account-abstraction-sdk))

## Failure-Mode Requirements
- Insufficient funds: reject gracefully, persist reason, publish event
- Invalid payment signature/header: reject and return actionable error
- Facilitator outage: retry with bounded backoff, then fail-safe halt

## Parallelization Boundary
- Backend publishes canonical REST/WebSocket/MCP contracts in `files/architecture/04_INTERFACE_CONTRACTS.md`.
- Backend owns versioning and changelog for interface changes.
