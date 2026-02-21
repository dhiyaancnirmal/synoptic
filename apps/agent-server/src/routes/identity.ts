import type { FastifyInstance } from "fastify";
import type { RuntimeStoreContract } from "../state/runtime-store.js";
import { SessionAuth } from "../auth/session.js";

interface RegisterIdentityRoutesDeps {
  store: RuntimeStoreContract;
  sessionAuth: SessionAuth;
}

const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const PLACEHOLDER_OWNER = "0x0000000000000000000000000000000000000001";

interface AgentIdentityState {
  ownerAddress: string;
  payerAddress?: string;
  linkedAt?: string;
  updatedAt?: string;
}

function readBearerToken(raw: unknown): string {
  if (typeof raw !== "string") return "";
  if (!raw.startsWith("Bearer ")) return "";
  return raw.slice("Bearer ".length).trim();
}

function normalizeAddress(value: string): string {
  return value.toLowerCase();
}

function isPlaceholderOwner(value: string | undefined): boolean {
  if (!value) return false;
  return normalizeAddress(value) === PLACEHOLDER_OWNER;
}

export function readIdentityState(strategyConfig: Record<string, unknown> | undefined): AgentIdentityState {
  const identity =
    strategyConfig && typeof strategyConfig.identity === "object" && strategyConfig.identity
      ? (strategyConfig.identity as Record<string, unknown>)
      : {};

  return {
    ownerAddress:
      typeof identity.ownerAddress === "string" ? identity.ownerAddress.toLowerCase() : "",
    payerAddress:
      typeof identity.payerAddress === "string" ? identity.payerAddress.toLowerCase() : undefined,
    linkedAt: typeof identity.linkedAt === "string" ? identity.linkedAt : undefined,
    updatedAt: typeof identity.updatedAt === "string" ? identity.updatedAt : undefined
  };
}

export async function registerIdentityRoutes(
  app: FastifyInstance,
  deps: RegisterIdentityRoutesDeps
): Promise<void> {
  app.post("/api/identity/link", async (request, reply) => {
    const token = readBearerToken(request.headers.authorization);
    const claims = deps.sessionAuth.verifySession(token);
    if (!claims) {
      return reply.status(401).send({
        code: "UNAUTHORIZED",
        message: "Valid bearer access token required",
        requestId: request.id
      });
    }

    const body = (request.body as { payerAddress?: string } | undefined) ?? {};
    const payerAddress = body.payerAddress?.trim();
    if (!payerAddress || !EVM_ADDRESS_RE.test(payerAddress)) {
      return reply.status(400).send({
        code: "INVALID_PAYER_ADDRESS",
        message: "Valid payerAddress is required",
        requestId: request.id
      });
    }

    const agent = await deps.store.getAgent(claims.agentId);
    if (!agent) {
      return reply.status(404).send({
        code: "NO_AGENT",
        message: "Agent does not exist",
        requestId: request.id
      });
    }

    const normalizedOwner = normalizeAddress(claims.ownerAddress);
    if (
      agent.eoaAddress &&
      !isPlaceholderOwner(agent.eoaAddress) &&
      normalizeAddress(agent.eoaAddress) !== normalizedOwner
    ) {
      return reply.status(403).send({
        code: "OWNER_MISMATCH",
        message: "Session owner does not match agent owner",
        requestId: request.id
      });
    }

    const existingIdentity = readIdentityState(agent.strategyConfig);
    const normalizedPayer = normalizeAddress(payerAddress);
    const now = new Date().toISOString();

    const nextStrategyConfig: Record<string, unknown> = {
      ...(agent.strategyConfig ?? {}),
      identity: {
        ownerAddress: normalizedOwner,
        payerAddress: normalizedPayer,
        linkedAt: existingIdentity.linkedAt ?? now,
        updatedAt: now
      }
    };

    await deps.store.updateAgent(agent.id, {
      eoaAddress: normalizedOwner,
      strategyConfig: nextStrategyConfig
    });

    return {
      linked: true,
      agentId: agent.id,
      identity: nextStrategyConfig.identity
    };
  });

  app.get("/api/identity", async (request, reply) => {
    const token = readBearerToken(request.headers.authorization);
    const claims = deps.sessionAuth.verifySession(token);
    if (!claims) {
      return reply.status(401).send({
        code: "UNAUTHORIZED",
        message: "Valid bearer access token required",
        requestId: request.id
      });
    }

    const agent = await deps.store.getAgent(claims.agentId);
    if (!agent) {
      return reply.status(404).send({
        code: "NO_AGENT",
        message: "Agent does not exist",
        requestId: request.id
      });
    }

    const identity = readIdentityState(agent.strategyConfig);

    return {
      agentId: agent.id,
      ownerAddress: claims.ownerAddress,
      payerAddress: identity.payerAddress,
      linked: Boolean(identity.ownerAddress && identity.payerAddress),
      linkedAt: identity.linkedAt,
      updatedAt: identity.updatedAt
    };
  });
}
