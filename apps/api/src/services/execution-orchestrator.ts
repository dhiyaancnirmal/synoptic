import { randomUUID } from "node:crypto";
import type { OrderRejectionReason } from "@synoptic/types/orders";
import type { MarketExecuteRequest, MarketExecuteResponse, MarketQuoteRequest, MarketQuoteResponse } from "@synoptic/types/rest";
import { formatUnits, parseUnits, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { ApiContext } from "../context.js";
import { ApiError } from "../utils/errors.js";
import { publishEvent } from "./events.js";
import { type BridgeAdapter, createBridgeAdapter } from "./chains/bridge-adapter.js";
import { type UniswapV3Adapter, createUniswapV3Adapter } from "./chains/uniswap-v3-adapter.js";

export const SUPPORTED_MARKET_ID = "KITE_bUSDT_BASE_SEPOLIA";
const V3_FEE = 3000;

export interface ExecutionResult {
  bridge: NonNullable<MarketExecuteResponse["bridge"]>;
  swap: NonNullable<MarketExecuteResponse["swap"]>;
  failureCode?: NonNullable<MarketExecuteResponse["failureCode"]>;
  rejectionReason?: OrderRejectionReason;
}

export interface ExecutionOrchestrator {
  quote(input: MarketQuoteRequest): Promise<MarketQuoteResponse>;
  execute(input: MarketExecuteRequest, idempotencyKey: string): Promise<ExecutionResult>;
}

export function createExecutionOrchestrator(
  context: ApiContext,
  deps: {
    bridgeAdapter?: BridgeAdapter;
    uniswapAdapter?: UniswapV3Adapter;
  } = {}
): ExecutionOrchestrator {
  const bridgeAdapter = deps.bridgeAdapter ?? createBridgeAdapter(context.config);
  const uniswapAdapter = deps.uniswapAdapter ?? createUniswapV3Adapter(context.config);

  return {
    async quote(input) {
      assertSupportedMarket(input.marketId);
      if (input.side !== "BUY") {
        throw new ApiError("VALIDATION_ERROR", 400, "Only BUY side is supported in V1", {
          reason: "UNSUPPORTED_SIDE",
          retryable: false
        });
      }

      const { tokenIn, tokenOut } = resolvePair(context, input.side);
      const amountIn = parseTradeSize(input.size);
      const liquidity = await uniswapAdapter.checkPoolLiquidity({ tokenIn, tokenOut, fee: V3_FEE });

      if (!liquidity.ok || !liquidity.poolAddress) {
        throw new ApiError("LIQUIDITY_UNAVAILABLE", 422, "Uniswap v3 pool has insufficient liquidity", {
          reason: "LIQUIDITY_UNAVAILABLE",
          retryable: false
        });
      }

      const quote = await uniswapAdapter.quoteExactInputSingle({
        tokenIn,
        tokenOut,
        amountIn,
        fee: V3_FEE
      });

      const notional = Number(input.side === "BUY" ? formatUnits(amountIn, 18) : formatUnits(quote.amountOut, 18));
      const fee = notional * 0.001;

      return {
        quoteId: randomUUID(),
        agentId: input.agentId,
        venueType: input.venueType,
        marketId: input.marketId,
        side: input.side,
        size: input.size,
        limitPrice: input.limitPrice,
        estimatedPrice: quote.estimatedPrice,
        notional: notional.toFixed(6),
        fee: fee.toFixed(6),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        route: "UNISWAP_V3",
        poolAddress: quote.poolAddress,
        priceImpactBps: quote.priceImpactBps,
        liquidityCheck: "PASS"
      };
    },

    async execute(input, idempotencyKey) {
      assertSupportedMarket(input.marketId);
      const quote = await this.quote(input);
      const amountIn = parseTradeSize(input.size);

      const intent = await context.prisma.executionIntent.upsert({
        where: { idempotencyKey },
        update: {
          status: "QUOTED",
          quoteJson: quote as unknown as object
        },
        create: {
          intentId: randomUUID(),
          idempotencyKey,
          agentId: input.agentId,
          marketId: input.marketId,
          side: input.side,
          size: input.size,
          status: "QUOTED",
          quoteJson: quote as unknown as object
        }
      });

      await context.prisma.executionIntent.update({
        where: { intentId: intent.intentId },
        data: { status: "RISK_OK" }
      });

      const { tokenIn, tokenOut } = resolvePair(context, input.side);
      const signer = signerAddress(context);
      const currentBaseBalance = await uniswapAdapter.readBalance(tokenIn, signer);
      const bridgeRequired = currentBaseBalance < amountIn;

      let sourceTxHash: string | undefined;
      let destinationTxHash: string | undefined;

      if (bridgeRequired) {
        await context.prisma.executionIntent.update({
          where: { intentId: intent.intentId },
          data: { status: "BRIDGE_REQUIRED" }
        });

        const bridgeAmount = amountIn - currentBaseBalance;
        await bridgeAdapter.estimate({ amount: bridgeAmount, sourceToken: context.config.KITE_TESTNET_USDT as Address, destinationChainId: context.config.BASE_SEPOLIA_CHAIN_ID });

        try {
          const submitted = await bridgeAdapter.submitBridge({
            amount: bridgeAmount,
            sourceToken: context.config.KITE_TESTNET_USDT as Address,
            destinationToken: tokenIn,
            recipient: signer,
            destinationChainId: context.config.BASE_SEPOLIA_CHAIN_ID
          });

          sourceTxHash = submitted.sourceTxHash;

          await context.prisma.executionIntent.update({
            where: { intentId: intent.intentId },
            data: {
              status: "BRIDGE_SUBMITTED",
              bridgeSourceTxHash: sourceTxHash
            }
          });

          await publishEvent(context, {
            eventName: "bridge.submitted",
            agentId: input.agentId,
            status: "INFO",
            metadata: {
              intentId: intent.intentId,
              sourceTxHash,
              amount: bridgeAmount.toString()
            }
          });

          const confirmed = await bridgeAdapter.waitDestinationCredit({
            amount: bridgeAmount,
            destinationToken: tokenIn,
            recipient: signer,
            destinationBalanceBefore: submitted.destinationBalanceBefore,
            destinationWatchFromBlock: submitted.destinationWatchFromBlock,
            timeoutMs: context.config.BRIDGE_TIMEOUT_MS
          });

          if (confirmed.status === "DELAYED") {
            await context.prisma.executionIntent.update({
              where: { intentId: intent.intentId },
              data: {
                status: "FAILED",
                failureCode: "BRIDGE_TIMEOUT"
              }
            });

            await publishEvent(context, {
              eventName: "bridge.failed",
              agentId: input.agentId,
              status: "ERROR",
              metadata: {
                intentId: intent.intentId,
                reason: "BRIDGE_TIMEOUT",
                sourceTxHash
              }
            });

            return {
              bridge: {
                required: true,
                sourceTxHash,
                status: "DELAYED"
              },
              swap: {
                status: "FAILED"
              },
              failureCode: "BRIDGE_TIMEOUT",
              rejectionReason: "BRIDGE_TIMEOUT"
            };
          }

          if (confirmed.status === "FAILED") {
            const failureCode = confirmed.failureCode ?? "BRIDGE_FAILED";

            await context.prisma.executionIntent.update({
              where: { intentId: intent.intentId },
              data: {
                status: "FAILED",
                failureCode
              }
            });

            await publishEvent(context, {
              eventName: "bridge.failed",
              agentId: input.agentId,
              status: "ERROR",
              metadata: {
                intentId: intent.intentId,
                reason: failureCode,
                sourceTxHash
              }
            });

            return {
              bridge: {
                required: true,
                sourceTxHash,
                status: "FAILED"
              },
              swap: {
                status: "FAILED"
              },
              failureCode,
              rejectionReason: "BRIDGE_FAILED"
            };
          }

          destinationTxHash = confirmed.destinationTxHash;

          await context.prisma.executionIntent.update({
            where: { intentId: intent.intentId },
            data: {
              status: "BRIDGE_CONFIRMED_DST",
              bridgeDestinationTxHash: destinationTxHash
            }
          });

          await publishEvent(context, {
            eventName: "bridge.confirmed",
            agentId: input.agentId,
            status: "SUCCESS",
            metadata: {
              intentId: intent.intentId,
              sourceTxHash,
              destinationTxHash
            }
          });
        } catch (error) {
          const failureCode = mapBridgeFailure(error);

          await context.prisma.executionIntent.update({
            where: { intentId: intent.intentId },
            data: {
              status: "FAILED",
              failureCode
            }
          });

          await publishEvent(context, {
            eventName: "bridge.failed",
            agentId: input.agentId,
            status: "ERROR",
            metadata: {
              intentId: intent.intentId,
              reason: failureCode,
              error: error instanceof Error ? error.message : "unknown"
            }
          });

          return {
            bridge: {
              required: true,
              status: "FAILED"
            },
            swap: {
              status: "FAILED"
            },
            failureCode,
            rejectionReason: "BRIDGE_FAILED"
          };
        }
      }

      await context.prisma.executionIntent.update({
        where: { intentId: intent.intentId },
        data: {
          status: "SWAP_SUBMITTED"
        }
      });

      await publishEvent(context, {
        eventName: "trade.swap.submitted",
        agentId: input.agentId,
        status: "INFO",
        metadata: {
          intentId: intent.intentId,
          bridgeRequired
        }
      });

      try {
        const swap = await uniswapAdapter.executeExactInputSingle({
          tokenIn,
          tokenOut,
          amountIn,
          fee: V3_FEE,
          slippageBps: context.config.SLIPPAGE_BPS,
          deadlineSeconds: context.config.SWAP_DEADLINE_SECONDS,
          recipient: signer
        });

        await context.prisma.executionIntent.update({
          where: { intentId: intent.intentId },
          data: {
            status: "SWAP_CONFIRMED",
            swapTxHash: swap.txHash
          }
        });

        await publishEvent(context, {
          eventName: "trade.swap.confirmed",
          agentId: input.agentId,
          status: "SUCCESS",
          metadata: {
            intentId: intent.intentId,
            txHash: swap.txHash,
            amountIn: swap.amountIn.toString(),
            amountOut: swap.amountOut.toString()
          }
        });

        return {
          bridge: {
            required: bridgeRequired,
            sourceTxHash,
            destinationTxHash,
            status: bridgeRequired ? "CONFIRMED" : "SKIPPED"
          },
          swap: {
            txHash: swap.txHash,
            status: "CONFIRMED",
            amountIn: formatUnits(swap.amountIn, 18),
            amountOut: formatUnits(swap.amountOut, 18)
          }
        };
      } catch (error) {
        const failureCode = mapSwapFailure(error);

        await context.prisma.executionIntent.update({
          where: { intentId: intent.intentId },
          data: {
            status: "FAILED",
            failureCode
          }
        });

        await publishEvent(context, {
          eventName: "trade.swap.failed",
          agentId: input.agentId,
          status: "ERROR",
          metadata: {
            intentId: intent.intentId,
            reason: failureCode,
            error: error instanceof Error ? error.message : "unknown"
          }
        });

        return {
          bridge: {
            required: bridgeRequired,
            sourceTxHash,
            destinationTxHash,
            status: bridgeRequired ? "CONFIRMED" : "SKIPPED"
          },
          swap: {
            status: "FAILED"
          },
          failureCode,
          rejectionReason: "SWAP_REVERTED"
        };
      }
    }
  };
}

function parseTradeSize(size: string): bigint {
  const numeric = Number(size);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new ApiError("VALIDATION_ERROR", 400, "Trade size must be positive", {
      reason: "INVALID_SIZE",
      retryable: false
    });
  }

  return parseUnits(size, 18);
}

