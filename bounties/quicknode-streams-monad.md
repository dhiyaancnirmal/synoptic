# QuickNode Streams Bounty: Monad Data Pipeline

## Overview
Build a project with a working demo that uses QuickNode Streams as the primary source of blockchain data for Monad. Streams should power ingestion, transformation, and delivery to the app/database.

## Category
- Feature Usage

## Prize
- Prize: `$1,000`
- Awards: `1`
- Winner package: `$1,000` + `$5,000` in QuickNode credits

## Requirements
- Working demo with QuickNode Streams as primary data source
- Streams used for ingestion, transformation, and delivery
- Basic docs/code that show Streams config and consumption path

## Account/Plan Note
- If free-tier endpoint limits allow only one endpoint/account, this track can be the single QuickNode submission path.
- Keep this as lower-risk default while Kite and Uniswap priorities are being completed.

## Attestation Mapping (Kite ServiceRegistry)
Use Kite as the attestation layer for Monad actions:

```text
Monad swap executed (chainId 10143, txHash 0x...)
  -> ServiceRegistry.recordService(targetChainId=10143, targetTxHash=0x...)
```

This keeps the evidence model consistent with HyperCore/HyperEVM tracks.

## Successful Project Signals
Strong examples include:
- Historical backfill via Streams
- Real-time event ingestion and filtering
- Event-driven workflows triggered from streamed data
- Streams-powered indexed database

Creativity in making data pipelines simpler and more reliable is encouraged.

## UI/UX Requirements
Interface should make blockchain data readable/actionable:
- Web, mobile, CLI, or SDK allowed
- Browser UI must be on a public demo URL
- CLI/SDK must provide clear commands, outputs, docs

## Judging Criteria
- Completeness of working demo
- Effective use of Streams as primary data source
- Novelty/creativity
- UI/UX or developer experience quality

## Ecosystem Impact
Projects help QuickNode evaluate:
- Real-world Streams integration patterns
- Developer experience gaps
- Usability and performance improvements
- Documentation opportunities

## Resources
- Streams docs: [https://www.quicknode.com/docs/streams](https://www.quicknode.com/docs/streams)
- Streams filters docs: [https://www.quicknode.com/docs/streams/filters](https://www.quicknode.com/docs/streams/filters)
- Telegram support: [https://t.me/sensahill](https://t.me/sensahill)
- Booth reference from source details: `208D`

## Example Use Cases
- Real-time dashboards
- Historical indexing/backfill
- Alerts and automations
- Analytics pipelines
- Data simplification layers for users/devs

## Recruitment
- N/A

## Activation Gate (Must Pass First)

Do not start this track until P0/P1 are locked.

```bash
nvm install 22.21.1
nvm use 22.21.1
bash scripts/p0-p1-evidence-harness.sh
```

Required gate evidence:
- P0/P1 harness bundle exists at `artifacts/evidence/p0-p1/<timestamp-utc>/`.
- `SUMMARY.txt` shows all required P0/P1 pass markers.

## Single-Track Integration Plan

1. Create Monad Streams pipeline in QuickNode (single account/endpoint path).
2. Add filter for swap events used by Synoptic.
3. Deliver events to Synoptic webhook endpoint.
4. Transform and persist events in DB.
5. Render events in dashboard activity feed.
6. Link each streamed swap to Kite attestation (`targetChainId=10143`).

## Evidence Harness (Post-Gate Only)

Run with Node `22.21.1`:

```bash
nvm use 22.21.1
# Start app services and collect:
# - webhook receiver logs
# - DB insertion logs
# - dashboard event rendering proof
```

Capture all of:
- QuickNode stream config screenshot (dataset/filter/webhook destination).
- Webhook delivery log with event id/timestamp.
- DB proof of ingested transformed event.
- Dashboard screenshot showing streamed event.
- Kite attestation proof tied to the same Monad swap reference.
