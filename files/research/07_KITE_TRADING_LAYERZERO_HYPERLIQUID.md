# Kite Trading Research: LayerZero + Hyperliquid + Venue Model

## Kite Role
Kite can host on-chain identity/risk/payment control logic and smart-contract-based intent/rule enforcement. Sources: [Kite docs](https://docs.gokite.ai), [Kite whitepaper](https://kite.foundation/whitepaper), [Kite ecosystem overview](https://atomicwallet.io/academy/articles/what-is-kite-ai).

## LayerZero Role
LayerZero is a cross-chain messaging/interoperability layer. It can relay intents/state updates across chains but is not itself a matching engine.

Sources: [LayerZero deployment docs](https://docs.layerzero.network/v2/deployments/deployed-contracts), [Arbitrum LayerZero integration note](https://docs.arbitrum.io/for-devs/third-party-docs/LayerZero).

## Hyperliquid Executor Model
Hyperliquid is API-centric for trade execution today; practical integration is a dedicated off-chain executor that watches intents and reports fills back on-chain.

Sources: [Hyperliquid API overview](https://www.quicknode.com/docs/hyperliquid/api-overview), [Hyperliquid integration context](https://hummingbot.org/exchanges/hyperliquid/), [Chainstack getting started](https://docs.chainstack.com/reference/hyperliquid-getting-started).

## Unified Spot/Perps/Prediction Intent Model
Define canonical intent envelope:
- `venueType` (`SPOT`, `PERP`, `PREDICTION`)
- `marketId`
- `side`, `size`, `limitPrice`
- `slippage`, `timeInForce`, `expiry`
- Venue-specific extensions (`leverage`, `outcomeId`, etc.)

## Practical Build Steps
1. Deploy Kite-side registry/vault/risk/intent contracts.
2. Implement spot execution path first (MVP).
3. Add cross-chain executor adapters (LayerZero where applicable).
4. Add Hyperliquid off-chain executor and fill reporter.
5. Extend to perps and prediction adapters.

## Explicit Answers
- Spot on Kite is feasible: yes.
- Trading does not have to be swap-only: you can use AMM, RFQ, orderbook, or hybrid patterns.
- LayerZero is transport/interoperability, not the matching engine.
