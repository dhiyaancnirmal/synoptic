import { randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import type { SiweChallengeRequest, SiweChallengeResponse, SiweVerifyRequest, SiweVerifyResponse } from "@synoptic/types/rest";
import type { ApiContext } from "../context.js";
import { ApiError, sendApiError } from "../utils/errors.js";

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

export function registerAuthRoutes(app: Express, context: ApiContext): void {
  app.post(
    "/auth/siwe/challenge",
    (req: Request<unknown, SiweChallengeResponse, SiweChallengeRequest>, res: Response<SiweChallengeResponse>) => {
      const parsed = challengeSchema.safeParse(req.body);
      if (!parsed.success) {
        sendApiError(res, new ApiError("VALIDATION_ERROR", 400, "Invalid SIWE challenge payload"), req.requestId);
        return;
      }

      const nonce = randomUUID();
      res.json({
        nonce,
        message: `Sign in to Synoptic for ${parsed.data.address}. Nonce: ${nonce}`
      });
    }
  );

  app.post("/auth/siwe/verify", (req: Request<unknown, SiweVerifyResponse, SiweVerifyRequest>, res: Response<SiweVerifyResponse>) => {
    const parsed = verifySchema.safeParse(req.body);
    if (!parsed.success) {
      sendApiError(res, new ApiError("VALIDATION_ERROR", 400, "Invalid SIWE verify payload"), req.requestId);
      return;
    }

    const token = jwt.sign(
      {
        agentId: parsed.data.agentId,
        ownerAddress: parsed.data.ownerAddress,
        scopes: parsed.data.scopes ?? ["agent:read", "agent:write", "trade:execute"]
      },
      context.config.JWT_SECRET,
      { expiresIn: "12h" }
    );

    res.json({ token });
  });
}
