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

## Kite AI bounty track (primary)
- Identity story is now Passport-first with SIWE fallback for local/dev compatibility.
- Run at least one live facilitator-backed payment cycle and capture verify/settle references.
- Capture autonomous execution evidence showing no per-action manual wallet interaction.
- Publish a public demo URL and lock a final evidence pass.
- Reference matrix: `/Users/dhiyaan/Code/synoptic/files/bounty/KITE_AI_BOUNTY_2026.md`.

## Uniswap Foundation bounty track (new)
- Ensure public judge-facing URL + open-source documentation path is maintained.
- Complete and attach evidence pack for API usage + onchain transaction proof.
- Reference plan: `/Users/dhiyaan/Code/synoptic/files/bounty/UNISWAP_FOUNDATION_BOUNTY_2026.md`.
