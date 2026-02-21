# Synoptic Agent Work Evaluation (2026-02-21)

## Scope Reviewed
- Uncommitted implementation additions and edits in `/Users/dhiyaan/Code/synoptic`
- Plan and handoff docs:
  - `/Users/dhiyaan/Code/synoptic/PLAN.md`
  - `/Users/dhiyaan/Code/synoptic/HANDOFF.md`
  - `/Users/dhiyaan/Code/synoptic/docs/AGENT_CLI_IMPLEMENTATION.md`
  - `/Users/dhiyaan/Code/synoptic/bounties/*.md`

## Project Intent (from planning docs)
Synoptic is an agent-native trading system where autonomous agents use Kite x402 payments for API actions, execute swaps on Monad, and attest service outcomes on Kite. The master plan prioritizes Kite + Uniswap P0/P1 reliability first, then QuickNode stretch work.

## What Was Implemented
- New CLI package: `/Users/dhiyaan/Code/synoptic/packages/agent-cli`
- New implementation doc: `/Users/dhiyaan/Code/synoptic/docs/AGENT_CLI_IMPLEMENTATION.md`
- New handoff doc: `/Users/dhiyaan/Code/synoptic/HANDOFF.md`
- Agent server health enhancement:
  - `/Users/dhiyaan/Code/synoptic/apps/agent-server/src/server.ts` adds `capabilities.trading` and `capabilities.attestation`

## Verification Performed
- `pnpm --filter @synoptic/agent typecheck` (pass)
- `pnpm --filter @synoptic/agent test` (pass)
- `pnpm --filter @synoptic/agent build` (pass)
- `pnpm --filter @synoptic/agent lint` (fail)
- `pnpm typecheck` (pass)
- `pnpm lint` (fail due `@synoptic/agent`)
- `pnpm --filter @synoptic/agent-server test` (pass)
- `bash scripts/p0-p1-evidence-harness.sh` (pass; artifact generated)
- Live smoke:
  - `GET https://agent-server-production-e47b.up.railway.app/health` currently has no `capabilities` block
  - CLI dry-run start currently fails tick with `401 UNAUTHORIZED`

## Findings (Severity Ordered)

### P0 - CLI does not implement autonomous x402 payment settlement loop
- `/Users/dhiyaan/Code/synoptic/packages/agent-cli/src/kite-mcp.ts:65` returns a stub MCP client that always throws when invoked.
- `/Users/dhiyaan/Code/synoptic/packages/agent-cli/src/api-client.ts:74` handles `402` by throwing instructional text instead of invoking MCP `get_payer_addr` + `approve_payment` and retrying.
- `/Users/dhiyaan/Code/synoptic/packages/agent-cli/src/trading-loop.ts:125` and `/Users/dhiyaan/Code/synoptic/packages/agent-cli/src/trading-loop.ts:131` pass empty `paymentToken` values.
- Impact: Core Phase 2 requirement from the plan is not met; CLI cannot autonomously pay/retry.

### P0 - CLI cannot fetch oracle price due missing auth/session strategy
- `/Users/dhiyaan/Code/synoptic/apps/agent-server/src/server.ts:113` public paths exclude `/oracle/price`, so bearer auth is required.
- `/Users/dhiyaan/Code/synoptic/packages/agent-cli/src/trading-loop.ts:98` calls `/oracle/price` without token/bootstrap flow.
- Reproduced behavior: `start --dry-run` fails with `HTTP 401`.
- Impact: Trading loop does not run even before x402 logic.

### P1 - CLI status client is incompatible with canonical API envelope/auth behavior
- `/Users/dhiyaan/Code/synoptic/packages/agent-cli/src/commands/status.ts:76` expects `{ trades }` directly.
- Canonical endpoint returns envelope via `/Users/dhiyaan/Code/synoptic/apps/agent-server/src/routes/trades.ts:7` and auth guard applies from `/Users/dhiyaan/Code/synoptic/apps/agent-server/src/server.ts:122`.
- Same issue for payments via `/Users/dhiyaan/Code/synoptic/apps/agent-server/src/routes/payments.ts:7`.
- Impact: status output for recent trades/payments is unreliable or empty/failing.

