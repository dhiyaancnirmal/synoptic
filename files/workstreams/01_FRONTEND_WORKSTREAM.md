# Frontend Workstream

## Scope
Build a production-grade dashboard that makes bounty evidence obvious:
- Agent identity
- Payment flow (including x402 challenge/settlement stages)
- On-chain confirmation links

Reference: `files/architecture/04_INTERFACE_CONTRACTS.md` is the only source for API/event payload contracts.

## UI Deliverables
- Agent overview + detail pages
- Real-time activity feed
- Payment flow visualization (challenge -> signed payment -> verify -> settle)
- Trade execution panel (spot now; perps/prediction marked "coming soon")
- Failure states: insufficient funds, invalid payment, facilitator outage

## Typography Lock
- Global UI text: Manrope

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@200..800&display=swap" rel="stylesheet">
```

- Short accent text/labels: Geist (`npm i geist`)
- Logo only: local `M290.ttf` (`/Users/dhiyaan/Code/synoptic/design information:inspiration./M290.ttf`)

## Parallelization Boundary
- Frontend must not define backend payload shapes.
- Frontend consumes only frozen contracts from `files/architecture/04_INTERFACE_CONTRACTS.md`.
- Any schema change requires backend version bump + changelog entry.
