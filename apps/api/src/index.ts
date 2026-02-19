import { createServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { ensureDatabaseReady, ensureMigrationsApplied, getPrismaClient } from "./db/index.js";
import { createPaymentService } from "./services/payment.js";
import { createShopifyCatalogService } from "./services/shopify-catalog.js";
import { createLogger } from "./utils/logger.js";
import { createInMemoryMetrics } from "./utils/metrics.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger();
  const prisma = getPrismaClient();
  const metrics = createInMemoryMetrics();

  await ensureDatabaseReady(prisma);
  await ensureMigrationsApplied(prisma);

  const server = createServer();
  const io = new SocketIOServer(server, {
    cors: {
      origin: "*"
    }
  });

  const paymentService = createPaymentService({
    facilitatorUrl: config.FACILITATOR_URL,
    network: String(config.KITE_CHAIN_ID),
    asset: config.SETTLEMENT_TOKEN_ADDRESS,
    amount: config.X402_PRICE_USD,
    payTo: config.X402_PAY_TO,
    retries: config.PAYMENT_RETRY_ATTEMPTS,
    timeoutMs: config.FACILITATOR_TIMEOUT_MS,
    metrics
  });
  const shopifyCatalogService = createShopifyCatalogService(config);

  const app = createApp({
    config,
    prisma,
    logger,
    io,
    metrics,
    paymentService,
    shopifyCatalogService
  });

  server.on("request", app);

  io.on("connection", (socket) => {
    socket.emit("system.ready", { message: "Synoptic API runtime ready" });
  });

  server.listen(config.PORT, () => {
    logger.info(
      {
        port: config.PORT,
        chainId: config.KITE_CHAIN_ID,
        rpcUrl: config.KITE_RPC_URL,
        facilitatorUrl: config.FACILITATOR_URL,
        settlementToken: config.SETTLEMENT_TOKEN_ADDRESS
      },
      "Synoptic API listening"
    );
  });
}

main().catch((error) => {
  console.error("API startup failed. If this is a schema issue, run: pnpm --filter @synoptic/api prisma:migrate:deploy");
  console.error(error);
  process.exit(1);
});
