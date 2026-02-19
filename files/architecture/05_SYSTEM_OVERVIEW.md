# System Overview

## Unified Architecture
- Kite chain (identity, settlement, contract state)
- API/facilitator layer (x402 negotiation + verification + settlement)
- MCP server (tool interface)
- OpenClaw integration (skill + gateway/tool execution)
- CLI runtime (operator and autonomous headless execution)
- Dashboard (human visibility layer)

## Data Flow Narratives

### Ecommerce Flow
1. Agent discovers products via commerce rails (e.g., Shopify MCP + REST/UCP pattern).
2. Agent requests checkout payment.
3. Backend triggers Kite-settled payment path.
4. Settlement confirmation is returned to commerce flow and shown in dashboard.

### Spot Trading Flow
1. Agent receives strategy signal.
2. Agent requests quote and executes paid action as needed.
3. Backend executes spot transaction logic and records on-chain references.
4. UI receives event stream and renders settlement state.

### x402-Paid API Flow
1. Client calls paid endpoint.
2. Server returns HTTP 402 with accepted payment requirements.
3. Client retries with signed `X-PAYMENT` payload.
4. Server/facilitator verifies and settles on Kite-compatible path.
5. Server returns result with payment/tx reference.

References: [Kite service provider flow](https://docs.gokite.ai/kite-agent-passport/service-provider-guide), [x402 overview](https://www.x402.org), [QuickNode explainer](https://blog.quicknode.com/x402-protocol-explained-inside-the-https-native-payment-layer/).
