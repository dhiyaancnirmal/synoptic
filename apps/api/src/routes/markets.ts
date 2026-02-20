import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { Express, Request, Response } from "express";
import { z } from "zod";
import type { ApiErrorResponse, MarketExecuteRequest, MarketExecuteResponse, MarketQuoteRequest, MarketQuoteResponse } from "@synoptic/types/rest";
import type { OrderRejectionReason } from "@synoptic/types/orders";
import type { ApiContext } from "../context.js";
import { requireAuth } from "../middleware/auth.js";
import { createX402Middleware } from "../middleware/x402.js";
import { createExecutionOrchestrator } from "../services/execution-orchestrator.js";
import { publishEvent } from "../services/events.js";
import { ApiError, sendApiError } from "../utils/errors.js";
import { mapOrder } from "../utils/mappers.js";

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

function requestHash(body: unknown): string {
  return createHash("sha256").update(JSON.stringify(body)).digest("hex");
}

function deriveExecutionIdempotencyKey(input: MarketExecuteRequest): string {
  const nonce = input.quoteId ?? "no-quote";
  const source = `${input.agentId}|${input.marketId}|${input.side}|${input.size}|${nonce}`;
  return createHash("sha256").update(source).digest("hex");
}

async function loadAgentOrFail(context: ApiContext, agentId: string): Promise<void> {
  const agent = await context.prisma.agent.findUnique({ where: { agentId } });
  if (!agent) {
    throw new ApiError("NOT_FOUND", 404, "Agent does not exist");
  }
}

