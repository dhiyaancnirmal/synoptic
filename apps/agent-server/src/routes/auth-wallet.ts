import type { FastifyInstance } from "fastify";
import { verifyMessage } from "ethers";
import type { RuntimeStoreContract } from "../state/runtime-store.js";
import type { AgentServerEnv } from "../env.js";
import { SessionAuth } from "../auth/session.js";

interface RegisterAuthWalletRoutesDeps {
  store: RuntimeStoreContract;
  env: AgentServerEnv;
  sessionAuth: SessionAuth;
}

const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const PLACEHOLDER_OWNER = "0x0000000000000000000000000000000000000001";

function getDashboardHost(dashboardUrl: string): string {
  try {
    return new URL(dashboardUrl).host;
  } catch {
    return "localhost:3000";
  }
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

export async function registerAuthWalletRoutes(
  app: FastifyInstance,
  deps: RegisterAuthWalletRoutesDeps
): Promise<void> {
  const dashboardHost = getDashboardHost(deps.env.dashboardUrl);

  app.post("/api/auth/wallet/challenge", async (request, reply) => {
    const body =
      (request.body as { agentId?: string; ownerAddress?: string } | undefined) ?? {};

    const ownerAddress = body.ownerAddress?.trim();
    if (!ownerAddress || !EVM_ADDRESS_RE.test(ownerAddress)) {
      return reply.status(400).send({
        code: "INVALID_OWNER_ADDRESS",
        message: "Valid ownerAddress is required",
        requestId: request.id
      });
    }

    const normalizedOwner = normalizeAddress(ownerAddress);
    const currentAgent = body.agentId ? await deps.store.getAgent(body.agentId) : undefined;

    const selectedAgent = currentAgent ?? (await deps.store.listAgents())[0];
    const agentId = selectedAgent?.id ?? body.agentId;
    if (!agentId) {
      return reply.status(400).send({
        code: "NO_AGENT",
        message: "No agent available for challenge creation",
        requestId: request.id
      });
    }

    if (
      selectedAgent?.eoaAddress &&
      !isPlaceholderOwner(selectedAgent.eoaAddress) &&
      normalizeAddress(selectedAgent.eoaAddress) !== normalizedOwner
    ) {
      return reply.status(403).send({
        code: "OWNER_MISMATCH",
        message: "ownerAddress does not match agent owner",
        requestId: request.id
      });
    }

    const challenge = deps.sessionAuth.createChallenge({
      domain: dashboardHost,
      uri: deps.env.dashboardUrl,
      chainId: Number(process.env.KITE_CHAIN_ID ?? 2368),
      ownerAddress: normalizedOwner,
      agentId,
      ttlMs: deps.env.authChallengeTtlMs
    });

    return {
      challengeId: challenge.id,
      nonce: challenge.nonce,
      message: challenge.message,
      expiresAt: new Date(challenge.expiresAt).toISOString(),
      agentId,
      ownerAddress: normalizedOwner
    };
  });

  app.post("/api/auth/wallet/verify", async (request, reply) => {
    const body =
      (request.body as {
        challengeId?: string;
        message?: string;
        signature?: string;
        ownerAddress?: string;
        agentId?: string;
      } | undefined) ?? {};

    if (!body.challengeId || !body.signature || !body.message) {
      return reply.status(400).send({
        code: "INVALID_REQUEST",
        message: "challengeId, message and signature are required",
        requestId: request.id
      });
    }

    const challenge = deps.sessionAuth.consumeChallenge(body.challengeId);
    if (!challenge) {
      return reply.status(401).send({
        code: "INVALID_CHALLENGE",
        message: "Challenge expired or unknown",
        requestId: request.id
      });
    }

    if (challenge.message !== body.message) {
      return reply.status(401).send({
        code: "INVALID_CHALLENGE",
        message: "Challenge message mismatch",
        requestId: request.id
      });
    }

    const recovered = verifyMessage(body.message, body.signature).toLowerCase();
    if (recovered !== challenge.ownerAddress.toLowerCase()) {
      return reply.status(401).send({
        code: "SIGNATURE_MISMATCH",
        message: "Signature does not match ownerAddress",
        requestId: request.id
      });
    }

    if (body.ownerAddress && normalizeAddress(body.ownerAddress) !== challenge.ownerAddress) {
      return reply.status(401).send({
        code: "OWNER_MISMATCH",
        message: "ownerAddress mismatch",
        requestId: request.id
      });
    }

    if (body.agentId && body.agentId !== challenge.agentId) {
      return reply.status(401).send({
        code: "AGENT_MISMATCH",
        message: "agentId mismatch",
        requestId: request.id
      });
    }

    const agent = await deps.store.getAgent(challenge.agentId);
    if (!agent) {
      return reply.status(404).send({
        code: "NO_AGENT",
        message: "Agent does not exist",
        requestId: request.id
      });
    }

    await deps.store.updateAgent(challenge.agentId, { eoaAddress: challenge.ownerAddress });

    const session = deps.sessionAuth.issueSessionPair({
      ownerAddress: challenge.ownerAddress,
      agentId: challenge.agentId,
      accessTtlSeconds: deps.env.authSessionTtlSeconds,
      refreshTtlSeconds: deps.env.authRefreshTtlSeconds
    });

    return {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      token: session.accessToken,
      expiresAt: session.accessExpiresAt,
      refreshExpiresAt: session.refreshExpiresAt,
      agentId: challenge.agentId,
      ownerAddress: challenge.ownerAddress
    };
  });

  app.get("/api/auth/session", async (request, reply) => {
    const token = readBearerToken(request.headers.authorization);
    const claims = deps.sessionAuth.verifySession(token);
    if (!claims) {
      return reply.status(401).send({
        code: "UNAUTHORIZED",
        message: "Valid bearer access token required",
        requestId: request.id
      });
    }

    return {
      tokenType: claims.tokenType,
      agentId: claims.agentId,
      ownerAddress: claims.ownerAddress,
      expiresAt: new Date(claims.exp * 1000).toISOString()
    };
  });

  app.post("/api/auth/session", async (request, reply) => {
    const body = (request.body as { refreshToken?: string } | undefined) ?? {};
    const refreshToken = body.refreshToken?.trim() || readBearerToken(request.headers.authorization);
    if (!refreshToken) {
      return reply.status(400).send({
        code: "MISSING_REFRESH_TOKEN",
        message: "refreshToken is required",
        requestId: request.id
      });
    }

    const nextSession = deps.sessionAuth.refreshSession(refreshToken, {
      accessTtlSeconds: deps.env.authSessionTtlSeconds,
      refreshTtlSeconds: deps.env.authRefreshTtlSeconds
    });

    if (!nextSession) {
      return reply.status(401).send({
        code: "INVALID_REFRESH_TOKEN",
        message: "Refresh token is expired, invalid, or already used",
        requestId: request.id
      });
    }

    const claims = deps.sessionAuth.verifySession(nextSession.accessToken);
    if (!claims) {
      return reply.status(500).send({
        code: "SESSION_ISSUE_FAILED",
        message: "Unable to issue refreshed session",
        requestId: request.id
      });
    }

    return {
      accessToken: nextSession.accessToken,
      refreshToken: nextSession.refreshToken,
      token: nextSession.accessToken,
      expiresAt: nextSession.accessExpiresAt,
      refreshExpiresAt: nextSession.refreshExpiresAt,
      agentId: claims.agentId,
      ownerAddress: claims.ownerAddress
    };
  });
}
