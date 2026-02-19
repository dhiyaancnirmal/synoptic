---
name: synoptic-kite
description: Synoptic OpenClaw skill for Kite-to-Base cross-chain execution using Synoptic MCP tools.
when:
  - user asks to monitor or execute Synoptic autonomous operations
metadata:
  openclaw:
    requires:
      env:
        - SYNOPTIC_API_URL
        - SYNOPTIC_API_TOKEN
      binaries:
        - npx
---

# Synoptic Skill

Use Synoptic MCP tools with strict V1 trading policy:
- Only execute market `KITE_bUSDT_BASE_SEPOLIA`.
- Always verify identity status before quote/execute.
- Fail fast on unsupported markets, low liquidity, or bridge delays.
- Do not simulate fills when on-chain execution fails.
- Treat perps/prediction as paper-mode only in this bounty cycle.

## Execution policy
- Call `synoptic.trade.quote` before `synoptic.trade.execute`.
- Require quote and execution metadata to include bridge/swap status.
- Treat any of `LIQUIDITY_UNAVAILABLE`, `BRIDGE_TIMEOUT`, `BRIDGE_FAILED`, `DESTINATION_CREDIT_NOT_FOUND`, `SWAP_REVERTED`, `SLIPPAGE_EXCEEDED`, `RISK_LIMIT` as terminal failure.
- Never bypass risk checks or slippage limits.

## Safety constraints
- Do not attempt alternate venues or unsupported pairs.
- Do not issue multiple execute calls for the same intent unless idempotency policy allows it.
- Return explicit tool errors if dependencies are unavailable.
