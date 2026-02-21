# Environment Matrix

## Agent Server (`apps/agent-server`)

| Variable | Required | Default | Notes |
|---|---|---|---|
| `PORT` | No | `3001` | HTTP port |
| `AUTH_TOKEN_SECRET` | Yes | fallback dev value | Must be set in non-local envs |
| `AUTH_CHALLENGE_TTL_MS` | No | `300000` | Wallet challenge expiry |
| `AUTH_SESSION_TTL_SECONDS` | No | `900` | Access token TTL |
| `AUTH_REFRESH_TTL_SECONDS` | No | `604800` | Refresh token TTL |
| `KITE_PAYMENT_MODE` | Yes | `facilitator` | `facilitator` or `demo` only |
| `FACILITATOR_MODE` | Deprecated | - | Alias: `real`->`facilitator`, `demo`->`demo` |
| `KITE_FACILITATOR_URL` | Yes (facilitator mode) | `https://facilitator.pieverse.io` | Self-hosted URL in prod |
| `KITE_NETWORK` | No | `kite-testnet` | Canonical network |
| `KITE_TEST_USDT_ADDRESS` | No | `0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63` | Canonical asset |
| `KITE_PAYMENT_ASSET_DECIMALS` | No | `18` | Atomic unit decimals |
| `KITE_SERVICE_PAYTO` | No | `0x66ad7ef70cc88e37fa692d85c8a55ed4c1493251` | Unblock payee |
| `X402_ORACLE_PRICE_USD` | No | `0.25` | Fixed price for `GET /oracle/price` |
| `X402_TRADE_QUOTE_USD` | No | `0.25` | Fixed price for `POST /trade/quote` |
| `X402_TRADE_EXECUTE_USD` | No | `0.35` | Fixed price for `POST /trade/execute` |
| `X402_LIQUIDITY_ACTION_USD` | No | `0.30` | Fixed price for `POST /liquidity/create|increase|decrease|collect` |
| `ALLOW_SERVER_SIGNING` | No | `false` | `/trade/execute` gate |
| `DATABASE_URL` | Optional | - | Enables DB runtime store |
| `AGENT_PRIVATE_KEY` | Optional | - | Needed for server-signing/attestation |
| `EXECUTION_RPC_URL` | Optional | - | Needed for live trade execution (Monad `143`) |
| `EXECUTION_CHAIN_ID` | No | `143` | Default live execution chain |
| `EXECUTION_CHAIN_NAME` | No | `monad` | Chain label for activity + compat payloads |
| `EXECUTION_EXPLORER_URL` | No | inferred from chain id | Explorer base URL |
| `SWAP_EXECUTION_MODE` | No | `auto` | `auto`/`live`/`simulated` |
| `SIMULATED_CHAIN_IDS` | No | `10143` | Comma-separated chain ids forced to simulation |
| `SIMULATE_ONCHAIN` | Deprecated | `false` | Legacy alias; forces simulated mode when true |
| `KITE_RPC_URL` | Optional | - | Needed for attestation |
| `UNISWAP_API_KEY` | Optional | - | Needed for quote/execute adapters |
| `UNISWAP_API_URL` | No | `https://trade-api.gateway.uniswap.org/v1` | Override Trading API host if needed |
| `SERVICE_REGISTRY_ADDRESS` | Optional | - | Attestation adapter |

## Facilitator (self-hosted)

Use your facilitator deployment-specific envs. Synoptic expects these behavior contracts:

- `POST /v2/verify` and `POST /v2/settle` are reachable
- Replayed tokens are rejected
- Canonical tuple is accepted:
  - `scheme=gokite-aa`
  - `network=kite-testnet`
  - `x402Version=1`

## CLI (`packages/agent-cli`)

| Variable | Required | Default | Notes |
|---|---|---|---|
| `SYNOPTIC_API_URL` | No | `http://localhost:3001` | Agent-server URL |
| `SYNOPTIC_HOME` | No | `~/.synoptic` | Wallet/session storage root |
| `KITE_MCP_CLIENT_ID` | Optional | default client id in code | Enables MCP client bootstrap |
| `KITE_MCP_URL` | No | `https://neo.dev.gokite.ai/v1/mcp` | MCP endpoint |
| `SYNOPTIC_SKIP_MCP_CHECK` | No | `false` | Bypass MCP availability check |

Session file written by setup:

- `~/.synoptic/session.json`
- permission mode `0600`
