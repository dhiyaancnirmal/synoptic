# QuickNode Streams Bounty: HyperCore (Hyperliquid) Data Pipeline

## Overview
Build a project with a working demo that uses QuickNode Streams as the primary blockchain data source for the HyperCore side of Hyperliquid. Streams should handle ingestion, transformation, and delivery to the app/database.

## Category
- Feature Usage

## Prize
- Prize: `$1,000`
- Awards: `1`
- Winner package: `$1,000` + `$5,000` in QuickNode credits

## Requirements
- Working demo with QuickNode Streams as primary data source
- Streams used for ingestion, transformation, and delivery
- Basic docs/code showing Streams setup and consumption

## Account/Plan Note
- This is best treated as a second QuickNode track if a second endpoint/account is available.
- HyperCore integrations are higher complexity because trading is off-EVM (perps/spot on HyperCore orderbook).

## Attestation Mapping (Kite ServiceRegistry)
HyperCore and HyperEVM both map into the same Kite attestation contract:

```text
HyperCore fill/order reference
  -> ServiceRegistry.recordService(targetChainId=998, targetTxHashOrRef=<fill-id-or-evm-tx>)
```

If no traditional EVM tx hash exists, use the HyperCore fill/order ID as the attested reference.

## Successful Project Signals
Strong examples include:
- Backfilling historical data with Streams
- Applying Filters for real-time segmentation
- Triggering workflows from streamed events
- Running indexed databases powered by Streams

## UI/UX Requirements
The product should present complex blockchain data clearly:
- Web, mobile, CLI, or SDK accepted
- Browser UI must be publicly accessible
- CLI/SDK must have clear commands, outputs, documentation

## Judging Criteria
- End-to-end demo completeness
- Effective Streams integration as primary source
- Novelty and creativity
- UI/UX or developer experience quality

## Ecosystem Impact
Submissions provide feedback on:
- Product usability
- Integration performance
- Practical data pipeline patterns
- Documentation and DX improvements

## Resources
- Streams docs: [https://www.quicknode.com/docs/streams](https://www.quicknode.com/docs/streams)
- HyperCore datasets: [https://www.quicknode.com/docs/hyperliquid/datasets](https://www.quicknode.com/docs/hyperliquid/datasets)
- Streams filters docs: [https://www.quicknode.com/docs/streams/filters](https://www.quicknode.com/docs/streams/filters)
- Telegram support: [https://t.me/sensahill](https://t.me/sensahill)
- Booth reference from source details: `208D`

## Example Use Cases
- Real-time dashboards
- Historical backfill and indexing
- Event-driven alerts/automations
- Analytics pipelines
- Data abstraction layers for user-friendly insights

## Recruitment
- N/A

## Activation Gate (Stretch Track)

This track is optional and must not block Kite/Uniswap delivery.

Required before work begins:
1. P0/P1 evidence harness passed with Node `22.21.1`.
2. Monad single-track QuickNode path is already stable.
3. A second endpoint/account is available if needed.

Gate command:

```bash
nvm install 22.21.1
nvm use 22.21.1
bash scripts/p0-p1-evidence-harness.sh
```

## HyperCore Evidence Targets (If Activated)

Capture all of:
- QuickNode HyperCore stream configuration screenshot.
- Delivery proof for HyperCore fill/order events (webhook log).
- Transformation/persistence proof in Synoptic DB logs.
- Dashboard rendering proof for HyperCore pipeline event.
- Kite attestation proof using HyperCore fill/order reference in `targetTxHashOrRef`.
