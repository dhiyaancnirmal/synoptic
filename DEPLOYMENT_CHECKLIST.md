# Deployment Checklist

## What Needs to Be Deployed

### 1. ✅ PostgreSQL Database (Railway/Neon/Supabase)
**Why**: Your API needs a database for storing agents, orders, settlements, events, etc.

**Options**:
- **Railway** (recommended for simplicity)
- **Neon** (serverless Postgres, good for Vercel)
- **Supabase** (free tier available)
- **Vercel Postgres** (if you want everything in one place)

**Steps**:
1. Create a PostgreSQL database on Railway/Neon/Supabase
2. Copy the `DATABASE_URL` connection string
3. Run migrations:
   ```bash
   DATABASE_URL="your-railway-url" pnpm --filter @synoptic/api prisma:migrate:deploy
   ```
4. Add `DATABASE_URL` to Vercel environment variables

### 2. ✅ API (Vercel)
**Status**: Currently configuring

**What you've done**:
- ✅ Set Root Directory to `apps/api`
- ✅ Created `api/index.ts` serverless entry point
- ✅ Created `vercel.json` config

**Still need**:
- ⚠️ Configure Build & Output Settings in Vercel dashboard
- ⚠️ Add all environment variables (especially `DATABASE_URL`)

**After git push**: Vercel will auto-deploy on every push to `main`

### 3. ⚠️ Dashboard (Vercel - Optional for Bounty)
**Status**: Not required for bounty demo, but nice to have

**If deploying**:
- Create a separate Vercel project
- Root Directory: `apps/dashboard`
- Framework: Next.js (auto-detected)
- Environment Variables: `NEXT_PUBLIC_API_URL` = your API Vercel URL

## Quick Railway Setup

### Option A: Railway CLI
```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Create new project
railway init

# Add PostgreSQL service
railway add postgresql

# Get connection string
railway variables

# Copy DATABASE_URL and add to Vercel env vars
```

### Option B: Railway Web UI
1. Go to https://railway.app
2. Click "New Project"
3. Select "Provision PostgreSQL"
4. Click on the PostgreSQL service
5. Go to "Variables" tab
6. Copy `DATABASE_URL`
7. Add to Vercel environment variables

## Environment Variables Checklist

### Required for API (Vercel):
```bash
# Database (from Railway)
DATABASE_URL=postgresql://...

# Auth
AUTH_MODE=passport
JWT_SECRET=your-secret-key-min-32-chars
PASSPORT_VERIFY_URL=https://passport-api.gokite.ai/v1/verify
PASSPORT_API_KEY=your-passport-api-key

# Kite Chain
KITE_RPC_URL=https://rpc-testnet.gokite.ai/
KITE_CHAIN_ID=2368
SETTLEMENT_TOKEN_ADDRESS=0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63

# x402 Payments
PAYMENT_MODE=http
FACILITATOR_URL=https://facilitator-api.gokite.ai
FACILITATOR_VERIFY_PATH=/v2/verify
FACILITATOR_SETTLE_PATH=/v2/settle
X402_PAY_TO=synoptic-facilitator
X402_PRICE_USD=0.10

# Trading (Base Sepolia)
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
BASE_SEPOLIA_CHAIN_ID=84532
BASE_UNISWAP_V3_FACTORY=0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24
BASE_UNISWAP_V3_ROUTER=0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4
BASE_UNISWAP_QUOTER_V2=0xC5290058841028F1614F3A6F0F5816cAd0df5E27
UNISWAP_API_BASE_URL=https://trade-api.gateway.uniswap.org/v1
UNISWAP_API_KEY=your-uniswap-api-key
UNISWAP_API_CHAIN_ID=84532

# Bridge
KITE_BRIDGE_ROUTER=0xD1bd49F60A6257dC96B3A040e6a1E17296A51375
KITE_TOKEN_ON_BASE=0xFB9a6AF5C014c32414b4a6e208a89904c6dAe266
BUSDT_TOKEN_ON_BASE=0xdAD5b9eB32831D54b7f2D8c92ef4E2A68008989C
KITE_TESTNET_USDT=0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63

# CORS (update with your Vercel API URL after deployment)
CORS_ORIGIN=https://your-api.vercel.app

# Optional
LOG_LEVEL=info
PORT=3001
```

## Deployment Order

1. **Set up Database** (Railway/Neon)
   - Create PostgreSQL instance
   - Copy `DATABASE_URL`

2. **Run Migrations** (one-time, local or CI)
   ```bash
   DATABASE_URL="your-railway-url" pnpm --filter @synoptic/api prisma:migrate:deploy
   ```

3. **Configure Vercel API Project**
   - Set Build Command (in dashboard)
   - Add all environment variables
   - Deploy

4. **Test Deployment**
   ```bash
   curl https://your-api.vercel.app/health
   ```

5. **Git Push** (triggers auto-redeploy)
   ```bash
   git add .
   git commit -m "Configure Vercel deployment"
   git push origin main
   ```

## Important Notes

- ✅ **Git Push = Auto Deploy**: Every push to `main` triggers Vercel rebuild
- ⚠️ **Database Migrations**: Run separately (not in Vercel build)
- ⚠️ **Socket.IO**: Won't work on serverless (HTTP API routes work fine)
- ⚠️ **Cold Starts**: First request after inactivity may be slow (~1-2s)

## Troubleshooting

### Build Fails: "Cannot find module"
- Check Build Command includes `pnpm --filter @synoptic/types build` first
- Ensure Install Command runs from repo root

### Database Connection Fails
- Verify `DATABASE_URL` is set correctly in Vercel
- Check Railway/Neon database is running
- Ensure migrations ran: `pnpm --filter @synoptic/api prisma:migrate:deploy`

### 404 on All Routes
- Check `api/index.ts` exists
- Verify `vercel.json` is present
- Check Vercel function logs
