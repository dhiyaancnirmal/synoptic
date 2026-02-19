import type { Express, Request, Response } from "express";
import { z } from "zod";
import type { AgentRecord } from "@synoptic/types/agent";
import type { CreateAgentRequest, CreateAgentResponse, GetAgentResponse, ListAgentsResponse } from "@synoptic/types/rest";
import type { ApiContext } from "../context.js";
import { requireAuth } from "../middleware/auth.js";
import { publishEvent } from "../services/events.js";
import { ApiError, sendApiError } from "../utils/errors.js";

const createAgentSchema = z.object({
  ownerAddress: z.string().min(1)
});
const updateStatusSchema = z.object({
  status: z.enum(["ACTIVE", "PAUSED", "STOPPED"])
});

const listAgentsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).default(50),
  cursor: z.string().min(1).optional()
});

function mapAgent(agent: { agentId: string; ownerAddress: string; status: "ACTIVE" | "PAUSED" | "STOPPED"; createdAt: Date }): AgentRecord {
  return {
    agentId: agent.agentId,
    ownerAddress: agent.ownerAddress,
    status: agent.status,
    createdAt: agent.createdAt.toISOString()
  };
}

function hasScope(req: Request<any, any, any, any>, scope: string): boolean {
  return Boolean(req.auth?.scopes.includes(scope));
}

export function registerAgentsRoutes(app: Express, context: ApiContext): void {
  const authMiddleware = requireAuth(context.config.JWT_SECRET);

  app.post("/agents", authMiddleware, async (req: Request<unknown, CreateAgentResponse, CreateAgentRequest>, res: Response) => {
    const parsed = createAgentSchema.safeParse(req.body);
    if (!parsed.success) {
      sendApiError(res, new ApiError("VALIDATION_ERROR", 400, "Invalid agent payload"), req.requestId);
      return;
    }

    const agentId = req.auth?.agentId;
    if (!agentId) {
      sendApiError(res, new ApiError("UNAUTHORIZED", 401, "Missing auth context"), req.requestId);
      return;
    }

    const existing = await context.prisma.agent.findUnique({ where: { agentId } });

    const agent =
      existing ??
      (await context.prisma.agent.create({
        data: {
          agentId,
          ownerAddress: parsed.data.ownerAddress,
          status: "ACTIVE"
        }
      }));

    if (!existing) {
      await publishEvent(context, {
        eventName: "agent.created",
        agentId: agent.agentId,
        status: "SUCCESS",
        metadata: { ownerAddress: agent.ownerAddress }
      });
    }

    const response: CreateAgentResponse = { agent: mapAgent(agent) };
    res.status(existing ? 200 : 201).json(response);
  });

  app.get("/agents", authMiddleware, async (req: Request<unknown, ListAgentsResponse, unknown, { limit?: string; cursor?: string }>, res: Response) => {
    const parsedQuery = listAgentsQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      sendApiError(res, new ApiError("VALIDATION_ERROR", 400, "Invalid pagination parameters"), req.requestId);
      return;
    }

    const isAdmin = hasScope(req, "admin:read");
    const where = isAdmin ? undefined : { ownerAddress: req.auth?.ownerAddress };

    const agents = await context.prisma.agent.findMany({
      where,
      orderBy: { agentId: "asc" },
      ...(parsedQuery.data.cursor ? { cursor: { agentId: parsedQuery.data.cursor }, skip: 1 } : {}),
      take: parsedQuery.data.limit + 1
    });

    const hasMore = agents.length > parsedQuery.data.limit;
    const items = hasMore ? agents.slice(0, parsedQuery.data.limit) : agents;
    const nextCursor = hasMore ? items[items.length - 1]?.agentId : undefined;

    res.json({ agents: items.map(mapAgent), nextCursor });
  });

  app.get("/agents/:agentId", authMiddleware, async (req: Request<{ agentId: string }>, res: Response<GetAgentResponse>) => {
    const agent = await context.prisma.agent.findUnique({ where: { agentId: req.params.agentId } });
    if (!agent) {
      sendApiError(res, new ApiError("NOT_FOUND", 404, "Agent not found"), req.requestId);
      return;
    }

    const isAdmin = hasScope(req, "admin:read");
    if (!isAdmin && req.auth?.ownerAddress !== agent.ownerAddress) {
      sendApiError(res, new ApiError("FORBIDDEN", 403, "Agent does not belong to caller"), req.requestId);
      return;
    }

    res.json({ agent: mapAgent(agent) });
  });

  app.patch(
    "/agents/:agentId/status",
    authMiddleware,
    async (req: Request<{ agentId: string }, GetAgentResponse, { status: "ACTIVE" | "PAUSED" | "STOPPED" }>, res: Response) => {
      const parsed = updateStatusSchema.safeParse(req.body);
      if (!parsed.success) {
        sendApiError(res, new ApiError("VALIDATION_ERROR", 400, "Invalid status payload"), req.requestId);
        return;
      }

      const existing = await context.prisma.agent.findUnique({ where: { agentId: req.params.agentId } });
      if (!existing) {
        sendApiError(res, new ApiError("NOT_FOUND", 404, "Agent not found"), req.requestId);
        return;
      }

      const isAdmin = hasScope(req, "admin:read");
      if (!isAdmin && req.auth?.ownerAddress !== existing.ownerAddress) {
        sendApiError(res, new ApiError("FORBIDDEN", 403, "Agent does not belong to caller"), req.requestId);
        return;
      }

      const agent = await context.prisma.agent.update({
        where: { agentId: req.params.agentId },
        data: { status: parsed.data.status }
      });

      res.json({ agent: mapAgent(agent) });
    }
  );
}
