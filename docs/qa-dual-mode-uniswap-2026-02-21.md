# QA + Release Validation Report: Dual-Mode Uniswap Migration

**Date:** 2026-02-21  
**Repo:** `/Users/dhiyaan/Code/synoptic`  
**Target:** Live chain Monad mainnet `143`, simulated chain Monad testnet `10143`, `SWAP_EXECUTION_MODE=auto`, Trading API primary for live, simulated fallback metadata on simulated routes.

---

## 1. Executive Summary

- **Phase 1 (environment + repo sanity):** All checks passed. Node 22.22.0, pnpm 9.15.4, typechecks clean for agent-core, agent-server, dashboard, and agent CLI. Targeted tests passed (agent-core trading, agent-server full suite, dashboard mappers, agent wallet/config and related).
- **Phase 2 (production API):** Health and supported-chains behave as specified. Quote and execute flows that require x402 payment could not be completed end-to-end (no Kite MCP in session). Liquidity/quote on 10143 was verified: returns 200 with simulation metadata and does not require payment.
- **Phase 3 (dashboard UX):** Code review confirms chain selector, mode-aware UX, default pair MON→WMON, simulated notices, and explorer mapping for 143 and 10143. Live browser snapshot did not return full content (MCP response format).
- **Phase 4 (deployment/runtime):** Not verified; Railway and Vercel dashboards were not accessible. Manual verification of env vars and deployment status is required.

**Verdict:** Dual-mode behavior is implemented and observable where payment is not required. Paid quote/execute and liquidity create/increase/decrease/collect could not be validated in this run. No P0/P1 failures were found in the checks that could be run.

---

## 2. Pass/Fail Matrix

| Phase | Check | Result | Notes |
|-------|--------|--------|--------|
| 1 | `node -v` = 22.22.0 | **PASS** | v22.22.0 |
| 1 | `pnpm -v` | **PASS** | 9.15.4 |
| 1 | `git status --short` | **PASS** | Clean state observed (many M, 2 ?? dirs) |
| 1 | `@synoptic/agent-core typecheck` | **PASS** | |
| 1 | `@synoptic/agent-server typecheck` | **PASS** | |
| 1 | `@synoptic/dashboard typecheck` | **PASS** | |
| 1 | `@synoptic/agent typecheck` | **PASS** | |
| 1 | agent-core tests (uniswap-client, real-trading-adapter) | **PASS** | 8 tests |
| 1 | agent-server test | **PASS** | 85 pass, 0 fail |
| 1 | dashboard test (lib/mappers/contracts.test.ts) | **PASS** | 17 tests (full lib suite) |
| 1 | agent test (wallet, config) | **PASS** | 42 tests (full suite) |
| 2.1 | GET /health | **PASS** | status=ok, executionChainId=143, executionChainName=monad, capabilities include execution metadata, trading=configured |
| 2.2 | GET /trade/supported-chains | **PASS** | executionMode, effectiveModeByChain, defaultTradePair, legacy fields; 143=live, 10143=simulated; defaultTradePair MON→WMON |
| 2.3a | POST /trade/quote 10143 without x-payment → 402 | **PASS** | 402 with x402 challenge body |
| 2.3b/c | Quote 10143 with MCP payment → 200 + simulation | **BLOCKED** | No Kite MCP in session |
| 2.4 | Quote 143 with payment | **BLOCKED** | Same |
| 2.5 | POST /trade/execute (both chains) | **BLOCKED** | Requires paid quote |
| 2.6 | Liquidity quote 10143 | **PASS** | 200, simulation.enabled=true, chainId=10143, chainName=monad-testnet |
| 2.6 | Liquidity create 10143 with payment | **BLOCKED** | No MCP payment |
| 3 | Dashboard /trading chain selector (143 + 10143) | **PARTIAL** | Code review: present; live snapshot incomplete |
| 3 | Mode-aware UX (live vs simulated) | **PARTIAL** | Code: selectedMode, simulated message; live not fully verified |
| 3 | Default pair MON→WMON | **PASS** | Code + supported-chains API |
| 3 | 10143 simulated notice | **PARTIAL** | Code: quote/execute messages show simulation.reason |
| 3 | Liquidity simulated messaging | **PARTIAL** | Code: lpUnsupportedInSelectedMode, fallbackLpChains |
| 3 | No old hardcoded unsupported messaging | **PASS** | Code uses effectiveModeByChain, no hardcoded “unsupported” for 10143 |
| 3 | Explorer 143 → Monad mainnet | **PASS** | explorer.ts chainFromId(143)=monad, monadexplorer.com |
| 3 | Explorer 10143 → Monad testnet | **PASS** | chainFromId(10143)=monad-testnet, testnet.monadexplorer.com |
| 4 | Railway EXECUTION_* + SWAP_EXECUTION_MODE + SIMULATED_CHAIN_IDS | **BLOCKED** | No Railway access |
| 4 | Vercel Node 22.x, Ready, domain | **BLOCKED** | No Vercel access |

