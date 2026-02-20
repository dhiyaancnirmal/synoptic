# Dashboard UI Redesign — Changelog

## Summary

Eliminated content duplication between the Cockpit route (which had 4 internal tabs duplicating ~80% of dedicated routes) and the dedicated `/agents`, `/payments`, `/trading` routes. Fixed the sidebar layout bug where it expanded with page content.

## Before

- `/cockpit` had 4 tabs: Session, Spot, Payments, Stream
  - Session tab duplicated agent controls from `/agents`
  - Spot tab duplicated trade data from `/trading`
  - Payments tab duplicated payment tables from `/payments`
  - Stream tab had no dedicated route
- Sidebar stretched with main content (no height constraint)
- Nav order: Agents, Cockpit, Payments, Trading, Activity
- `/dashboard` redirected to `/agents`

## After

- `/cockpit` is now "Overview" — KPI summary only, no tabs, no duplication
  - 6 KPI cards: agents, settled payments, trades, stream health, budget, latest activity
  - 2-column grid: recent trades + recent payments with links to dedicated routes
- `/trading` now includes Top Tokens by Volume + Derived Exposure (absorbed from old Cockpit Spot tab)
- `/streams` is a new dedicated route for chain data ingestion (extracted from old Cockpit Stream tab)
- `/agents`, `/payments`, `/activity` — unchanged
- Sidebar is sticky on desktop (`position: sticky; top: 0; height: 100vh`)
- Sidebar collapses properly on mobile with `position: static; height: auto`
- Nav order: Overview, Agents, Spot Trading, Payments, Streams, Activity
- `/dashboard` redirects to `/cockpit`

## Files Changed

| File | Action |
|------|--------|
| `apps/dashboard/app/globals.css` | Sidebar sticky fix + `.dash-kpi-row-6` grid + mobile overrides |
| `apps/dashboard/components/dashboard/RouteSidebarNav.tsx` | Updated nav links (added Streams, renamed Cockpit→Overview, reordered) |
| `apps/dashboard/components/dashboard/routes/CockpitRouteClient.tsx` | Rewritten as KPI overview (removed all 4 sub-tabs) |
| `apps/dashboard/components/dashboard/routes/TradingRouteClient.tsx` | Added exposure + volume sections above existing trade content |
| `apps/dashboard/components/dashboard/routes/StreamsRouteClient.tsx` | **New** — extracted from Cockpit Stream tab |
| `apps/dashboard/app/streams/page.tsx` | **New** — route entry for Streams |
| `apps/dashboard/app/dashboard/page.tsx` | Updated redirect target to `/cockpit` |

## What Did NOT Change

- Auth/session flow (RequireSession, SIWE, token management)
- API client, data mappers, shared types
- WebSocket realtime client
- Explorer link utilities
- Landing page, login page
- Backend/contracts
- `/agents`, `/payments`, `/activity` route components