### P1 - Repository lint gate is broken by the new CLI package
- `pnpm lint` fails because `@synoptic/agent` has eslint errors (unused imports, parser project inclusion issues).
- Contributing config issue:
  - `/Users/dhiyaan/Code/synoptic/packages/agent-cli/tsconfig.json:13` includes only `src/**/*`, but eslint project service analyzes tests/config files.
- Impact: quality gate regression; branch is not lint-clean.

### P2 - Plan/docs promise behavior not implemented
- `/Users/dhiyaan/Code/synoptic/docs/AGENT_CLI_IMPLEMENTATION.md:121` claims WebSocket connection in loop; no websocket usage exists in CLI sources.
- `/Users/dhiyaan/Code/synoptic/docs/AGENT_CLI_IMPLEMENTATION.md:159` claims 402 retry flow; current implementation does not do this.
- `/Users/dhiyaan/Code/synoptic/packages/agent-cli/src/trading-loop.ts:141` maps `amountOut` to `tradeId`, which is semantically wrong.

## Completion Assessment

### Against `docs/AGENT_CLI_IMPLEMENTATION.md`
- Package scaffolding and command surface: **Mostly complete**
- Wallet generation/storage and key export UX: **Complete**
- Config precedence implementation: **Complete**
- MCP integration (actual tool calls): **Not complete**
- x402 payment retry automation: **Not complete**
- End-to-end autonomous trading loop: **Not complete**
- Test suite breadth vs stated plan (especially x402 retry tests): **Partially complete**
- Lint/CI readiness: **Not complete**

### Against immediate handoff goals (`HANDOFF.md`)
- Health capability flags added in code: **Complete (local code)**
- Production deploy reflecting capability flags: **Not complete**
- Production E2E trade + attestation blockers addressed: **Not complete** (env + ServiceRegistry still needed)

Overall execution score for this batch: **~55/100**
- Strong scaffolding and docs.
- Core autonomous behavior and branch readiness still missing.

## Proposed Answers To Likely Open Questions

1. Should we treat this CLI as done?
- **No.** It is scaffolding, not functional autonomous x402 execution.

2. What should be fixed first?
- **First fix auth + x402 path**, then status/envelope parsing, then lint/CI.

3. Should `/oracle/price` be public for CLI?
- **Either** add `/oracle/price` to public paths (x402 still gates data) **or** implement SIWE session bootstrap in CLI. Pick one and keep it consistent with security posture.

4. Are production blockers still env + registry deployment?
- **Yes.** `AGENT_PRIVATE_KEY`, `EXECUTION_RPC_URL`/`MONAD_RPC_URL`, `KITE_RPC_URL`, and deployed `SERVICE_REGISTRY_ADDRESS` remain the direct blockers for full E2E on production.

5. Is QuickNode work ready to start?
- **No.** Keep it gated after full P0/P1 production E2E evidence is complete.

## Recommended Message To Send The Agent

Use this exact instruction set:

1. Implement real Kite MCP calls in CLI (`@modelcontextprotocol/sdk`) and wire automatic 402 handling:
   - On 402: parse challenge, call `get_payer_addr`, call `approve_payment`, retry with `X-Payment`.
2. Resolve oracle auth mismatch for CLI:
   - Either make `/oracle/price` public (preferred for current plan), or add SIWE bootstrap/token handling in CLI.
3. Fix CLI API client to handle canonical envelope payloads (`{ code, data }`) and authenticated/non-authenticated endpoints correctly.
4. Fix lint issues in `packages/agent-cli` and update tsconfig/eslint project coverage so `pnpm lint` passes.
5. Add missing tests:
   - 402 challenge -> MCP approval -> retry success
   - unauthorized -> authenticated flow behavior
   - canonical envelope parsing for trades/payments/status
6. Re-run and report exact command outputs:
   - `pnpm --filter @synoptic/agent lint`
   - `pnpm --filter @synoptic/agent typecheck`
   - `pnpm --filter @synoptic/agent test`
   - `pnpm lint`
7. After code is fixed, continue production handoff path:
   - Deploy `ServiceRegistry`, set missing Railway vars, validate `/oracle/price -> /trade/quote -> /trade/execute` with real explorer links.
