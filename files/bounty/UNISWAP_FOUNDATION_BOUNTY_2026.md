# Uniswap Foundation Bounty 2026: Synoptic Execution Plan

## Source Note
This brief is based on user-provided bounty details in this repository thread.

## Bounty Summary
- Category: Feature Usage
- Total Prize: $5,000
- Winners: 2
- 1st: $3,000
- 2nd: $2,000
- Core requirement: build a functional app/agent on testnet or mainnet that integrates the Uniswap API.

## Judging-Relevant Requirements
- Functional on testnet/mainnet.
- Must integrate Uniswap API (Developer Platform).
- Public URL interface for judges.
- Open-source codebase.
- Clear use case and performance, close to shipped MVP.

## Current Synoptic Baseline (What We Already Have)
- Live swap orchestration path in API:
  - bridge (Kite -> Base Sepolia) + Uniswap v3 execution adapters.
- Uniswap API mode is implemented with fallback behavior:
  - API-backed quote/swap path when `UNISWAP_API_KEY` is present.
  - deterministic fallback to direct `viem` execution when configured as `api_fallback`.
- Execution telemetry is propagated through:
  - quote/execute REST responses, trade events, and dashboard trading evidence views.
- Agent-facing interfaces already exist:
  - REST API, MCP tools, CLI commands, Dashboard.
- Evidence and runbook scaffolding already exists:
  - `/Users/dhiyaan/Code/synoptic/files/bounty/DEMO_RUNBOOK.md`
  - `/Users/dhiyaan/Code/synoptic/files/bounty/EVIDENCE.md`

## Gap to Close for This Bounty
Main remaining gap is now live proof and submission polish:
- run with a real Uniswap Developer Platform key in a public demo environment
- execute and record real on-chain swaps with request ids and tx hashes
- publish judge-facing URL and finalized evidence artifacts

## Uniswap API-First Upgrade Plan

### 1) Add Uniswap Developer Platform Integration
- Status: `COMPLETE (code path integrated)`
- Env vars in API and dashboard:
  - `UNISWAP_API_BASE_URL`
  - `UNISWAP_API_KEY`
  - `UNISWAP_API_CHAIN_ID`
- Quote and execute paths include API quote/swap requests and signed transaction submission.

### 2) Keep Deterministic Fallback for Reliability
- Status: `COMPLETE`
- Existing direct adapter remains fallback when API is unavailable.
- `executionSource` is persisted across responses/events:
  - `UNISWAP_API` or `DIRECT_VIEM`.
- Dashboard now surfaces execution-source counts and request-id evidence.

### 3) Make Bounty Compliance Obvious in UX
- Status: `IN PROGRESS`
- Dashboard shows:
  - Uniswap execution mode and API readiness from `/health`.
  - quote/swap request id traces and execution source per trade event.
- Remaining:
  - add one-click “judge scenario” flow that fires a canonical test trade from UI.

### 4) Harden Demo Story
- Publish a public judge URL for dashboard + minimal swap controls.
- Include one-click demo mode for testnet swap submission.
- Record evidence in `/Users/dhiyaan/Code/synoptic/files/bounty/EVIDENCE.md` with:
  - API quote response references
  - transaction build/sign references
  - onchain tx hashes and explorer links

### 5) Ship Open Source + Submission-Ready Artifacts
- Keep repo public with setup instructions.
- Add a short "Judge Quickstart" section in README.
- Provide demo video + runbook + known limitations.

## Highest-ROI Differentiators (Creative Use)
- Agent policy mode:
  - "Swap only when quote impact < X bps and daily risk budget remains."
- Dual-domain agent:
  - uses Shopify catalog intent + Uniswap API execution for automated purchase conversion flow.
- Explainability:
  - for each trade, render why execution happened, what risk checks passed, and why route/source selected.

## Acceptance Checklist Before Submission
- [ ] Uniswap API key generated via Developer Platform and used in live flow.
- [ ] Successful swap on testnet/mainnet from Synoptic interface.
- [ ] Public URL available for judges.
- [ ] Open-source repo with reproducible setup.
- [ ] Evidence pack completed with API + chain proof.
