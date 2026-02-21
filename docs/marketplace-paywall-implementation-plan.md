# Marketplace Paywall Implementation Plan

Last updated: 2026-02-21

## Why This Is Required (Not Optional)

This marketplace paywall is the clearest way to satisfy all three bounties with one coherent product:

- Kite requires x402 payments tied to actions, autonomous flow, verifiable identity, and clear failure handling.
- Uniswap requires a functional API-integrated swap experience.
- QuickNode requires Streams as the primary blockchain data source with ingestion, transformation, and delivery.

Without a paid product boundary, x402 can look like a demo-only payment wrapper. A marketplace of derived data SKUs makes the payment-to-action mapping explicit and auditable per request, which is exactly what judges ask for.

## Product Shape

Add a `Marketplace` tab where agents or users can:

1. View data products (catalog + previews).
2. Purchase a SKU via x402.
3. Receive derived Monad data generated from QuickNode Streams.
4. See purchase receipts, payment lifecycle, and on-chain settlement links.

## Core Derived Data SKUs

## SKU 1: `sku_monad_transfers_watchlist`

- Input: wallet and contract watchlists.
- Output: normalized transfer events with labels and amounts.
- Source of truth: QuickNode Streams Monad webhook events.

## SKU 2: `sku_monad_contract_activity`

- Input: contract list + time window.
- Output: tx count, fail rate, active callers, gas stats.
- Source of truth: transformed stream records.

## SKU 3: `sku_monad_new_deploys`

- Input: window + optional bytecode size filters.
- Output: newly deployed contracts + first activity metadata.
- Source of truth: streamed block/receipt data.

## End-to-End Flow

1. Client requests paid SKU endpoint.
2. Server returns `402 Payment Required` challenge with SKU-specific resource metadata.
3. Agent approves x402 payment via Kite MCP and retries with `x-payment`.
4. Server verifies and settles through facilitator.
5. Server returns derived data + receipt payload.
6. Dashboard shows payment lifecycle and purchase result.

Every successful purchase is linked to:

- `paymentId`
- `purchaseId`
- `sku`
- `kite settlement tx hash`
- response hash/checksum

## Architecture and Code Changes

## 1) Backend API (Agent Server)

Add new routes under `/marketplace` and canonical API routes under `/api/marketplace`.

New route file:

- `/Users/dhiyaan/Code/synoptic/apps/agent-server/src/routes/marketplace.ts`

Register in:

- `/Users/dhiyaan/Code/synoptic/apps/agent-server/src/server.ts`

Endpoints:

- `GET /marketplace/catalog` (free)
- `GET /marketplace/products/:sku/preview` (free, limited)
- `POST /marketplace/products/:sku/purchase` (x402 paywall)
- `GET /api/marketplace/purchases` (history)
- `GET /api/marketplace/purchases/:id` (receipt)

## 2) x402 Middleware Refactor

Current middleware hardcodes oracle resource path. Refactor to be reusable by product/SKU.

Edit:

- `/Users/dhiyaan/Code/synoptic/apps/agent-server/src/oracle/middleware.ts`

Add configurable options:

- `resourcePath`
- `merchantName`
- `description`
- `amountUsdResolver`
- `metadata` (e.g., `sku`, query hash)

This keeps one consistent payment lifecycle while supporting oracle, trade, and marketplace purchases.

## 3) Data Pipeline (QuickNode Streams -> Derived Tables)

Keep Streams as primary source and formalize ETL.

Edit:

- `/Users/dhiyaan/Code/synoptic/apps/agent-server/src/routes/quicknode.ts`

Add two-stage storage:

- raw ingest record
- transformed derived records

Proposed tables:

- `stream_events_raw`
- `derived_transfers`
- `derived_contract_activity`
- `derived_new_deploys`

## 4) Database Schema and Repos

Edit schema:

- `/Users/dhiyaan/Code/synoptic/packages/db/src/schema.ts`

Add tables:

- `marketplace_products` (catalog metadata, price, enabled)
- `marketplace_purchases` (agentId, sku, params, status, paymentId, result hash)
- derived tables listed above

Add repos:

- `/Users/dhiyaan/Code/synoptic/packages/db/src/repos/marketplace-repo.ts`
- `/Users/dhiyaan/Code/synoptic/packages/db/src/repos/streams-repo.ts`

Wire repos:

