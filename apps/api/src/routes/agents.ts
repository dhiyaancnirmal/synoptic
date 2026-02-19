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

function mapAgent(agent: { agentId: string; ownerAddress: string; status: "ACTIVE" | "PAUSED" | "STOPPED"; createdAt: Date }): AgentRecord {
  return {
    agentId: agent.agentId,
    ownerAddress: agent.ownerAddress,
    status: agent.status,
    createdAt: agent.createdAt.toISOString()
  };
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

    await publishEvent(context, {
      eventName: "agent.created",
      agentId: agent.agentId,
      status: "SUCCESS",
      metadata: { ownerAddress: agent.ownerAddress }
    });

    const response: CreateAgentResponse = { agent: mapAgent(agent) };
    res.status(existing ? 200 : 201).json(response);
  });

  app.get("/agents", authMiddleware, async (_req: Request, res: Response<ListAgentsResponse>) => {
    const agents = await context.prisma.agent.findMany({ orderBy: { createdAt: "desc" } });
    res.json({ agents: agents.map(mapAgent) });
  });

  app.get("/agents/:agentId", authMiddleware, async (req: Request<{ agentId: string }>, res: Response<GetAgentResponse>) => {
    const agent = await context.prisma.agent.findUnique({ where: { agentId: req.params.agentId } });
    if (!agent) {
      sendApiError(res, new ApiError("NOT_FOUND", 404, "Agent not found"), req.requestId);
      return;
    }

    res.json({ agent: mapAgent(agent) });
  });
}
