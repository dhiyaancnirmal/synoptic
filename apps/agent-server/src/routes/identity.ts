import type { FastifyInstance } from "fastify";
import { fail, ok } from "../http/envelope.js";
import type { RuntimeStoreContract } from "../state/runtime-store.js";

function isAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function normalizeIdentityConfig(strategyConfig?: Record<string, unknown>) {
  const identity =
    strategyConfig?.identity && typeof strategyConfig.identity === "object"
      ? (strategyConfig.identity as Record<string, unknown>)
      : {};
  return {
    ownerAddress: typeof identity.ownerAddress === "string" ? identity.ownerAddress : undefined,
    linkedPayerAddress:
      typeof identity.linkedPayerAddress === "string" ? identity.linkedPayerAddress : undefined
  };
}

export async function registerIdentityRoutes(
  app: FastifyInstance,
  store: RuntimeStoreContract
): Promise<void> {
  app.get("/api/identity", async (request, reply) => {
    const claims = (request as { sessionClaims?: { ownerAddress: string; agentId: string } }).sessionClaims;
    if (!claims) {
      fail(request, reply, 401, "UNAUTHORIZED", "Valid bearer token required");
      return;
    }
    const agent = await store.getAgent(claims.agentId);
    if (!agent) {
      fail(request, reply, 404, "NOT_FOUND", "Agent not found");
      return;
    }
    const identity = normalizeIdentityConfig(agent.strategyConfig);
    return ok(request, {
      agentId: agent.id,
      ownerAddress: agent.eoaAddress.toLowerCase(),
      linkedPayerAddress: identity.linkedPayerAddress?.toLowerCase(),
      payerLinked: Boolean(identity.linkedPayerAddress)
    });
  });

  app.post("/api/identity/link", async (request, reply) => {
    const claims = (request as { sessionClaims?: { ownerAddress: string; agentId: string } }).sessionClaims;
    if (!claims) {
      fail(request, reply, 401, "UNAUTHORIZED", "Valid bearer token required");
      return;
    }
    const body = (request.body as { payerAddress?: string } | undefined) ?? {};
    const payerAddress = body.payerAddress?.trim()?.toLowerCase();
    if (!payerAddress || !isAddress(payerAddress)) {
      fail(request, reply, 400, "INVALID_PAYER_ADDRESS", "Valid payerAddress is required");
      return;
    }
    const agent = await store.getAgent(claims.agentId);
    if (!agent) {
      fail(request, reply, 404, "NOT_FOUND", "Agent not found");
      return;
    }
    const ownerAddress = agent.eoaAddress.toLowerCase();
    if (claims.ownerAddress.toLowerCase() !== ownerAddress) {
      fail(request, reply, 403, "OWNER_MISMATCH", "Session owner does not match agent owner");
      return;
    }

    const strategyConfig = {
      ...(agent.strategyConfig ?? {}),
      identity: {
        ownerAddress,
        linkedPayerAddress: payerAddress
      }
    };
    const updated = await store.updateAgent(agent.id, { strategyConfig });
    if (!updated) {
      fail(request, reply, 500, "UPDATE_FAILED", "Failed to link identity");
      return;
    }

    return ok(request, {
      agentId: updated.id,
      ownerAddress,
      linkedPayerAddress: payerAddress,
      payerLinked: true
    });
  });
}

