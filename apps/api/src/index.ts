import { createServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { ensureDatabaseReady, ensureMigrationsApplied, getPrismaClient } from "./db/index.js";
import { createPaymentService } from "./services/payment.js";
import { createEventIndexer } from "./services/indexer.js";
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
  await prisma.idempotencyKey.deleteMany({
    where: {
      expiresAt: {
        lt: new Date()
      }
    }
  });

  const server = createServer();
  const io = new SocketIOServer(server, {
    cors: {
      origin: parseCorsOrigins(config.CORS_ORIGIN)
    }
  });

  if (config.AUTH_MODE === "dev") {
    logger.warn("AUTH_MODE=dev is enabled. SIWE signatures are not being verified.");
  }

  const paymentService = createPaymentService({
    mode: config.PAYMENT_MODE,
    facilitatorUrl: config.FACILITATOR_URL ?? "mock://facilitator",
    network: String(config.KITE_CHAIN_ID),
    asset: config.SETTLEMENT_TOKEN_ADDRESS,
    amount: config.X402_PRICE_USD,
    payTo: config.X402_PAY_TO,
    retries: config.PAYMENT_RETRY_ATTEMPTS,
    timeoutMs: config.FACILITATOR_TIMEOUT_MS,
    metrics
  });
  const shopifyCatalogService = createShopifyCatalogService(config);

  const context = {
    config,
    prisma,
    logger,
    io,
    metrics,
    paymentService,
    shopifyCatalogService
  };
  const app = createApp(context);

  server.on("request", app);

  io.on("connection", (socket) => {
    socket.on("agent:subscribe", (agentId: string) => {
      if (typeof agentId === "string" && agentId.length > 0) {
        socket.join(agentId);
      }
    });
    socket.emit("system.ready", { message: "Synoptic API runtime ready" });
  });

  const indexer = createEventIndexer(context);
  if (indexer) {
    await indexer.start();
    process.on("SIGINT", () => {
      void indexer.stop();
    });
    process.on("SIGTERM", () => {
      void indexer.stop();
    });
  }

  server.listen(config.PORT, () => {
    logger.info(
      {
        port: config.PORT,
        chainId: config.KITE_CHAIN_ID,
        rpcUrl: config.KITE_RPC_URL,
        facilitatorUrl: config.FACILITATOR_URL,
        paymentMode: config.PAYMENT_MODE,
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

function parseCorsOrigins(raw: string): string[] {
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}