- `/Users/dhiyaan/Code/synoptic/packages/db/src/repos/index.ts`
- `/Users/dhiyaan/Code/synoptic/apps/agent-server/src/state/db-runtime-store.ts`

## 5) Dashboard Marketplace Tab

Add route and nav item.

Edit nav:

- `/Users/dhiyaan/Code/synoptic/apps/dashboard/components/dashboard/RouteSidebarNav.tsx`

Add page:

- `/Users/dhiyaan/Code/synoptic/apps/dashboard/app/marketplace/page.tsx`

Add client component:

- `/Users/dhiyaan/Code/synoptic/apps/dashboard/components/dashboard/routes/MarketplaceRouteClient.tsx`

Add API client methods:

- `/Users/dhiyaan/Code/synoptic/apps/dashboard/lib/api/client.ts`

UI must clearly show:

- product catalog
- purchase status
- settlement tx link
- response preview
- graceful failures (insufficient funds, invalid payment, unavailable SKU)

## 6) CLI Support (Optional but Strong)

Add marketplace commands to `@synoptic/agent`:

- `catalog`
- `buy --sku <id> --params ...`
- `purchases`

Edit:

- `/Users/dhiyaan/Code/synoptic/packages/agent-cli/src/index.ts`
- `/Users/dhiyaan/Code/synoptic/packages/agent-cli/src/commands/*`
- `/Users/dhiyaan/Code/synoptic/packages/agent-cli/src/api-client.ts`

## 7) Types and Contracts

Add shared types for marketplace payloads:

- `/Users/dhiyaan/Code/synoptic/packages/types/src/marketplace.ts`
- export via `/Users/dhiyaan/Code/synoptic/packages/types/src/index.ts`

Add VM mappers in dashboard for marketplace rows.

## Security and Abuse Controls

Must-have controls for judging criteria:

- SKU-specific scopes and parameter validation.
- Rate limiting per session/agent for paid endpoints.
- Result size caps and query window caps.
- Idempotency keys on purchase endpoint.
- Explicit error taxonomy:
- `PAYMENT_VERIFY_FAILED`
- `PAYMENT_SETTLEMENT_FAILED`
- `INSUFFICIENT_FUNDS`
- `SKU_NOT_FOUND`
- `SKU_PARAMS_INVALID`

## Data Integrity and Reorg Handling

QuickNode streams can replay/restream in edge cases. Add idempotent ingestion:

- unique keys on source identifiers (`blockNumber`, `txHash`, `logIndex`)
- upsert transforms
- track ingest cursor/sequence where available

This avoids duplicate billable results and keeps receipt hashes deterministic.

## Test Plan

## Backend Integration Tests

Add tests similar to existing patterns:

- `apps/agent-server/src/integration/marketplace.integration.test.ts`
- verify `402` challenge on unpaid purchase
- verify settle + delivery on paid purchase
- verify failure messaging on invalid payment

## Dashboard Tests

- load marketplace tab and render catalog
- execute mocked purchase lifecycle
- verify links and failure states

## Data Pipeline Tests

- webhook ingestion stores raw + transformed records
- SKU query reads from derived tables (not fallback RPC)

## Evidence and Demo Pack

Add checklist artifacts for judges:

- `catalog screenshot`
- `402 -> payment -> success log for purchase`
- `Kite settlement tx link`
- `QuickNode stream config screenshot`
- `proof that SKU payload came from derived tables`

Store under:

- `/Users/dhiyaan/Code/synoptic/artifacts/evidence/final/<timestamp-utc>/`

## Phased Delivery

## Phase 1 (Foundation)

- Marketplace routes (catalog/preview/purchase)
- middleware refactor for generic x402 resource
- DB schema for products/purchases

## Phase 2 (Data Products)

- QuickNode transform pipeline
- derived tables + query layer
- SKU payload builders

## Phase 3 (UI/CLI)

- Marketplace tab and purchase UX
- API client updates
- optional CLI buy flow

## Phase 4 (Hardening)

- full test coverage
- error messaging and abuse controls
- final evidence runbook and artifact generation

## Acceptance Criteria (Ship Gate)

1. At least one derived SKU can only be retrieved after successful x402 payment.
2. Each paid request maps to exactly one payment record and one purchase record.
3. Returned payload references transformed QuickNode Streams data.
4. Marketplace tab shows identity, payment status, and on-chain confirmation.
5. Insufficient funds and invalid payment paths are demonstrated with graceful failures.
6. Demo works via public URL and open-source repo instructions.
