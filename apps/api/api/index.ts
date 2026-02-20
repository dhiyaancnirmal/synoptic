// Vercel serverless function entry point for Express app
import { createApp } from "../dist/app.js";
import { loadConfig } from "../dist/config.js";
import { getPrismaClient } from "../dist/db/index.js";
import { createPaymentService } from "../dist/services/payment.js";
import { createShopifyCatalogService } from "../dist/services/shopify-catalog.js";
import { createLogger } from "../dist/utils/logger.js";
import { createInMemoryMetrics } from "../dist/utils/metrics.js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

// Initialize context once (Vercel reuses function instances)
let appInstance: ReturnType<typeof createApp> | null = null;
let initPromise: Promise<ReturnType<typeof createApp>> | null = null;

async function initApp() {
  if (appInstance) {
    return appInstance;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    const config = loadConfig();
    const logger = createLogger();
    const prisma = getPrismaClient();
    const metrics = createInMemoryMetrics();

    // Skip database migrations in serverless (run separately via CLI)
    // Skip Socket.IO in serverless (not supported - WebSocket connections don't persist)
    // Skip event indexer in serverless (background jobs not supported)

    const paymentService = createPaymentService({
      mode: config.PAYMENT_MODE,
      facilitatorUrl: config.FACILITATOR_URL,
      verifyPath: config.FACILITATOR_VERIFY_PATH,
      settlePath: config.FACILITATOR_SETTLE_PATH,
      network: String(config.KITE_CHAIN_ID),
      asset: config.SETTLEMENT_TOKEN_ADDRESS,
      amount: config.X402_PRICE_USD,
      payTo: config.X402_PAY_TO,
      retries: config.PAYMENT_RETRY_ATTEMPTS,
      timeoutMs: config.FACILITATOR_TIMEOUT_MS,
      metrics
    });
    const shopifyCatalogService = createShopifyCatalogService(config);

    // Mock Socket.IO for serverless (events won't work, but API routes will)
    const mockIo = {
      to: () => ({ emit: () => {} }),
      emit: () => {}
    } as any;

    const context = {
      config,
      prisma,
      logger,
      io: mockIo,
      metrics,
      paymentService,
      shopifyCatalogService
    };

    appInstance = createApp(context);
    return appInstance;
  })();

  return initPromise;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const app = await initApp();
  return new Promise<void>((resolve, reject) => {
    app(req as any, res as any, (err?: any) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}
