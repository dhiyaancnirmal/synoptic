# Pending Items / Parking Lot

## Decisions parked by request
- Payment provider remains mock mode for now (`PAYMENT_PROVIDER_URL=mock://facilitator`).
- Shopify integration mode is both REST and MCP.

## Secrets and environment follow-ups
- Shopify client credentials are set locally in untracked env files.
- Before production use, rotate credentials that were shared via chat.

## Local integration test setup reminder
- To run API integration tests locally, set `TEST_DATABASE_URL` or `DATABASE_URL`.
- CI runs integration tests with a managed Postgres service on every push.

## Existing unrelated workspace changes observed
- Dashboard files are changing in parallel with backend work.
- Keep commit hygiene by separating backend and dashboard changes when requested.