function startOfUtcDay(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

async function getRiskRule(context: ApiContext, agentId: string): Promise<{ perTxLimit: number; dailyLimit: number; dailySpent: number }> {
  const defaultPerTx = 1000;
  const defaultDaily = 50000;

  const currentDay = startOfUtcDay();
  const rule = await context.prisma.riskRule.findUnique({ where: { agentId } });

  if (!rule) {
    return { perTxLimit: defaultPerTx, dailyLimit: defaultDaily, dailySpent: 0 };
  }

  if (rule.lastResetDate.getTime() < currentDay.getTime()) {
    await context.prisma.riskRule.update({
      where: { agentId },
      data: {
        dailySpent: "0",
        lastResetDate: currentDay
      }
    });

    return { perTxLimit: Number(rule.perTxLimit), dailyLimit: Number(rule.dailyLimit), dailySpent: 0 };
  }

  return {
    perTxLimit: Number(rule.perTxLimit),
    dailyLimit: Number(rule.dailyLimit),
    dailySpent: Number(rule.dailySpent)
  };
}

async function computeRejectionReason(context: ApiContext, quote: MarketQuoteResponse): Promise<OrderRejectionReason | null> {
  const size = Number(quote.size);
  const notional = Number(quote.notional);

  if (Number.isNaN(size) || size <= 0 || Number.isNaN(notional) || notional <= 0) {
    return "INVALID_REQUEST";
  }

  const rule = await getRiskRule(context, quote.agentId);

  if (size > rule.perTxLimit) {
    return "RISK_LIMIT";
  }

  if (notional > context.config.MAX_TRADE_NOTIONAL_BUSDT) {
    return "RISK_LIMIT";
  }

  if (rule.dailySpent + notional > rule.dailyLimit) {
    return "INSUFFICIENT_FUNDS";
  }

  return null;
}

async function updateDailySpent(context: ApiContext, quote: MarketQuoteResponse): Promise<void> {
  const notional = Number(quote.notional);
  if (Number.isNaN(notional) || notional <= 0) {
    return;
  }

  const currentDay = startOfUtcDay();
  const existing = await context.prisma.riskRule.findUnique({ where: { agentId: quote.agentId } });
  if (!existing) {
    return;
  }

  const baseline = existing.lastResetDate.getTime() < currentDay.getTime() ? 0 : Number(existing.dailySpent);
  const nextSpent = baseline + notional;

  await context.prisma.riskRule.update({
    where: { agentId: quote.agentId },
    data: {
      dailySpent: nextSpent.toFixed(2),
      lastResetDate: currentDay
    }
  });
}

export function registerMarketsRoutes(app: Express, context: ApiContext): void {
  const authMiddleware = requireAuth(context.config.JWT_SECRET);
  const x402Quote = createX402Middleware(context, "/markets/quote");
  const x402Execute = createX402Middleware(context, "/markets/execute");
  const execution = createExecutionOrchestrator(context);

  app.post(
    "/markets/quote",
    authMiddleware,
    x402Quote,
    async (req: Request<unknown, MarketQuoteResponse | ApiErrorResponse, MarketQuoteRequest>, res: Response) => {
      const parsed = quoteSchema.safeParse(req.body);
      if (!parsed.success) {
        sendApiError(
          res,
          new ApiError("VALIDATION_ERROR", 400, "Invalid quote request", { reason: "INVALID_QUOTE_REQUEST", retryable: false }),
          req.requestId
        );
        return;
      }

      if (req.auth?.agentId !== parsed.data.agentId) {
        sendApiError(res, new ApiError("FORBIDDEN", 403, "Token does not match agentId"), req.requestId);
        return;
      }

      try {
        await loadAgentOrFail(context, parsed.data.agentId);
        const quote = await execution.quote(parsed.data);
        res.json(quote);
      } catch (error) {
        sendApiError(res, error as ApiError, req.requestId);
      }
    }
  );

  app.post(
    "/markets/execute",
    authMiddleware,
    x402Execute,
    async (req: Request<unknown, MarketExecuteResponse | ApiErrorResponse, MarketExecuteRequest>, res: Response) => {
      const parsed = executeSchema.safeParse(req.body);
      if (!parsed.success) {
        sendApiError(
          res,
          new ApiError("VALIDATION_ERROR", 400, "Invalid execute request", { reason: "INVALID_EXECUTE_REQUEST", retryable: false }),
          req.requestId
        );
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

      const idemKey = req.header("idempotency-key") ?? deriveExecutionIdempotencyKey(parsed.data);
      if (idemKey) {
        const existing = await context.prisma.idempotencyKey.findUnique({ where: { key: idemKey } });
        if (existing) {
          if (existing.requestHash !== requestHash(req.body)) {
            sendApiError(
              res,
              new ApiError("IDEMPOTENCY_CONFLICT", 409, "Idempotency key reused with different payload", {
                reason: "IDEMPOTENCY_KEY_PAYLOAD_MISMATCH",
                retryable: false
              }),
              req.requestId
            );
            return;
          }

          res.json(existing.responseJson as unknown as MarketExecuteResponse);
          return;
        }
      }

      const settlement = req.paymentSettlement;
      if (!settlement) {
        sendApiError(
          res,
          new ApiError("INVALID_PAYMENT", 402, "Payment settlement missing", { reason: "MISSING_SETTLEMENT", retryable: false }),
          req.requestId
        );
        return;
      }

      let quote: MarketQuoteResponse;
      try {
        quote = await execution.quote(parsed.data);
      } catch (error) {
        sendApiError(res, error as ApiError, req.requestId);
        return;
      }

      const riskRejection = await computeRejectionReason(context, quote);

      const executionResult =
        riskRejection === null
          ? await execution.execute(parsed.data, idemKey)
          : {
              bridge: {
                required: false,
                sourceTxHash: undefined,
                destinationTxHash: undefined,
                status: "SKIPPED" as const
              },
              swap: {
                txHash: undefined,
                status: "FAILED" as const,
                amountIn: undefined,
                amountOut: undefined
              },
              executionSource: quote.executionSource,
              uniswap: {
                quoteRequestId: quote.uniswap?.quoteRequestId,
                swapRequestId: undefined,
                routing: quote.uniswap?.routing
              },
              failureCode: "RISK_LIMIT" as const,
              rejectionReason: riskRejection
            };

      const rejectionReason = executionResult.rejectionReason ?? riskRejection;
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
            settlementId: settlement.settlementId,
            quoteId: quote.quoteId,
            idempotencyKey: idemKey,
            reason: rejectionReason,
            failureCode: executionResult.failureCode,
            executionSource: executionResult.executionSource,
            uniswapQuoteRequestId: executionResult.uniswap?.quoteRequestId,
            uniswapSwapRequestId: executionResult.uniswap?.swapRequestId
          }
        });
      } else {
        await updateDailySpent(context, quote);
        await publishEvent(context, {
          eventName: "trade.executed",
          agentId: parsed.data.agentId,
          status: "SUCCESS",
          metadata: {
            orderId: order.orderId,
            settlementId: settlement.settlementId,
            quoteId: quote.quoteId,
            idempotencyKey: idemKey,
            swapTxHash: executionResult.swap.txHash,
            bridgeSourceTxHash: executionResult.bridge.sourceTxHash,
            bridgeDestinationTxHash: executionResult.bridge.destinationTxHash,
            executionSource: executionResult.executionSource,
            uniswapQuoteRequestId: executionResult.uniswap?.quoteRequestId,
            uniswapSwapRequestId: executionResult.uniswap?.swapRequestId
          }
        });
      }

      const response: MarketExecuteResponse = {
        order: mapOrder(order),
        settlement,
        executionPath: "BASE_SEPOLIA_UNISWAP_V3",
        executionSource: executionResult.executionSource,
        evidence: {
          idempotencyKey: idemKey,
          quoteId: quote.quoteId,
          orderId: order.orderId,
          settlementId: settlement.settlementId
        },
        uniswap: executionResult.uniswap,
        bridge: executionResult.bridge,
        swap: executionResult.swap,
        failureCode: executionResult.failureCode
      };

      // Prisma Json type may reference InputJsonValue not exported in some build environments
      await (context.prisma as any).idempotencyKey.create({
        data: {
          key: idemKey,
          route: "/markets/execute",
          requestHash: requestHash(req.body),
          responseJson: response,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000)
        }
      });

      res.json(response);
    }
  );
}
