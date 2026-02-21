# Submission Checklist (Kite + Uniswap + QuickNode)

## Kite

- Agent identity is visible in UI/CLI.
- Every paid action shows `402 -> payment -> success` lifecycle.
- Paid action calls include bearer auth + x402 headers.
- Misuse and insufficient-funds paths show graceful errors.
- At least one on-chain payment settlement proof is captured.
- Trade, liquidity, and marketplace purchase actions all emit attestation proofs.

## Uniswap

- Swap flow is functional on testnet/mainnet path used in demo.
- Uniswap API integration is active in quote/swap path.
- Public URL can be used by judges.
- Open-source repo path is documented.

## QuickNode

- Streams is configured as primary Monad data source.
- Ingestion, transformation, and delivery are demonstrated.
- Stream config and consumption path are documented.
- UI/CLI clearly presents streamed output.

## Demo Artifacts

- Public demo URL(s)
- README reproducible path
- Payment lifecycle logs
- Streams ingestion/transformation logs
- Swap execution logs
- Explorer tx links
- Screenshots: identity, payments, streams, trading, activity
