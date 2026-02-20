# Synoptic Bounty Demo Runbook (Kite -> Base Sepolia)

## Goal
Run one real `POST /markets/execute` flow that proves:
1. x402 verification + settlement path is active.
2. Kite bridge submission occurs when Base balance is insufficient.
3. Destination credit is detected on Base Sepolia.
4. Uniswap API-powered swap execution path runs on Base Sepolia.
5. Lifecycle state/events are persisted and queryable.

## Preconditions
- Node `22.x` (Hardhat/tooling compatibility baseline).
- Postgres running and reachable from `DATABASE_URL`.
- Funded server signer wallet:
  - Kite testnet KITE gas + USDT.
  - Base Sepolia ETH gas.
- Valid API JWT flow working (`AUTH_MODE=passport` for final demo preferred).

## Required Env (`/Users/dhiyaan/Code/synoptic/apps/api/.env`)
- `TRADING_MODE=bridge_to_base_v1`
- `PAYMENT_MODE=http`
- `AUTH_MODE=passport`
- `KITE_RPC_URL=https://rpc-testnet.gokite.ai/`
- `BASE_SEPOLIA_RPC_URL=<your_base_sepolia_rpc>`
- `KITE_BRIDGE_ROUTER=0xD1bd49F60A6257dC96B3A040e6a1E17296A51375`
- `KITE_TESTNET_USDT=0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63`
- `BUSDT_TOKEN_ON_BASE=0xdAD5b9eB32831D54b7f2D8c92ef4E2A68008989C`
- `KITE_TOKEN_ON_BASE=0xFB9a6AF5C014c32414b4a6e208a89904c6dAe266`
- `BASE_UNISWAP_V3_FACTORY=0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24`
- `BASE_UNISWAP_V3_ROUTER=0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4`
- `BASE_UNISWAP_QUOTER_V2=0xC5290058841028F1614F3A6F0F5816cAd0df5E27`
- `UNISWAP_API_BASE_URL=<developer_platform_api_base>`
- `UNISWAP_API_KEY=<developer_platform_api_key>`
- `UNISWAP_API_CHAIN_ID=84532`
- `SERVER_SIGNER_PRIVATE_KEY=<demo_signer_private_key>`
- `JWT_SECRET=<demo_jwt_secret_16+chars>`
- `PASSPORT_VERIFY_URL=<passport_verifier_endpoint>`
- `PASSPORT_API_KEY=<optional_verifier_key>`
- `FACILITATOR_URL=<real_facilitator_base_url>`
- `FACILITATOR_VERIFY_PATH=<real_verify_path>`
- `FACILITATOR_SETTLE_PATH=<real_settle_path>`
- `BRIDGE_TIMEOUT_MS=1200000`
- `MAX_TRADE_NOTIONAL_BUSDT=10`
- `SLIPPAGE_BPS=100`
- `SWAP_DEADLINE_SECONDS=300`

## Startup
```bash
pnpm install
pnpm --filter @synoptic/api prisma:migrate:deploy
pnpm --filter @synoptic/api test:integration
pnpm --filter @synoptic/api dev
```

## Runtime Env for Autonomous CLI/MCP
Set one API auth mode:
- static API token: `SYNOPTIC_API_TOKEN=<jwt>`
- Passport exchange:
  - `SYNOPTIC_PASSPORT_TOKEN=<passport_token>`
  - `SYNOPTIC_AGENT_ID=<agent_id>`
  - `SYNOPTIC_OWNER_ADDRESS=<owner_wallet>`

Set one x402 payment mode:
- static header: `SYNOPTIC_X_PAYMENT=<xpayment_header>`
- mint endpoint:
  - `SYNOPTIC_X402_MINT_URL=<mint_endpoint>`
  - `SYNOPTIC_X402_MINT_TOKEN=<mint_auth_token>`

## Demo Execution
1. Exchange Passport token to Synoptic API JWT (skip if using static `SYNOPTIC_API_TOKEN`):
```bash
curl -sS -X POST http://localhost:3001/auth/passport/exchange \
  -H "content-type: application/json" \
  -d '{"passportToken":"'$PASSPORT_TOKEN'","agentId":"'$AGENT_ID'","ownerAddress":"'$OWNER_ADDRESS'"}'
```
2. Create/fetch agent id tied to JWT.
3. Submit quote:
```bash
curl -sS -X POST http://localhost:3001/markets/quote \
  -H "authorization: Bearer $TOKEN" \
  -H "x-payment: $XPAYMENT" \
  -H "content-type: application/json" \
  -d '{"agentId":"'$AGENT_ID'","venueType":"SPOT","marketId":"KITE_bUSDT_BASE_SEPOLIA","side":"BUY","size":"1"}'
```
4. Submit execute:
```bash
curl -sS -X POST http://localhost:3001/markets/execute \
  -H "authorization: Bearer $TOKEN" \
  -H "x-payment: $XPAYMENT" \
  -H "idempotency-key: demo-intent-001" \
  -H "content-type: application/json" \
  -d '{"agentId":"'$AGENT_ID'","venueType":"SPOT","marketId":"KITE_bUSDT_BASE_SEPOLIA","side":"BUY","size":"1"}'
```

Expected successful response includes:
- `executionPath=BASE_SEPOLIA_UNISWAP_V3`
- `executionSource=UNISWAP_API` (or equivalent telemetry/event evidence)
- `bridge.status` in `{SKIPPED,CONFIRMED}`
- `swap.status=CONFIRMED`
- tx hashes in `bridge.*TxHash` and `swap.txHash`
- response `evidence.*` linkage ids (`idempotencyKey`, `quoteId`, `orderId`, `settlementId`)

## Determinism Checks
- Liquidity fail: use an unsupported pair id and confirm deterministic `UNSUPPORTED_MARKET`/`LIQUIDITY_UNAVAILABLE` behavior.
- Bridge timeout: temporarily set an invalid bridge router and confirm `failureCode=BRIDGE_FAILED` or `BRIDGE_TIMEOUT`.
- Idempotency replay: same payload + same key returns identical prior response.
- Idempotency conflict: same key + changed payload returns HTTP `409 IDEMPOTENCY_CONFLICT`.

## Evidence Collection
Populate `/Users/dhiyaan/Code/synoptic/files/bounty/EVIDENCE.md` after each run with:
- Uniswap API quote/request reference ids and timing
- source bridge tx hash
- destination credit tx hash
- swap tx hash
- intent/order/settlement/event ids
- facilitator verify/settle request references

## Rollback/Cleanup
- Stop API process.
- Revoke/rotate demo signer key if exposed.
- Optionally truncate test data:
```bash
pnpm --filter @synoptic/api prisma:migrate:reset --force
```
