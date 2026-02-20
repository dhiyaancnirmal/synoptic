import type { Express, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { SiweMessage, generateNonce } from "siwe";
import { z } from "zod";
import type {
  PassportTokenExchangeRequest,
  PassportTokenExchangeResponse,
  SiweChallengeRequest,
  SiweChallengeResponse,
  SiweVerifyRequest,
  SiweVerifyResponse
} from "@synoptic/types/rest";
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

const passportExchangeSchema = z.object({
  passportToken: z.string().min(1),
  agentId: z.string().min(1).optional(),
  ownerAddress: z.string().min(1).optional(),
  scopes: z.array(z.string()).optional()
});

const nonces = new Map<string, { nonce: string; expiresAt: number }>();

export function registerAuthRoutes(app: Express, context: ApiContext): void {
  app.post(
    "/auth/passport/exchange",
    async (
      req: Request<unknown, PassportTokenExchangeResponse, PassportTokenExchangeRequest>,
      res: Response<PassportTokenExchangeResponse>
    ) => {
      if (context.config.AUTH_MODE !== "passport") {
        sendApiError(
          res,
          new ApiError("VALIDATION_ERROR", 409, "Passport token exchange is only enabled when AUTH_MODE=passport"),
          req.requestId
        );
        return;
      }

      const parsed = passportExchangeSchema.safeParse(req.body);
      if (!parsed.success) {
        sendApiError(res, new ApiError("VALIDATION_ERROR", 400, "Invalid Passport exchange payload"), req.requestId);
        return;
      }

      try {
        const claims = await verifyPassportToken(context, parsed.data.passportToken);
        const ownerAddress = (parsed.data.ownerAddress ?? claims.ownerAddress).toLowerCase();
        const token = issueToken(context, {
          agentId: parsed.data.agentId ?? claims.agentId,
          ownerAddress,
          scopes: parsed.data.scopes ?? claims.scopes
        });

        res.json({
          token,
          ownerAddress,
          subject: claims.subject
        });
      } catch (error) {
        sendApiError(
          res,
          error instanceof ApiError ? error : new ApiError("UNAUTHORIZED", 401, "Passport verification failed"),
          req.requestId
        );
      }
    }
  );

  app.post(
    "/auth/siwe/challenge",
    (req: Request<unknown, SiweChallengeResponse, SiweChallengeRequest>, res: Response<SiweChallengeResponse>) => {
      if (context.config.AUTH_MODE === "passport") {
        sendApiError(
          res,
          new ApiError("VALIDATION_ERROR", 409, "SIWE challenge disabled when AUTH_MODE=passport"),
          req.requestId
        );
        return;
      }

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
    if (context.config.AUTH_MODE === "passport") {
      sendApiError(
        res,
        new ApiError("VALIDATION_ERROR", 409, "SIWE verify disabled when AUTH_MODE=passport"),
        req.requestId
      );
      return;
    }

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

interface PassportClaims {
  subject?: string;
  agentId: string;
  ownerAddress: string;
  scopes: string[];
}

async function verifyPassportToken(context: ApiContext, passportToken: string): Promise<PassportClaims> {
  const verifyUrl = context.config.PASSPORT_VERIFY_URL;
  if (!verifyUrl) {
    throw new ApiError("UNAUTHORIZED", 401, "Passport verification endpoint is not configured");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, context.config.PASSPORT_VERIFY_TIMEOUT_MS);

  try {
    const response = await fetch(verifyUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(context.config.PASSPORT_API_KEY ? { "x-api-key": context.config.PASSPORT_API_KEY } : {})
      },
      body: JSON.stringify({ token: passportToken }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new ApiError("UNAUTHORIZED", 401, "Passport verifier rejected token");
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const ownerAddress = readString(payload, ["ownerAddress", "address", "walletAddress"]);
    const agentId = readString(payload, ["agentId", "agent_id"]) ?? readString(payload, ["sub", "subject"]);

    if (!ownerAddress || !agentId) {
      throw new ApiError("UNAUTHORIZED", 401, "Passport verifier response missing required identity claims");
    }

    return {
      subject: readString(payload, ["sub", "subject"]),
      ownerAddress,
      agentId,
      scopes: readScopes(payload.scopes)
    };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError("UNAUTHORIZED", 401, "Passport verification failed");
  } finally {
    clearTimeout(timeout);
  }
}

function readString(payload: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}

function readScopes(scopes: unknown): string[] {
  if (!Array.isArray(scopes)) {
    return ["agent:read", "agent:write", "trade:execute"];
  }

  return scopes.filter((scope): scope is string => typeof scope === "string" && scope.length > 0);
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
