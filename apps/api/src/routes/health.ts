import type { Express, Request, Response } from "express";
import type { HealthResponse } from "@synoptic/types/rest";

export function registerHealthRoute(app: Express): void {
  app.get("/health", (_req: Request, res: Response<HealthResponse>) => {
    res.json({
      status: "ok",
      service: "api",
      timestamp: new Date().toISOString()
    });
  });
}
