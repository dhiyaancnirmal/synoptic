import compression from "compression";
import cors from "cors";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
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
  const corsOrigins = parseCorsOrigins(context.config.CORS_ORIGIN);

  const authRateLimit = rateLimit({
    windowMs: 60_000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false
  });
  const generalRateLimit = rateLimit({
    windowMs: 60_000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false
  });
  const marketRateLimit = rateLimit({
    windowMs: 60_000,
    max: 30,
    keyGenerator: (req) => {
      const auth = req.header("authorization");
      if (auth?.toLowerCase().startsWith("bearer ")) {
        return auth.slice(7);
      }
      return ipKeyGenerator(req.ip ?? "127.0.0.1");
    },
    standardHeaders: true,
    legacyHeaders: false
  });

  app.use(helmet());
  app.use(
    cors({
      origin: corsOrigins,
      credentials: true
    })
  );
  app.use(compression());
  app.use(express.json({ limit: "1mb" }));
  app.use(requestIdMiddleware);
  app.use(generalRateLimit);
  app.use("/auth", authRateLimit);
  app.use("/markets", marketRateLimit);

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

  app.get("/metrics", (_req, res) => {
    res.json(context.metrics.snapshot());
  });

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

function parseCorsOrigins(raw: string): string[] {
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}
