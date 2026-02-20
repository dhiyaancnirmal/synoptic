import type { FastifyInstance } from "fastify";
import { fail, ok } from "../http/envelope.js";
import type { RuntimeStoreContract } from "../state/runtime-store.js";
import { Orchestrator } from "../runtime/orchestrator.js";
import { WsHub } from "../ws/hub.js";

export async function registerAgentRoutes(
  app: FastifyInstance,
  store: RuntimeStoreContract,
  orchestrator: Orchestrator,
  wsHub: WsHub
): Promise<void> {
  app.get("/api/agents", async (request) => {
    return ok(request, { agents: await store.listAgents() });
  });

  app.get("/api/agents/:id", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const agent = await store.getAgent(id);
    if (!agent) {
      fail(request, reply, 404, "NOT_FOUND", "Agent not found", { agentId: id });
      return;
    }
    return ok(request, { agent });
  });

  app.post("/api/agents", async (request) => {
    const input = (request.body as Record<string, unknown> | undefined) ?? {};
    const agent = await store.createAgent({
      name: typeof input.name === "string" ? input.name : undefined,
      role: input.role === "oracle" || input.role === "strategy" || input.role === "executor" ? input.role : undefined,
      eoaAddress: typeof input.eoaAddress === "string" ? input.eoaAddress : undefined,
      dailyBudgetUsd: typeof input.dailyBudgetUsd === "string" ? input.dailyBudgetUsd : undefined,
      strategy: typeof input.strategy === "string" ? input.strategy : undefined
    });
    return ok(request, { agent }, "agent created");
  });

  app.patch("/api/agents/:id", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const input = (request.body as Record<string, unknown> | undefined) ?? {};
    const updated = await store.updateAgent(id, {
      name: typeof input.name === "string" ? input.name : undefined,
      strategy: typeof input.strategy === "string" ? input.strategy : undefined
    });
    if (!updated) {
      fail(request, reply, 404, "NOT_FOUND", "Agent not found", { agentId: id });
      return;
    }
    return ok(request, { agent: updated }, "agent updated");
  });

  app.post("/api/agents/:id/start", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const current = await store.getAgent(id);
    if (!current) {
      fail(request, reply, 404, "NOT_FOUND", "Agent not found", { agentId: id });
      return;
    }
    if (current.status !== "idle" && current.status !== "paused" && current.status !== "running") {
      fail(request, reply, 409, "INVALID_TRANSITION", "Agent cannot transition to running", { from: current.status });
      return;
    }

    const agent = await orchestrator.startAgent(id);
    if (!agent) {
      fail(request, reply, 404, "NOT_FOUND", "Agent not found", { agentId: id });
      return;
    }
    wsHub.broadcast({ type: "agent.status", agentId: id, status: "running" });
    return ok(request, { status: "running", agentId: id }, "agent started");
  });

  app.post("/api/agents/:id/stop", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const agent = await orchestrator.stopAgent(id);
    if (!agent) {
      fail(request, reply, 404, "NOT_FOUND", "Agent not found", { agentId: id });
      return;
    }
    wsHub.broadcast({ type: "agent.status", agentId: id, status: "paused" });
    return ok(request, { status: "paused", agentId: id }, "agent stopped");
  });

  app.post("/api/agents/:id/trigger", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const agent = await orchestrator.triggerAgent(id);
    if (!agent) {
      fail(request, reply, 404, "NOT_FOUND", "Agent not found", { agentId: id });
      return;
    }
    const event = await store.addActivity(id, "agent.triggered", "kite-testnet", { source: "api" });
    wsHub.broadcast({ type: "activity.new", event });
    return ok(request, { triggered: true, agentId: id }, "agent triggered");
  });
}
