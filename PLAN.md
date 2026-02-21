# Synoptic Plan (Reality-Based)

Last updated: 2026-02-21

## Scope

Build one production-style, open-source application that can be submitted to all three bounties:

- Kite: agent-native x402 payments + verifiable agent identity + autonomous execution
- Uniswap: functional API integration for swaps
- QuickNode: Streams as primary data source for Monad data

## Canonical Requirement Files

Always plan from these first:

- `/Users/dhiyaan/Code/synoptic/bounties/kite-ai-agent-native-x402.md`
- `/Users/dhiyaan/Code/synoptic/bounties/uniswap-api-integration.md`
- `/Users/dhiyaan/Code/synoptic/bounties/quicknode-streams-monad.md`

External references used for implementation details:

- [QuickNode Streams docs](https://www.quicknode.com/docs/streams)
- [Uniswap Trading API overview](https://docs.uniswap.org/api/trading/overview)
- [Kite docs](https://docs.gokite.ai/)

## Product We Are Building

Synoptic is an agent-native trading workflow where an autonomous agent:

1. Authenticates with a verifiable wallet identity.
2. Pays for premium data/actions via x402 on Kite testnet.
3. Uses Uniswap API to build and execute spot swaps.
4. Uses QuickNode Streams on Monad as the primary blockchain data feed.
5. Shows identity, payment lifecycle, and on-chain confirmations in public UI/CLI.

## Current Code Reality

What is already implemented:

- Agent server with x402-gated endpoints:
- `GET /oracle/price`
- `POST /trade/quote`
- `POST /trade/execute`
- QuickNode webhook endpoint:
- `GET /webhooks/quicknode/monad`
- `POST /webhooks/quicknode/monad`
- Uniswap client and trade execution code in `packages/agent-core`.
- Kite facilitator + payment lifecycle handling in oracle middleware.
- ServiceRegistry contract and deploy script.
- Dashboard routes for agents, payments, trading, activity, streams.
- CLI package for wallet init, funding checks, start loop, and deploy helpers.

What still needs to be made bounty-strong:

- Explicit requirement-to-evidence mapping generated from final demo run.
- QuickNode Streams promoted from "extra event feed" to clear primary data source for Monad insight SKUs.
- Public demo runbook that judges can execute with minimal setup.
- Robust insufficient-funds/misuse messaging surfaced in UI and logs.

## Unified Bounty Strategy

## 1) Kite Bounty

Must prove:

- Verifiable agent identity
- x402 paid actions tied per API call
- Autonomous execution (no manual wallet clicks in execution path)
- On-chain settlement or attestation evidence

Implementation in this repo:

- Use Kite Passport identity as payer identity in x402 flow.
- Keep `oracle`, `quote`, `execute` all pay-per-action.
- Persist payment lifecycle events and show them in dashboard.
- Persist and show tx hashes for settlement and attestation.

## 2) Uniswap Bounty

Must prove:

- Functional Uniswap API integration on testnet/mainnet
- Public interface + open source

Implementation in this repo:

- Keep server-side Uniswap flow for quote/swap.
- Surface swap lifecycle in dashboard and CLI.
- Provide one reproducible end-to-end swap path with evidence.

## 3) QuickNode Bounty

Must prove:

- Streams is primary source of blockchain data
- Ingestion + transformation + delivery demonstrated

Implementation in this repo:

- Use Streams -> webhook -> transform -> DB -> dashboard as the canonical Monad data pipeline.
- Document and show stream config, filter, delivery logs, transformed rows, and UI output.
- Avoid framing Streams as optional telemetry.

## Implementation Plan

## Phase A - Canonical Docs and Planning Cleanup

- Keep only the three canonical bounty files in `bounties/`.
- Remove stale alternate tracks from planning docs.
- Keep `PLAN.md` concise and execution-focused.

## Phase B - Data Product Definition (Primary Streams Usage)

Define paid SKUs around transformed Monad data (from Streams):

- `sku_monad_transfers_watchlist`
- `sku_monad_contract_activity`
- `sku_monad_new_deploys`

Each paid call must map to one x402 payment event.

## Phase C - Backend Alignment

- Ensure QuickNode webhook is first-class data ingestion path.
- Add deterministic transforms and persistence shape for selected SKUs.
- Return graceful errors for invalid payment, insufficient funds, and missing approvals.

## Phase D - Demo UX and Evidence

- Dashboard must clearly show:
- Agent identity
- x402 challenge -> authorize -> settle lifecycle
- QuickNode-derived data updates
- Uniswap swap confirmations
- Add `docs/submission-checklist.md` with exact artifacts to capture.

## Phase E - Submission Hardening

- Verify public deploy URLs work.
- Verify README reproducibility path works from clean clone.
- Capture final logs/screenshots and tx links for all three bounties.

## Acceptance Criteria

A run is complete when all are true:

1. Agent triggers paid action and receives `402` challenge.
2. Agent settles payment and retries automatically.
3. Requested paid data/action is returned and logged.
4. QuickNode Streams event is ingested, transformed, stored, and visible in UI.
5. Uniswap quote and swap execute through integrated API path.
6. Explorer links for relevant tx hashes are present in artifacts.
7. Demo is publicly accessible or fully reproducible from README.

## Evidence Pack Layout

Store final evidence under:

- `/Users/dhiyaan/Code/synoptic/artifacts/evidence/final/<timestamp-utc>/`

Include:

- `SUMMARY.md`
- `kite-payment-flow.log`
- `uniswap-swap.log`
- `quicknode-streams.log`
- `screenshots/` (identity, payments, streams, trading, activity)
- `tx-links.md` (Kite + Monad explorer URLs)

## Non-Goals

- No speculative multi-chain expansion until the three-bounty core is complete.
- No new architecture branches unless they map directly to current bounty requirements.

## Working Rules

- Build against testnet-first realities.
- Keep core components open source (MIT/Apache).
- Any new task must map to at least one requirement line in canonical bounty docs.
