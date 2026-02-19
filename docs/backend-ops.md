# Backend Operations Runbook

## Purpose
Operational guidance for the Synoptic API backend failure modes and recovery actions.

## Common Error Codes
- `UNAUTHORIZED`: Missing or invalid bearer token.
- `FORBIDDEN`: Token principal does not match target resource.
- `NOT_FOUND`: Missing agent/order resource.
- `VALIDATION_ERROR`: Request shape issue or idempotency payload mismatch.
- `PAYMENT_REQUIRED`: Missing/invalid `X-PAYMENT` challenge state.
- `INVALID_PAYMENT`: Payment header is syntactically valid but rejected.
- `FACILITATOR_UNAVAILABLE`: Payment provider timeout/network/server failure.
- `INTERNAL_ERROR`: Unclassified server failure.

## `details` Payload Fields
- `reason`: machine-readable failure class (for dashboards/alerts).
- `retryable`: whether clients should retry the same request.

## Recovery Steps by Failure Mode

### Database Not Ready / Migrations Missing
Symptoms:
- API startup fails with migration guidance.
- `/health` returns `degraded` and `dependencies.database=down`.

Actions:
1. Verify connectivity to `DATABASE_URL`.
2. Run `pnpm --filter @synoptic/api prisma:migrate:deploy`.
3. Re-check with `pnpm --filter @synoptic/api prisma:migrate:status`.
4. Restart API.

### Invalid Payment / 402 Challenges
Symptoms:
- `PAYMENT_REQUIRED` responses on paid endpoints.

Actions:
1. Ensure client sends `X-PAYMENT` header.
2. Verify payment payload format and signature prefix policy.
3. Confirm token/asset/network fields match server requirement block.

### Facilitator Outage
Symptoms:
- `FACILITATOR_UNAVAILABLE` with `details.retryable=true`.

Actions:
1. Validate payment provider URL and auth configuration.
2. Check upstream availability and timeout settings (`PAYMENT_PROVIDER_TIMEOUT_MS` or `FACILITATOR_TIMEOUT_MS`).
3. Increase temporary retries (`PAYMENT_RETRY_ATTEMPTS`) only if upstream is degraded but responsive.
4. Retry from client side with bounded exponential backoff.

### Idempotency Conflicts
Symptoms:
- `VALIDATION_ERROR` with reason `IDEMPOTENCY_KEY_PAYLOAD_MISMATCH`.

Actions:
1. Reuse idempotency key only with identical payload.
2. Generate a new key for a modified request.

## Index/Query Checklist
- `Order`: indexed by `agentId`, `createdAt`.
- `Event`: indexed by `agentId`, `timestamp`.
- `IdempotencyKey`: indexed by `route`, primary key on `key`.

## Alerting Recommendations
- Alert on sustained `FACILITATOR_UNAVAILABLE` rates from payment provider dependency.
- Alert on migration startup failures in deploy pipelines.
- Alert on elevated `PAYMENT_REQUIRED` rates (possible client regression).
