import type { Express, Request, Response } from "express";
import type { HealthResponse } from "@synoptic/types/rest";
import type { ApiContext } from "../context.js";

export function registerHealthRoute(app: Express, context: ApiContext): void {
  app.get("/health", async (_req: Request, res: Response<HealthResponse>) => {
    let status: HealthResponse["status"] = "ok";
    let database: "up" | "down" = "up";

    try {
      await context.prisma.$queryRaw`SELECT 1`;
    } catch {
      status = "degraded";
      database = "down";
    }

    res.json({
      status,
      service: "api",
      timestamp: new Date().toISOString(),
      dependencies: {
        database,
        paymentProviderMode: context.config.PAYMENT_MODE,
        facilitatorMode: context.config.PAYMENT_MODE,
        authMode: context.config.AUTH_MODE,
        tradingMode: context.config.TRADING_MODE
      }
    });
  });
}
