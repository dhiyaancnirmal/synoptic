import type { Express, Request, Response } from "express";
import { z } from "zod";
import type { ListEventsResponse } from "@synoptic/types/rest";
import type { ApiContext } from "../context.js";
import { requireAuth } from "../middleware/auth.js";
import { mapDbEventToEnvelope } from "../services/events.js";
import { ApiError, sendApiError } from "../utils/errors.js";

const listEventsQuerySchema = z.object({
  agentId: z.string().min(1),
  limit: z.coerce.number().int().positive().max(500).default(100),
  cursor: z.string().min(1).optional()
});

function hasScope(req: Request<any, any, any, any>, scope: string): boolean {
  return Boolean(req.auth?.scopes.includes(scope));
}

export function registerEventsRoutes(app: Express, context: ApiContext): void {
  const authMiddleware = requireAuth(context.config.JWT_SECRET);

  app.get(
    "/events",
    authMiddleware,
    async (
      req: Request<unknown, ListEventsResponse, unknown, { agentId?: string; limit?: string; cursor?: string }>,
      res: Response
    ) => {
      const parsed = listEventsQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        sendApiError(res, new ApiError("VALIDATION_ERROR", 400, "Invalid events query parameters"), req.requestId);
        return;
      }

      const isAdmin = hasScope(req, "admin:read");
      if (!isAdmin && req.auth?.agentId !== parsed.data.agentId) {
        sendApiError(res, new ApiError("FORBIDDEN", 403, "Token does not match agentId"), req.requestId);
        return;
      }

      const events = await context.prisma.event.findMany({
        where: { agentId: parsed.data.agentId },
        orderBy: { eventId: "asc" },
        ...(parsed.data.cursor ? { cursor: { eventId: parsed.data.cursor }, skip: 1 } : {}),
        take: parsed.data.limit + 1
      });

      const hasMore = events.length > parsed.data.limit;
      const items = hasMore ? events.slice(0, parsed.data.limit) : events;
      const nextCursor = hasMore ? items[items.length - 1]?.eventId : undefined;

      res.json({ events: items.map(mapDbEventToEnvelope), nextCursor });
    }
  );
}
