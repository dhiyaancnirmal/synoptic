# Synoptic Bounty Evidence Pack

## Submission Status
- Identity mode target: `AUTH_MODE=passport` + `/auth/passport/exchange`
- Trading path target: Kite testnet payment -> bridge to Base Sepolia -> Uniswap v3 swap
- Demo URL (judge-facing): `https://synoptic-api-dhiyaancnirmals-projects.vercel.app` (API - build fixed, ready for redeploy)
- Dashboard URL: `TBD_DASHBOARD_URL` (Next.js app - deploy separately from `apps/dashboard`)
- Video URL: `TBD_VIDEO_URL`
- Vercel Project ID: `prj_DIm60AttAZtRDARlRnNLx4uaDtzI`
- Build fixes applied:
  - Added `prebuild` script to generate Prisma client before TypeScript build
  - Fixed `@synoptic/types/agent` import path
  - Fixed Prisma JSON type usage (`InputJsonValue` -> `any`)

## Environment Snapshot
- Date:
- Git commit:
- API version:
- `PAYMENT_MODE`:
- `TRADING_MODE`:
- `AUTH_MODE`:

## Kite Identity Evidence
- Identity mode used (`SIWE` / `KITE_PASSPORT`):
- Agent id:
- Owner address:
- Identity proof artifact (signature, session id, or attestation ref):
- Auth success log/event reference:

## Autonomous Execution Evidence
- Runtime used (`OpenClaw` / `MCP` / `CLI`):
- Trigger mode (`scheduled` / `manual command`):
- Manual wallet click required during execution? (`yes/no`):
- Automation run log reference:
- Failure handling proof (if any):

## Facilitator Evidence
- Verify endpoint:
- Settle endpoint:
- Verify request id/log ref:
- Settle request id/log ref:
- Verification result:
- Settlement result:

## Uniswap API Evidence
- Developer Platform app/key id reference:
- API base URL:
- Quote request id/log ref:
- Quote response summary:
- Transaction build/sign request id/log ref:
- Execution source marker (`UNISWAP_API` or equivalent):

## Cross-Chain Execution Evidence
- Intent id:
- Idempotency key:
- Response evidence idempotency key:
- Agent id:
- Market id: `KITE_bUSDT_BASE_SEPOLIA`

### Bridge
- Source chain: Kite testnet (2368)
- Destination chain: Base Sepolia (84532)
- Source bridge tx hash:
- Destination credit tx hash:
- Bridge status:
- Bridge timeout used (`BRIDGE_TIMEOUT_MS`):

### Swap
- Venue: Uniswap v3 (Base Sepolia)
- Swap tx hash:
- Amount in:
- Amount out:
- Slippage bps:
- Deadline seconds:

## Persistence/Observability Evidence
- Order id:
- Settlement id:
- Quote id:
- ExecutionIntent status timeline:
- Event ids in order:
  - `bridge.submitted`:
  - `bridge.confirmed`:
  - `trade.swap.submitted`:
  - `trade.swap.confirmed`:
  - `trade.executed`:

## Deterministic Failure Proof (At Least One)
- Scenario:
- Input:
- Expected code:
- Actual code:
- Response snippet:

## Artifacts
- Demo video path/link:
- Screenshots path/link:
- Explorer links:

## Notes
- CLI/MCP can run without manual `xPayment` header injection when `SYNOPTIC_X402_MINT_URL` + `SYNOPTIC_X402_MINT_TOKEN` are configured.
- CLI/MCP can obtain API JWT via Passport exchange when `SYNOPTIC_PASSPORT_TOKEN`, `SYNOPTIC_AGENT_ID`, and `SYNOPTIC_OWNER_ADDRESS` are configured.
- Keep this file as the canonical source for judge-facing proof IDs.
