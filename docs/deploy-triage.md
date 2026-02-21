# Deploy Triage Runbook

This runbook focuses on the recurring failure modes seen for Synoptic dashboard and agent-server deployments.

## 1. Baseline Surface Check

Run:

```bash
bash /Users/dhiyaan/Code/synoptic/scripts/check-deploy-surface.sh
```

What it checks:

- `railway status` (project/env/service targeting)
- Agent `/health` endpoint reachability
- Vercel deployment list
- Latest failed Vercel deployment reason (from `vercel inspect --logs`)

## 2. Package Manager and Monorepo Rules

- Use `pnpm`, not `npm`, for all installs/builds.
- Keep lockfile committed (`pnpm-lock.yaml`).
- Avoid Vercel project settings that override install command to `npm install`.

## 3. Dashboard Deploy Rules (Vercel)

- Root Directory must point to `apps/dashboard`.
- `apps/dashboard/package.json` must include `next` in `dependencies` (already required).
- Build command should stay compatible with workspace `pnpm` install.

Observed historical failure signature:

- `Error: No Next.js version detected... check your Root Directory setting`

This almost always means Vercel resolved the wrong directory (repo root without dashboard app context) or an invalid framework auto-detection path.

## 4. Railway Rules (agent-server)

- Validate project context with `railway status` before deploys.
- Confirm `Environment: production` and `Service: agent-server` (or intended target) are selected.
- Ensure runtime env vars for trading routes are explicit:
  - `UNISWAP_API_KEY`
  - `AGENT_PRIVATE_KEY`
  - `EXECUTION_RPC_URL`
  - `EXECUTION_CHAIN_ID` (Monad testnet default `10143`)

## 5. Fast Recovery Checklist

1. Run `check-deploy-surface.sh`.
2. If Vercel fails: inspect latest failed deployment logs and validate Root Directory + `pnpm`.
3. If Railway is up but features fail: hit `/health` and verify capability flags + required env vars.
4. Re-deploy only after the failure reason is mapped to one config change.
