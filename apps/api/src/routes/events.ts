import type { Express, Request, Response } from "express";
import type { ListEventsResponse } from "@synoptic/types/rest";
import type { ApiContext } from "../context.js";
import { requireAuth } from "../middleware/auth.js";
import { mapDbEventToEnvelope } from "../services/events.js";
import { ApiError, sendApiError } from "../utils/errors.js";

export function registerEventsRoutes(app: Express, context: ApiContext): void {
  const authMiddleware = requireAuth(context.config.JWT_SECRET);

  app.get("/events", authMiddleware, async (req: Request<unknown, ListEventsResponse, unknown, { agentId?: string }>, res: Response) => {
    const targetAgentId = req.query.agentId;

    if (!targetAgentId) {
      sendApiError(res, new ApiError("VALIDATION_ERROR", 400, "agentId query parameter is required"), req.requestId);
      return;
    }

    if (req.auth?.agentId !== targetAgentId) {
      sendApiError(res, new ApiError("FORBIDDEN", 403, "Token does not match agentId"), req.requestId);
      return;
    }

    const events = await context.prisma.event.findMany({
      where: { agentId: targetAgentId },
      orderBy: { timestamp: "desc" },
      take: 200
    });

    res.json({ events: events.map(mapDbEventToEnvelope) });
  });
}
