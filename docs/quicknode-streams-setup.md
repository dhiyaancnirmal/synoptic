# QuickNode Streams Setup (Monad)

Last updated: 2026-02-21

This is the canonical setup for QuickNode bounty alignment.

## Goal

Use QuickNode Streams as the primary Monad blockchain data source:

- ingestion: Streams webhook delivery
- transformation: server-side normalization
- delivery: DB + dashboard API/UI consumption

## Stream Configuration

1. In QuickNode Dashboard, create a Stream.
2. Chain/network: Monad Testnet.
3. Dataset: EVM block data (prefer block data that includes receipts if available).
4. Destination: Webhook.
5. Webhook URL:

`https://<your-agent-server-domain>/webhooks/quicknode/monad`

6. Set a security token in Streams config.

## Server Configuration

Set one of these env vars on the agent server:

- `QUICKNODE_SECURITY_TOKEN`
- `QUICKNODE_STREAM_SECURITY_TOKEN`
- `QUICKNODE_STREAM_TOKEN`

Inbound auth headers supported:

- `x-quicknode-token`
- `x-quicknode-secret`
- `Authorization: Bearer <token>`

## Health Check

```bash
curl https://<your-agent-server-domain>/webhooks/quicknode/monad
```

Expected JSON:

```json
{"ok":true,"provider":"quicknode","network":"monad-testnet"}
```

## Validation Checklist

- Stream deliveries appear in server logs.
- Events are persisted and visible in dashboard Streams view.
- At least one transformed dataset powers a user-visible feature.
- Documentation includes stream config + consumption flow.

## References

- [QuickNode Streams](https://www.quicknode.com/docs/streams)
- [QuickNode Streams Filters](https://www.quicknode.com/docs/streams/filters)
