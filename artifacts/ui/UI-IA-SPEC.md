# Synoptic Dashboard — Information Architecture Spec

## Route Map

| Route | Sidebar Label | Purpose |
|-------|--------------|---------|
| `/cockpit` | Overview | At-a-glance KPI summary: health, profitability, activity |
| `/agents` | Agents | Agent registry, lifecycle controls, budget state |
| `/trading` | Spot Trading | Trade execution, token volume, derived exposure |
| `/payments` | Payments | x402 payment lifecycle, oracle test, settlement proof |
| `/streams` | Streams | Chain data ingestion, QuickNode stream health, block graph |
| `/activity` | Activity | Full audit trail with chain filter + timeline feed |

## Default Redirect

`/dashboard` → `/cockpit`

## Per-Route Widget Spec

### `/cockpit` (Overview)

**KPI Row (6 cards):**
1. Agent count — active/idle breakdown
2. Total settled payments (USD) — count of settled
3. Trade count — confirmation rate %
4. Stream health — QuickNode status (healthy/degraded/offline)
5. Budget utilization — % of daily budget used, spent/total
6. Latest activity timestamp — event type

**2-Column Grid:**
- Left: Recent Trades (last 5) — timestamp, pair, amounts, status, explorer link → `/trading`
- Right: Recent Payments (last 5) — timestamp, amount, service, status, explorer link → `/payments`

### `/trading` (Spot Trading)

**Above the fold:**
- Top Tokens by Volume panel — KPI cards from confirmed Monad trades
- Derived Exposure panel — exposure grid showing net token positions

**Main content:**
- Latest Swap — stage pipeline (quoting→confirmed), detail cards
- Trade Timeline — full table with explorer links + activity links

### `/streams` (Streams)

**KPI Row (4 cards):**
1. QuickNode Status — healthy/degraded/offline with time since last
2. Events Received — count of block.received events
3. WebSocket — connection status
4. Latest Block — block number from Monad testnet

**Main content:**
- Block Stream Graph — SVG liveline visualization
- Recent Events — feed of quicknode.block.received events

### `/agents` (Agents)

Unchanged — agent registry, controls, budget bars.

### `/payments` (Payments)

Unchanged — payment lifecycle, oracle test, settlements table.

### `/activity` (Activity)

Unchanged — chain filter + timeline feed.

## Sidebar

- Fixed/sticky on desktop (100vh, overflow-y: auto)
- Collapses to horizontal top bar on mobile (< 980px)
- Nav order: Overview, Agents, Spot Trading, Payments, Streams, Activity
- Footer: network label, API health, WS status

## CSS Classes

| Class | Description |
|-------|-------------|
| `.dash-kpi-row-6` | 6-column KPI grid (collapses to 2-col on mobile) |
| `.dash-sidebar` | Sticky sidebar with `position: sticky; top: 0; height: 100vh` |
