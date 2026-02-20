# Interface Contracts (Frozen)

## Policy
No breaking schema change is allowed without:
1. Version bump
2. Changelog entry
3. Downstream migration note

## REST Endpoints (v1)
- `POST /auth/siwe/challenge`
- `POST /auth/siwe/verify`
- `POST /auth/passport/exchange`
- `POST /agents`
- `GET /agents`
- `GET /agents/:agentId`
- `POST /markets/quote` (paid/x402-protected where configured)
- `POST /markets/execute` (paid/x402-protected where configured)
- `GET /orders/:orderId`
- `GET /events?agentId=...`
- `POST /shopify/catalog/search` (auth-protected; backend proxy to Shopify Catalog API)
- `GET /shopify/catalog/product/:upid` (auth-protected; backend proxy to Shopify Catalog API)

### REST Behavioral Clarifications (v1, non-breaking)
- `POST /markets/execute` idempotency behavior:
  - Same `idempotency-key` + identical payload returns the original `MarketExecuteResponse`.
  - Same `idempotency-key` + different payload returns `409` with `code=IDEMPOTENCY_CONFLICT`.
- API error payload `details` may include:
  - `reason` (machine-readable failure class)
  - `retryable` (boolean for transient payment-provider/network failures)
- Auth mode behavior:
  - `AUTH_MODE=passport` enables `POST /auth/passport/exchange` and disables SIWE routes.
  - `AUTH_MODE=siwe` enables SIWE routes and disables Passport exchange route.
  - `AUTH_MODE=dev` keeps local SIWE bootstrap behavior for non-production only.
- `POST /markets/execute` response may include optional `evidence` linkage ids:
  - `idempotencyKey`
  - `quoteId`
  - `orderId`
  - `settlementId`

## WebSocket Events (v1)
- `agent.created`
- `x402.challenge.issued`
- `x402.payment.settled`
- `trade.executed`
- `trade.rejected`
- `risk.limit.hit`
- `bridge.submitted`
- `bridge.confirmed`
- `bridge.failed`
- `trade.swap.submitted`
- `trade.swap.confirmed`
- `trade.swap.failed`

Each event payload must include:
- `eventId` (string)
- `agentId` (string)
- `timestamp` (ISO-8601)
- `status` (enum)
- `metadata` (object)

## MCP Tools (v1)
- `synoptic.identity.status`
- `synoptic.market.list`
- `synoptic.trade.quote`
- `synoptic.trade.execute`
- `synoptic.order.status`
- `synoptic.autonomy.start`
- `synoptic.autonomy.stop`

## CLI Commands (v1)
- `synoptic operator agent create`
- `synoptic operator agent list`
- `synoptic operator monitor --agent <id>`
- `synoptic agent once --agent <id> --strategy <name>`
- `synoptic agent run --agent <id> --interval <duration> --strategy <name>`
- `synoptic agent stop --agent <id>`

## Contributor Contract
- Frontend consumes published interfaces only.
- Backend owns publication/versioning.
- Agent runtime aligns to same REST/MCP/WebSocket contracts.
