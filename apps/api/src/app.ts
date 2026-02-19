import compression from "compression";
import cors from "cors";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import { performance } from "node:perf_hooks";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerAgentsRoutes } from "./routes/agents.js";
import { registerEventsRoutes } from "./routes/events.js";
import { registerHealthRoute } from "./routes/health.js";
import { registerMarketsRoutes } from "./routes/markets.js";
import { registerOrdersRoutes } from "./routes/orders.js";
import { registerShopifyRoutes } from "./routes/shopify.js";
import type { ApiContext } from "./context.js";
import { requestIdMiddleware } from "./middleware/request-id.js";
import { ApiError, sendApiError } from "./utils/errors.js";

export function createApp(context: ApiContext): Express {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(compression());
  app.use(express.json({ limit: "1mb" }));
  app.use(requestIdMiddleware);

  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = performance.now();
    context.metrics.incrementCounter("http.requests_total");

    req.on("close", () => {
      const durationMs = performance.now() - start;
      context.metrics.observeDuration("http.request_duration_ms", durationMs);
      context.logger.info(
        {
          requestId: req.requestId,
          agentId: req.auth?.agentId,
          route: req.originalUrl,
          method: req.method,
          statusCode: res.statusCode,
          durationMs
        },
        "HTTP request completed"
      );
    });

    next();
  });

  registerHealthRoute(app, context);
  registerAuthRoutes(app, context);
  registerAgentsRoutes(app, context);
  registerMarketsRoutes(app, context);
  registerOrdersRoutes(app, context);
  registerEventsRoutes(app, context);
  registerShopifyRoutes(app, context);

  app.get("/", (_req, res) => {
    res.json({ service: "synoptic-api", status: "ready" });
  });

  app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
    void _next;
    context.logger.error({ error, requestId: req.requestId }, "Unhandled API error");

    if (error instanceof ApiError) {
      sendApiError(res, error, req.requestId);
      return;
    }

    sendApiError(res, new ApiError("INTERNAL_ERROR", 500, "Unexpected server error"), req.requestId);
  });

  return app;
}
