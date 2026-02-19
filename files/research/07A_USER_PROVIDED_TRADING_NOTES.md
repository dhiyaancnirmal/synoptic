# User-Provided Trading Notes (Raw Ingestion)

This file preserves the full provided trading architecture content as a source appendix for traceability.

## Provided architecture thesis
Use a hybrid design:
- AI logic off-chain
- On-chain intent/risk layer on Kite
- Cross-chain execution via LayerZero where applicable
- Dedicated off-chain executor for Hyperliquid

## What Kite and LayerZero give you (provided)
- Kite positioned as EVM-compatible L1 for agent identity, payment policy, and programmable controls.
- LayerZero positioned as omnichain transport/message layer (OApp/OFT patterns).
- Hyperliquid positioned as API-centric execution venue with its own stack.

Provided sources:
- [Atomic Wallet Kite overview](https://atomicwallet.io/academy/articles/what-is-kite-ai)
- [Arbitrum LayerZero docs note](https://docs.arbitrum.io/for-devs/third-party-docs/LayerZero)
- [Hummingbot Hyperliquid page](https://hummingbot.org/exchanges/hyperliquid/)

## High-level architecture (provided)
Three layers:
1. Agent and risk layer on Kite contracts
2. Venue execution interfaces (on-chain venues + off-chain Hyperliquid executor)
3. Off-chain AI brain that submits intents and reconciles outcomes

## Kite-side contracts suggested (provided)
- AgentRegistry/Passport-style mapping
- Vault/Risk manager with position and loss controls
- IntentOApp for cross-chain message dispatch

## LayerZero for spot/perps on other chains (provided)
- Destination-chain ExecutorOApp per venue
- Optional OFT/native bridge for collateral movement
- Execution callback/ack flows back to Kite for accounting

Provided sources:
- [LayerZero deployed contracts](https://docs.layerzero.network/v2/deployments/deployed-contracts)
- [QuickNode LayerZero guide](https://www.quicknode.com/builders-guide/tools/layerzero-protocol-by-layerzero)
- [Kaia LayerZero guide](https://docs.kaia.io/build/tools/cross-chain/layerzero/)

## Hyperliquid integration pattern (provided)
- Off-chain executor listens for Kite intents targeting Hyperliquid.
- Executor submits and monitors orders via Hyperliquid APIs.
- Executor reports fills back on Kite through reporter contract.
- Hardening idea: bonding/slashing/liveness incentives for executor.

Provided sources:
- [QuickNode Hyperliquid API overview](https://www.quicknode.com/docs/hyperliquid/api-overview)
- [Chainstack Hyperliquid getting started](https://docs.chainstack.com/reference/hyperliquid-getting-started)
- [Allium Hyperliquid overview](https://docs.allium.so/historical-data/supported-blockchains/hyperliquid/overview)

## Prediction markets support (provided)
- Add `PREDICTION` venue type and market schema.
- Implement per-venue prediction adapters in destination executors.
- Keep global risk/accounting on Kite.

Provided source:
- [LayerZero read contracts/deployments docs](https://docs.layerzero.network/v2/deployments/read-contracts)

## Unified intent format (provided)
Base fields proposed:
- `venueId`, `venueType`, `marketId`, `side`, `size`, `limitPrice`, `slippageBps`, `timeInForce`, `maxFeeBps`, `clientOrderId`, `expiry`
Perps extras:
- `leverage`, `reduceOnly`, `marginMode`
Prediction extras:
- `eventId`, `outcomeIndex`, `resolveBefore`

## AI brain integration (provided)
- Reads on-chain state and external market feeds.
- Writes signed/submitted intents to Kite contracts.
- Adjusts policies based on telemetry and risk conditions.

## Practical next steps (provided)
- Build Kite dev contracts (registry/vault/risk/intent).
- Integrate one LayerZero-supported spot/perps venue first.
- Build minimal Hyperliquid executor script and fill reporting.

## Notes
This appendix preserves the provided information as-is in structured form. Canonical implementation guidance lives in `files/research/07_KITE_TRADING_LAYERZERO_HYPERLIQUID.md`.
