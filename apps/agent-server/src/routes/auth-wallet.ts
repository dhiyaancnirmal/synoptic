import type { FastifyInstance } from "fastify";
import { verifyMessage } from "ethers";
import { fail, ok } from "../http/envelope.js";
import type { RuntimeStoreContract } from "../state/runtime-store.js";
import type { AgentServerEnv } from "../env.js";
import { SessionAuth } from "../auth/session.js";

interface RegisterAuthWalletRoutesInput {
  store: RuntimeStoreContract;
  env: AgentServerEnv;
  sessionAuth: SessionAuth;
}

function isAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

export async function registerAuthWalletRoutes(
  app: FastifyInstance,
  input: RegisterAuthWalletRoutesInput
): Promise<void> {
  const dashboardHost = (() => {
    try {
      return new URL(input.env.dashboardUrl).host;
    } catch {
      return "localhost:3000";
    }
  })();

  app.post("/api/auth/wallet/challenge", async (request, reply) => {
    const body = (request.body as { ownerAddress?: string; agentId?: string } | undefined) ?? {};
    const ownerAddress = body.ownerAddress?.trim()?.toLowerCase();
    if (!ownerAddress || !isAddress(ownerAddress)) {
      fail(request, reply, 400, "INVALID_OWNER_ADDRESS", "Valid ownerAddress is required");
      return;
    }
    const existing = body.agentId ? await input.store.getAgent(body.agentId) : undefined;
    const allAgents = await input.store.listAgents();
    const ownerMatched = allAgents.find(
      (candidate) => candidate.eoaAddress.toLowerCase() === ownerAddress
    );
    const fallback = allAgents[0];
    const agent = existing ?? ownerMatched ?? fallback;
    if (!agent) {
      fail(request, reply, 400, "NO_AGENT", "No agent available for challenge creation");
      return;
    }
    if (agent.eoaAddress.toLowerCase() !== ownerAddress) {
      fail(request, reply, 403, "OWNER_MISMATCH", "ownerAddress does not match agent owner");
      return;
    }

    const challenge = input.sessionAuth.createChallenge({
      domain: dashboardHost,
      uri: input.env.dashboardUrl,
      chainId: Number(process.env.KITE_CHAIN_ID ?? 2368),
      ownerAddress,
      agentId: agent.id,
      ttlMs: input.env.authChallengeTtlMs
    });

    return ok(request, {
      challengeId: challenge.id,
      nonce: challenge.nonce,
      message: challenge.message,
      expiresAt: new Date(challenge.expiresAt).toISOString(),
      ownerAddress,
      agentId: agent.id
    });
  });

  app.post("/api/auth/wallet/verify", async (request, reply) => {
    const body = (request.body as {
      challengeId?: string;
      signature?: string;
      message?: string;
      ownerAddress?: string;
      agentId?: string;
    } | undefined) ?? {};
    if (!body.challengeId || !body.signature || !body.message) {
      fail(
        request,
        reply,
        400,
        "INVALID_REQUEST",
        "challengeId, signature and message are required"
      );
      return;
    }
    const challenge = input.sessionAuth.consumeChallenge(body.challengeId);
    if (!challenge) {
      fail(request, reply, 401, "INVALID_CHALLENGE", "Challenge expired or unknown");
      return;
    }
    if (body.message !== challenge.message) {
      fail(request, reply, 401, "INVALID_MESSAGE", "Challenge message mismatch");
      return;
    }

    let recoveredAddress: string;
    try {
      recoveredAddress = verifyMessage(body.message, body.signature).toLowerCase();
    } catch {
      fail(request, reply, 401, "INVALID_SIGNATURE", "Failed to recover signer from signature");
      return;
    }
    if (recoveredAddress !== challenge.ownerAddress.toLowerCase()) {
      fail(request, reply, 401, "SIGNER_MISMATCH", "Signer does not match challenge ownerAddress");
      return;
    }

    const agent = await input.store.getAgent(challenge.agentId);
    if (!agent) {
      fail(request, reply, 404, "NOT_FOUND", "Agent not found");
      return;
    }
    if (agent.eoaAddress.toLowerCase() !== recoveredAddress) {
      fail(request, reply, 403, "OWNER_MISMATCH", "Signer does not match agent owner");
      return;
    }

    const pair = input.sessionAuth.issueTokenPair({
      ownerAddress: recoveredAddress,
      agentId: challenge.agentId,
      accessTtlSeconds: input.env.authSessionTtlSeconds,
      refreshTtlSeconds: input.env.authRefreshTtlSeconds
    });

    return ok(request, {
      tokenType: "Bearer",
      accessToken: pair.accessToken,
      refreshToken: pair.refreshToken,
      accessTtlSeconds: input.env.authSessionTtlSeconds,
      refreshTtlSeconds: input.env.authRefreshTtlSeconds,
      agentId: challenge.agentId,
      ownerAddress: recoveredAddress
    });
  });

  app.get("/api/auth/session", async (request, reply) => {
    const claims = (request as { sessionClaims?: { ownerAddress: string; agentId: string } }).sessionClaims;
    if (!claims) {
      fail(request, reply, 401, "UNAUTHORIZED", "Valid bearer token required");
      return;
    }
    return ok(request, {
      agentId: claims.agentId,
      ownerAddress: claims.ownerAddress
    });
  });

  app.post("/api/auth/session", async (request, reply) => {
    const body = (request.body as { refreshToken?: string } | undefined) ?? {};
    if (!body.refreshToken) {
      fail(request, reply, 400, "INVALID_REQUEST", "refreshToken is required");
      return;
    }
    const rotated = input.sessionAuth.rotateRefreshToken({
      refreshToken: body.refreshToken,
      accessTtlSeconds: input.env.authSessionTtlSeconds,
      refreshTtlSeconds: input.env.authRefreshTtlSeconds
    });
    if (!rotated) {
      fail(request, reply, 401, "INVALID_REFRESH_TOKEN", "Refresh token expired or invalid");
      return;
    }
    return ok(request, {
      tokenType: "Bearer",
      accessToken: rotated.accessToken,
      refreshToken: rotated.refreshToken,
      accessTtlSeconds: input.env.authSessionTtlSeconds,
      refreshTtlSeconds: input.env.authRefreshTtlSeconds,
      agentId: rotated.claims.agentId,
      ownerAddress: rotated.claims.ownerAddress
    });
  });
}
