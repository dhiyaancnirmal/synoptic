import type { Express, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { SiweMessage, generateNonce } from "siwe";
import { z } from "zod";
import type { SiweChallengeRequest, SiweChallengeResponse, SiweVerifyRequest, SiweVerifyResponse } from "@synoptic/types/rest";
import type { ApiContext } from "../context.js";
import { ApiError, sendApiError } from "../utils/errors.js";

const NONCE_TTL_MS = 5 * 60_000;

const challengeSchema = z.object({
  address: z.string().min(1)
});

const verifySchema = z.object({
  message: z.string().min(1),
  signature: z.string().min(1),
  agentId: z.string().min(1),
  ownerAddress: z.string().min(1),
  scopes: z.array(z.string()).optional()
});

const nonces = new Map<string, { nonce: string; expiresAt: number }>();

export function registerAuthRoutes(app: Express, context: ApiContext): void {
  app.post(
    "/auth/siwe/challenge",
    (req: Request<unknown, SiweChallengeResponse, SiweChallengeRequest>, res: Response<SiweChallengeResponse>) => {
      const parsed = challengeSchema.safeParse(req.body);
      if (!parsed.success) {
        sendApiError(res, new ApiError("VALIDATION_ERROR", 400, "Invalid SIWE challenge payload"), req.requestId);
        return;
      }

      const nonce = generateNonce();
      const address = parsed.data.address.toLowerCase();
      nonces.set(address, { nonce, expiresAt: Date.now() + NONCE_TTL_MS });
      pruneExpiredNonces();

      const message =
        context.config.AUTH_MODE === "dev"
          ? `Sign in to Synoptic for ${parsed.data.address}. Nonce: ${nonce}`
          : new SiweMessage({
              domain: expectedDomain(context),
              address: parsed.data.address,
              statement: "Sign in to Synoptic",
              uri: expectedOrigin(context),
              version: "1",
              chainId: context.config.KITE_CHAIN_ID,
              nonce,
              issuedAt: new Date().toISOString()
            }).toMessage();

      res.json({
        nonce,
        message
      });
    }
  );

  app.post("/auth/siwe/verify", async (req: Request<unknown, SiweVerifyResponse, SiweVerifyRequest>, res: Response<SiweVerifyResponse>) => {
    const parsed = verifySchema.safeParse(req.body);
    if (!parsed.success) {
      sendApiError(res, new ApiError("VALIDATION_ERROR", 400, "Invalid SIWE verify payload"), req.requestId);
      return;
    }

    if (context.config.AUTH_MODE === "dev") {
      const token = issueToken(context, {
        agentId: parsed.data.agentId,
        ownerAddress: parsed.data.ownerAddress,
        scopes: parsed.data.scopes
      });
      res.json({ token });
      return;
    }

    try {
      pruneExpiredNonces();
      const message = new SiweMessage(parsed.data.message);
      const ownerAddress = message.address.toLowerCase();

      if (ownerAddress !== parsed.data.ownerAddress.toLowerCase()) {
        throw new ApiError("UNAUTHORIZED", 401, "SIWE address does not match ownerAddress");
      }

      const nonceRecord = nonces.get(ownerAddress);
      if (!nonceRecord || nonceRecord.expiresAt < Date.now()) {
        throw new ApiError("UNAUTHORIZED", 401, "SIWE nonce is missing or expired");
      }

      if (message.chainId !== context.config.KITE_CHAIN_ID) {
        throw new ApiError("UNAUTHORIZED", 401, "SIWE chainId does not match configured chain");
      }

      const verification = await message.verify({
        signature: parsed.data.signature,
        nonce: nonceRecord.nonce,
        domain: expectedDomain(context)
      });

      if (!verification.success) {
        throw new ApiError("UNAUTHORIZED", 401, "SIWE signature verification failed");
      }

      nonces.delete(ownerAddress);

      const token = issueToken(context, {
        agentId: parsed.data.agentId,
        ownerAddress,
        scopes: parsed.data.scopes
      });

      res.json({ token });
    } catch (error) {
      sendApiError(
        res,
        error instanceof ApiError ? error : new ApiError("UNAUTHORIZED", 401, "SIWE verification failed"),
        req.requestId
      );
    }
  });
}

function issueToken(
  context: ApiContext,
  payload: {
    agentId: string;
    ownerAddress: string;
    scopes?: string[];
  }
): string {
  return jwt.sign(
    {
      agentId: payload.agentId,
      ownerAddress: payload.ownerAddress,
      scopes: payload.scopes ?? ["agent:read", "agent:write", "trade:execute"]
    },
    context.config.JWT_SECRET,
    { expiresIn: "12h" }
  );
}

function pruneExpiredNonces(): void {
  const now = Date.now();
  for (const [address, value] of nonces.entries()) {
    if (value.expiresAt <= now) {
      nonces.delete(address);
    }
  }
}

function expectedOrigin(context: ApiContext): string {
  return context.config.CORS_ORIGIN.split(",")[0]?.trim() ?? "http://localhost:3000";
}

function expectedDomain(context: ApiContext): string {
  const origin = expectedOrigin(context);
  try {
    return new URL(origin).host;
  } catch {
    return "localhost:3000";
  }
}