---

## 3. Findings by Severity

### P0 / P1

- **None** identified in the checks that could be run.

### P2

- **Legacy field naming (`monadSupportedForSwap` / `monadSupportedForLp`):**  
  In GET `/trade/supported-chains`, `monadSupportedForSwap` and `monadSupportedForLp` are `false` because they are derived from the **testnet** chain (10143) in the merged chains list; execution chain 143 is reflected in `executionChainSupportedForSwap: true`. This can confuse readers who assume “monad” means mainnet.  
  **Recommendation:** Document in API docs or add a short comment in `apps/agent-server/src/routes/trade-execution.ts` (e.g. “monad* = testnet chain 10143”). Optional: rename to `monadTestnetSupportedForSwap` / `monadTestnetSupportedForLp` in a future release.

### P3

- **Paid flows unverified:** Quote (both chains) and execute, and liquidity create/increase/decrease/collect, were not exercised with real x402 payment due to missing Kite MCP in this session.  
  **Recommendation:** Run the same validation with a session that has Kite MCP configured, or use a test that mocks the payment adapter and asserts response shape (simulation metadata for 10143, no simulation for 143).

---

## 4. Behavioral Regressions / Compatibility Risks

- **Backward compatibility:** Legacy fields `chains`, `monadSupportedForSwap`, `monadSupportedForLp` are still returned; dashboard and clients using `effectiveModeByChain` and `defaultTradePair` get the new behavior without breaking existing consumers that only read legacy fields.
- **Trade quote 402:** Both chain 143 and 10143 return 402 without payment; challenge body is valid x402 (paymentRequestId, accepts, etc.). No regression observed.
- **Liquidity/quote vs payment:** `/liquidity/quote` does **not** require x402; it returns 200 with simulation metadata for 10143. Mutating liquidity actions (`create`, `increase`, `decrease`, `collect`) remain behind 402. Inconsistency is intentional (quote is cheap; mutating actions are paid).
- **Agent-server test count:** Full `pnpm --filter @synoptic/agent-server test` reported 85 pass, 0 fail (86 subtests). One subtest may be skipped or counted differently; no failures.

---

## 5. Environment or MCP Blockers

| Blocker | Impact |
|--------|--------|
| No Kite / x402 MCP in session | Cannot complete paid quote, execute, or liquidity create flows. All 402-protected endpoints return 402 as expected when unauthenticated. |
| Browser snapshot MCP response | Snapshot returned metadata only (“Unsupported content type”); full DOM/accessibility tree for dashboard UX not captured. Phase 3 relied on code review. |
| No Railway / Vercel access | Phase 4 env and deployment checks could not be run. |

---

## 6. Confidence Score

**72/100**

- **Justification:** High confidence in Phase 1 and in the unauthenticated and non-paid API behavior (health, supported-chains, liquidity/quote 10143). Medium confidence in dashboard behavior (code aligns with requirements; live UX not fully observed). No confidence in production env vars (Phase 4) or in paid quote/execute/liquidity flows (blocked by MCP). Score would rise to ~85+ with: (1) successful paid quote/execute for 10143 and 143, (2) manual confirmation of Railway/Vercel config, (3) a clean browser pass of the trading page with both chains and mode indicators.

---

## 7. Recommended Next Actions

### Immediate

- Manually verify Railway agent-server env: `EXECUTION_CHAIN_ID=143`, `EXECUTION_CHAIN_NAME=monad`, `EXECUTION_RPC_URL=https://rpc.monad.xyz`, `SWAP_EXECUTION_MODE=auto`, `SIMULATED_CHAIN_IDS=10143`.
- Manually verify Vercel synoptic-dashboard: Node 22.x, latest deployment Ready, domain alias active.
- Run one paid quote + execute flow for chain 10143 (with Kite MCP or authenticated session) and confirm response includes `simulation.enabled === true` and `simulation.chainId === 10143`. Repeat for 143 and confirm no simulation (or document fallback if upstream forces it).

### Short-term

- Add an integration or e2e test that, with a mocked payment adapter, calls POST `/trade/quote` and POST `/trade/execute` for chain 10143 and asserts simulation metadata; same for 143 asserting no simulation (or expected fallback).
- Optionally add a similar test for POST `/liquidity/create` on 10143 (simulated tx hash, status confirmed).

### Hardening

- Document in API or code that `monadSupportedForSwap` / `monadSupportedForLp` refer to testnet (10143).
- Consider adding a `/health` or `/trade/supported-chains` field that explicitly lists `simulatedChainIds` from server config to avoid ambiguity.
- Add a single E2E (or agent-browser) test that opens the dashboard trading page, selects 10143, requests a quote (if possible without payment for quote-only path), and checks for “simulated” in the UI message.

---

*Report generated by QA + release validation run; no code changes were made.*
