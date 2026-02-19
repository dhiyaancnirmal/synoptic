import type { PrismaClient } from "@prisma/client";
import type { Server as SocketIOServer } from "socket.io";
import type { ApiConfig } from "./config.js";
import type { Logger } from "./utils/logger.js";
import type { Metrics } from "./utils/metrics.js";
import type { PaymentService } from "./services/payment.js";
import type { ShopifyCatalogService } from "./services/shopify-catalog.js";

export interface ApiContext {
  config: ApiConfig;
  prisma: PrismaClient;
  logger: Logger;
  io: SocketIOServer;
  metrics: Metrics;
  paymentService: PaymentService;
  shopifyCatalogService: ShopifyCatalogService;
}
