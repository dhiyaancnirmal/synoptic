import type { NextFunction, Request, Response } from "express";
import type { X402ChallengeResponse } from "@synoptic/types/rest";
import type { ApiContext } from "../context.js";
import { publishEvent } from "../services/events.js";
import { ApiError, sendApiError } from "../utils/errors.js";

export function createX402Middleware(context: ApiContext, route: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const requirement = context.paymentService.createRequirement();
    const header = req.header("x-payment");
    const agentId = req.auth?.agentId;

    if (!header || header.trim().length === 0 || !agentId) {
      await issueChallenge(context, route, agentId, req.requestId);
      const challenge: X402ChallengeResponse = {
        code: "PAYMENT_REQUIRED",
        message: "This endpoint requires a valid X-PAYMENT header",
        payment: requirement,
        retryWithHeader: "X-PAYMENT"
      };
      res.status(402).json(challenge);
      return;
    }

    try {
      const settlement = await context.paymentService.processPayment({
        xPaymentHeader: header,
        requirement,
        agentId,
        prisma: context.prisma,
        route
      });
      req.paymentSettlement = settlement;

      await publishEvent(context, {
        eventName: "x402.payment.settled",
        agentId,
        status: "SUCCESS",
        metadata: {
          route,
          settlementId: settlement.settlementId,
          txHash: settlement.txHash ?? null
        }
      });

      next();
    } catch (error) {
      const apiError =
        error instanceof ApiError ? error : new ApiError("FACILITATOR_UNAVAILABLE", 503, "Payment processing failed");

      if (apiError.code === "INVALID_PAYMENT") {
        await issueChallenge(context, route, agentId, req.requestId);
        const challenge: X402ChallengeResponse = {
          code: "PAYMENT_REQUIRED",
          message: apiError.message,
          payment: requirement,
          retryWithHeader: "X-PAYMENT"
        };
        res.status(402).json(challenge);
        return;
      }

      sendApiError(res, apiError, req.requestId);
    }
  };
}

async function issueChallenge(
  context: ApiContext,
  route: string,
  agentId: string | undefined,
  requestId: string | undefined
): Promise<void> {
  if (!agentId) {
    return;
  }

  try {
    await publishEvent(context, {
      eventName: "x402.challenge.issued",
      agentId,
      status: "INFO",
      metadata: {
        route,
        requestId: requestId ?? null
      }
    });
  } catch {
    context.logger?.warn({ route, agentId, requestId }, "Failed to persist x402 challenge event");
  }
}
