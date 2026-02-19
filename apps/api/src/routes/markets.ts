import { createHash, randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";
import { z } from "zod";
import type { OrderRecord, OrderRejectionReason } from "@synoptic/types/orders";
import type {
  ApiErrorResponse,
  GetOrderResponse,
  MarketExecuteRequest,
  MarketExecuteResponse,
  MarketQuoteRequest,
  MarketQuoteResponse
} from "@synoptic/types/rest";
import type { ApiContext } from "../context.js";
import { requireAuth } from "../middleware/auth.js";
import { createX402Middleware } from "../middleware/x402.js";
import { publishEvent } from "../services/events.js";
import { buildDeterministicQuote } from "../services/quote.js";
import { ApiError, sendApiError } from "../utils/errors.js";

const quoteSchema = z.object({
  agentId: z.string().min(1),
  venueType: z.enum(["SPOT", "PERP", "PREDICTION"]),
  marketId: z.string().min(1),
  side: z.enum(["BUY", "SELL"]),
  size: z.string().min(1),
  limitPrice: z.string().optional()
});

const executeSchema = quoteSchema.extend({
  quoteId: z.string().uuid().optional()
});

function mapOrder(order: {
  orderId: string;
  agentId: string;
  status: "PENDING" | "EXECUTED" | "REJECTED";
  venueType: "SPOT" | "PERP" | "PREDICTION";
  marketId: string;
  side: "BUY" | "SELL";
  size: string;
  limitPrice: string | null;
  rejectionReason: OrderRejectionReason | null;
  paymentSettlementId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): OrderRecord {
  return {
    orderId: order.orderId,
    agentId: order.agentId,
    status: order.status,
    venueType: order.venueType,
    marketId: order.marketId,
    side: order.side,
    size: order.size,
    limitPrice: order.limitPrice ?? undefined,
    rejectionReason: order.rejectionReason ?? undefined,
    paymentSettlementId: order.paymentSettlementId ?? undefined,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString()
  };
}

function requestHash(body: unknown): string {
  return createHash("sha256").update(JSON.stringify(body)).digest("hex");
}

async function loadAgentOrFail(context: ApiContext, agentId: string): Promise<void> {
  const agent = await context.prisma.agent.findUnique({ where: { agentId } });
  if (!agent) {
    throw new ApiError("NOT_FOUND", 404, "Agent does not exist");
  }
}

function computeRejectionReason(quote: MarketQuoteResponse): OrderRejectionReason | null {
  const size = Number(quote.size);
  const notional = Number(quote.notional);

  if (Number.isNaN(size) || size <= 0 || Number.isNaN(notional)) {
    return "INVALID_REQUEST";
  }

  if (size > 1000) {
    return "RISK_LIMIT";
  }

  if (notional > 50000) {
    return "INSUFFICIENT_FUNDS";
  }

  return null;
}

export function registerMarketsRoutes(app: Express, context: ApiContext): void {
  const authMiddleware = requireAuth(context.config.JWT_SECRET);
  const x402Quote = createX402Middleware(context, "/markets/quote");
  const x402Execute = createX402Middleware(context, "/markets/execute");

  app.post(
    "/markets/quote",
    authMiddleware,
    x402Quote,
    async (req: Request<unknown, MarketQuoteResponse | ApiErrorResponse, MarketQuoteRequest>, res: Response) => {
      const parsed = quoteSchema.safeParse(req.body);
      if (!parsed.success) {
        sendApiError(res, new ApiError("VALIDATION_ERROR", 400, "Invalid quote request"), req.requestId);
        return;
      }

      if (req.auth?.agentId !== parsed.data.agentId) {
        sendApiError(res, new ApiError("FORBIDDEN", 403, "Token does not match agentId"), req.requestId);
        return;
      }

      try {
        await loadAgentOrFail(context, parsed.data.agentId);
      } catch (error) {
        sendApiError(res, error as ApiError, req.requestId);
        return;
      }

      const quote = buildDeterministicQuote(parsed.data);
      res.json(quote);
    }
  );

  app.post(
    "/markets/execute",
    authMiddleware,
    x402Execute,
    async (req: Request<unknown, MarketExecuteResponse | ApiErrorResponse, MarketExecuteRequest>, res: Response) => {
      const parsed = executeSchema.safeParse(req.body);
      if (!parsed.success) {
        sendApiError(res, new ApiError("VALIDATION_ERROR", 400, "Invalid execute request"), req.requestId);
        return;
      }

      if (req.auth?.agentId !== parsed.data.agentId) {
        sendApiError(res, new ApiError("FORBIDDEN", 403, "Token does not match agentId"), req.requestId);
        return;
      }

      try {
        await loadAgentOrFail(context, parsed.data.agentId);
      } catch (error) {
        sendApiError(res, error as ApiError, req.requestId);
        return;
      }

      const idemKey = req.header("idempotency-key") ?? parsed.data.quoteId;
      if (idemKey) {
        const existing = await context.prisma.idempotencyKey.findUnique({ where: { key: idemKey } });
        if (existing) {
          if (existing.requestHash !== requestHash(req.body)) {
            sendApiError(res, new ApiError("VALIDATION_ERROR", 409, "Idempotency key reused with different payload"), req.requestId);
            return;
          }

          res.json(existing.responseJson as MarketExecuteResponse);
          return;
        }
      }

      const quote = buildDeterministicQuote(parsed.data);
      const rejectionReason = computeRejectionReason(quote);
      const settlement = req.paymentSettlement;

      if (!settlement) {
        sendApiError(res, new ApiError("INVALID_PAYMENT", 402, "Payment settlement missing"), req.requestId);
        return;
      }

      const order = await context.prisma.order.create({
        data: {
          orderId: randomUUID(),
          agentId: parsed.data.agentId,
          status: rejectionReason ? "REJECTED" : "EXECUTED",
          venueType: parsed.data.venueType,
          marketId: parsed.data.marketId,
          side: parsed.data.side,
          size: parsed.data.size,
          limitPrice: parsed.data.limitPrice,
          rejectionReason,
          paymentSettlementId: settlement.settlementId
        }
      });

      if (rejectionReason) {
        await publishEvent(context, {
          eventName: rejectionReason === "RISK_LIMIT" ? "risk.limit.hit" : "trade.rejected",
          agentId: parsed.data.agentId,
          status: "ERROR",
          metadata: {
            orderId: order.orderId,
            reason: rejectionReason
          }
        });
      } else {
        await publishEvent(context, {
          eventName: "trade.executed",
          agentId: parsed.data.agentId,
          status: "SUCCESS",
          metadata: {
            orderId: order.orderId,
            settlementId: settlement.settlementId
          }
        });
      }

      const response: MarketExecuteResponse = {
        order: mapOrder(order),
        settlement
      };

      if (idemKey) {
        await context.prisma.idempotencyKey.create({
          data: {
            key: idemKey,
            route: "/markets/execute",
            requestHash: requestHash(req.body),
            responseJson: response
          }
        });
      }

      res.json(response);
    }
  );

  app.get("/orders/:orderId", authMiddleware, async (req: Request<{ orderId: string }>, res: Response<GetOrderResponse>) => {
    const order = await context.prisma.order.findUnique({ where: { orderId: req.params.orderId } });
    if (!order) {
      sendApiError(res, new ApiError("NOT_FOUND", 404, "Order not found"), req.requestId);
      return;
    }

    if (req.auth?.agentId !== order.agentId) {
      sendApiError(res, new ApiError("FORBIDDEN", 403, "Order does not belong to caller"), req.requestId);
      return;
    }

    res.json({ order: mapOrder(order) });
  });
}