function resolvePair(context: ApiContext, side: "BUY" | "SELL"): { tokenIn: Address; tokenOut: Address } {
  if (side === "BUY") {
    return {
      tokenIn: context.config.BUSDT_TOKEN_ON_BASE as Address,
      tokenOut: context.config.KITE_TOKEN_ON_BASE as Address
    };
  }

  return {
    tokenIn: context.config.KITE_TOKEN_ON_BASE as Address,
    tokenOut: context.config.BUSDT_TOKEN_ON_BASE as Address
  };
}

function signerAddress(context: ApiContext): Address {
  if (context.config.NODE_ENV === "test") {
    return "0x9999999999999999999999999999999999999999";
  }

  if (!context.config.SERVER_SIGNER_PRIVATE_KEY) {
    throw new ApiError("BRIDGE_FAILED", 500, "SERVER_SIGNER_PRIVATE_KEY is missing", {
      reason: "MISSING_SIGNER"
    });
  }

  return privateKeyToAccount(context.config.SERVER_SIGNER_PRIVATE_KEY as `0x${string}`).address;
}

function assertSupportedMarket(marketId: string): void {
  if (marketId !== SUPPORTED_MARKET_ID) {
    throw new ApiError("UNSUPPORTED_MARKET", 400, `Only ${SUPPORTED_MARKET_ID} is supported`, {
      reason: "UNSUPPORTED_MARKET",
      retryable: false
    });
  }
}

function mapBridgeFailure(error: unknown): "BRIDGE_FAILED" | "DESTINATION_CREDIT_NOT_FOUND" {
  const message = error instanceof Error ? error.message.toUpperCase() : "";
  if (message.includes("DESTINATION_CREDIT_NOT_FOUND")) {
    return "DESTINATION_CREDIT_NOT_FOUND";
  }
  return "BRIDGE_FAILED";
}

function mapSwapFailure(error: unknown): "SWAP_REVERTED" | "SLIPPAGE_EXCEEDED" {
  const message = error instanceof Error ? error.message.toUpperCase() : "";
  if (message.includes("SLIPPAGE") || message.includes("TOO_LITTLE_RECEIVED")) {
    return "SLIPPAGE_EXCEEDED";
  }
  return "SWAP_REVERTED";
}
