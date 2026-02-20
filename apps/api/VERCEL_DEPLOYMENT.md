# Vercel Deployment Configuration

## Current Setup

Your Express app is configured for Vercel serverless deployment with:

1. **Serverless Entry Point**: `api/index.ts` - Wraps Express app for Vercel's serverless runtime
2. **Vercel Config**: `vercel.json` - Defines build commands and function runtime

## Vercel Dashboard Settings

In the Vercel "New Project" screen, configure:

### ✅ Root Directory
- **Set to**: `apps/api`
- This tells Vercel to deploy from the `apps/api` subdirectory

### ✅ Build & Output Settings
Click "Edit" next to "Build and Output Settings" and set:

- **Build Command**: 
  ```
  cd ../.. && pnpm install && pnpm --filter @synoptic/types build && pnpm --filter @synoptic/api build
  ```
  
- **Output Directory**: 
  ```
  .
  ```
  (Leave empty or use `.` - the built files are in `dist/`)

- **Install Command**: 
  ```
  cd ../.. && pnpm install
  ```

### ⚠️ Application Preset
- The "Express" preset is fine, but Vercel will use our `api/index.ts` serverless function instead

### 🔑 Environment Variables
**CRITICAL**: Add all required environment variables from `apps/api/.env.example`:

- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Secret for signing JWTs
- `AUTH_MODE` - Set to `"passport"` for bounty demo
- `PASSPORT_VERIFY_URL` - Kite Passport verification endpoint
- `PASSPORT_API_KEY` - API key for Passport verification
- `FACILITATOR_URL` - x402 facilitator URL
- `KITE_CHAIN_ID` - Chain ID (2368 for testnet)
- `KITE_RPC_URL` - RPC endpoint
- `SETTLEMENT_TOKEN_ADDRESS` - Token address for payments
- `X402_PAY_TO` - Payment recipient address
- `X402_PRICE_USD` - Price per request in USD
- `CORS_ORIGIN` - Allowed CORS origins (comma-separated)
- And all other variables from `.env.example`

## Important Notes

### ⚠️ Limitations on Vercel Serverless

1. **Socket.IO**: WebSocket connections don't persist in serverless. The `api/index.ts` mocks Socket.IO, so real-time events won't work. HTTP API routes will work fine.

2. **Database Migrations**: Run migrations separately before deployment:
   ```bash
   pnpm --filter @synoptic/api prisma:migrate:deploy
   ```

3. **Event Indexer**: Background jobs aren't supported. The event indexer is skipped in serverless mode.

4. **Cold Starts**: First request after inactivity may be slower (~1-2s) due to serverless cold starts.

## Deployment Steps

1. **Set Root Directory** to `apps/api` ✅ (You've done this)

2. **Configure Build Settings**:
   - Open "Build and Output Settings"
   - Set Build Command as shown above
   - Set Install Command as shown above

3. **Add Environment Variables**:
   - Open "Environment Variables"
   - Add all variables from `apps/api/.env.example`

4. **Deploy**: Click "Deploy"

## Verification

After deployment, test:

```bash
curl https://your-project.vercel.app/health
```

Should return:
```json
{"status":"healthy","service":"synoptic-api"}
```

## Troubleshooting

### Build Fails: "Cannot find module '@synoptic/types'"
- Ensure Build Command includes `pnpm --filter @synoptic/types build` first
- Check that `installCommand` runs from repo root (`cd ../..`)

### Build Fails: "Prisma client not generated"
- The `prebuild` script in `package.json` runs `prisma generate` automatically
- If it still fails, ensure `DATABASE_URL` is set (even if migrations aren't run yet)

### Runtime Error: "Cannot connect to database"
- Ensure `DATABASE_URL` environment variable is set correctly
- Run migrations: `pnpm --filter @synoptic/api prisma:migrate:deploy`

### 404 on all routes
- Check that `api/index.ts` exists and exports a default handler
- Verify `vercel.json` is present in `apps/api/`
