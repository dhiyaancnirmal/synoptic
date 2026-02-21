# @synoptic/agent

Autonomous agent CLI for Synoptic - x402 payments and trading on Kite and Monad.

## Quick Start

```bash
# Initialize a new agent wallet
npx @synoptic/agent init

# Fund your wallet (shows faucet links)
npx @synoptic/agent fund

# Start autonomous trading
npx @synoptic/agent start

# Check status
npx @synoptic/agent status

# Export private key (for MetaMask import)
npx @synoptic/agent export-key
```

## Commands

### `init`

Generate a new agent wallet stored in `~/.synoptic/wallet.json`.

```bash
npx @synoptic/agent init
npx @synoptic/agent init --force  # Overwrite existing wallet
```

**Output:**

- Wallet address
- Faucet links for Kite and Monad testnets
- Kite MCP setup instructions (if not configured)

### `fund`

Check wallet balances on Kite and Monad testnets.

```bash
npx @synoptic/agent fund
npx @synoptic/agent fund --watch  # Monitor for incoming funds
```

### `start`

Start the autonomous trading loop.

```bash
npx @synoptic/agent start                    # Live trading
npx @synoptic/agent start --dry-run          # Validate without executing
npx @synoptic/agent start --amount 0.05      # Custom trade size
npx @synoptic/agent start --tick-interval 60000  # 60 second ticks
```

**Options:**

- `--dry-run` - Validate payment + quote flow without executing swaps
- `--amount <value>` - Trade amount (default: 0.01)
- `--tick-interval <ms>` - Time between ticks (default: 30000)

### `status`

Show wallet balances, API status, and recent trades.

```bash
npx @synoptic/agent status
```

### `export-key`

Export wallet private key for MetaMask import.

```bash
npx @synoptic/agent export-key     # Prompts for confirmation
npx @synoptic/agent export-key --yes  # Skip confirmation
```

**Output:**

- Private key (displayed and copied to clipboard)
- QR code for mobile import

### `config`

Show current configuration.

```bash
npx @synoptic/agent config
```

## Configuration

Config precedence (highest to lowest):

1. CLI flags (`--amount`, `--tick-interval`)
2. Environment variables (`SYNOPTIC_*`)
3. Config file (`~/.synoptic/config.json`)
4. Defaults

### Environment Variables

| Variable                    | Description          | Default        |
| --------------------------- | -------------------- | -------------- |
| `SYNOPTIC_DEFAULT_AMOUNT`   | Default trade amount | `0.01`         |
| `SYNOPTIC_TICK_INTERVAL_MS` | Tick interval (ms)   | `30000`        |
| `SYNOPTIC_MAX_RETRIES`      | Max API retries      | `3`            |
| `SYNOPTIC_BACKOFF_MS`       | Retry backoff (ms)   | `1000`         |
| `SYNOPTIC_API_URL`          | Agent server URL     | Production URL |
| `SYNOPTIC_LOG_LEVEL`        | Log level            | `info`         |

### Config File (`~/.synoptic/config.json`)

```json
{
  "defaultAmount": "0.01",
  "tickIntervalMs": 30000,
  "logLevel": "info"
}
```

## Kite MCP Setup

x402 payments require Kite Passport MCP configured in your AI agent.

### Cursor (`~/.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "kite-passport": {
      "url": "https://neo.dev.gokite.ai/v1/mcp"
    }
  }
}
```

### Claude Desktop

Add the same config to:
`~/Library/Application Support/Claude/claude_desktop_config.json`

### OpenCode

Add the same config to:
`~/.config/opencode/mcp.json`

## Trading Strategy

The agent uses a momentum-based strategy:

- **BUY**: Three consecutive upward price candles
- **SELL**: Three consecutive downward price candles
- **HOLD**: No clear momentum

## Security

### Wallet Storage

- Wallet stored in `~/.synoptic/wallet.json`
- File permissions: `0600` (owner read/write only)
- Private key never logged

### Export Key

- Requires explicit confirmation (or `--yes` flag)
- Displays warning before showing key
- Copies to clipboard automatically
- Shows QR for mobile import

### Logs

- Logs stored in `~/.synoptic/logs/`
- Automatic rotation (keeps last 10 files)
- No private keys logged

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm --filter @synoptic/agent build

# Run locally
pnpm --filter @synoptic/agent dev -- init

# Run tests
pnpm --filter @synoptic/agent test

# Type check
pnpm --filter @synoptic/agent typecheck
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  AI Agent (Cursor/Claude/OpenCode)                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │ Kite MCP    │  │ @synoptic/  │  │ Other MCPs  │     │
│  │ (x402 pay)  │  │ agent CLI   │  │             │     │
│  └──────┬──────┘  └──────┬──────┘  └─────────────┘     │
└─────────┼────────────────┼─────────────────────────────┘
          │                │
          │ MCP            │ HTTP
          ▼                ▼
┌─────────────────────────────────────────────────────────┐
│  Synoptic Agent Server (Railway)                        │
│  /oracle/price  /trade/quote  /trade/execute            │
└─────────────────────────────────────────────────────────┘
```

## Known Limitations

1. MCP detection is best-effort - actual availability checked at runtime
2. Faucet funding is manual (agent displays links, human visits)
3. Testnet-only in current version
4. No persistent portfolio tracking across sessions
5. WebSocket reconnection not implemented

## License

MIT
