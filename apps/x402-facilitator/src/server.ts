import Fastify, { type FastifyInstance } from "fastify";
import type { FacilitatorEnv } from "./env.js";
import { loadEnv } from "./env.js";
import { normalizePaymentRequest, PaymentValidationError } from "./payload.js";
import { KiteSettlementClient, SettlementExecutionError } from "./settlement.js";
import type { SettlementClient } from "./types.js";

function sendError(
  app: FastifyInstance,
  status: number,
  input: { code: string; message: string; details?: Record<string, unknown> }
): { code: string; message: string; details?: Record<string, unknown> } {
  app.log.warn({ status, code: input.code, details: input.details }, input.message);
  return {
    code: input.code,
    message: input.message,
    ...(input.details ? { details: input.details } : {})
  };
}

function mapVerifyError(app: FastifyInstance, error: unknown) {
  if (error instanceof PaymentValidationError) {
    return {
      status: error.status,
      body: sendError(app, error.status, {
        code: error.code,
        message: error.message,
        details: error.details
      })
    };
  }

  if (error instanceof SettlementExecutionError) {
    const status = error.code === "chain_id_mismatch" ? 500 : 400;
    return {
      status,
      body: sendError(app, status, {
        code: error.code,
        message: error.message,
        details: error.details
      })
    };
  }

  const message = error instanceof Error ? error.message : String(error);
  return {
    status: 500,
    body: sendError(app, 500, {
      code: "verify_internal_error",
      message: "Internal verify error",
      details: { reason: message }
    })
  };
}

function mapSettleError(app: FastifyInstance, error: unknown) {
  if (error instanceof PaymentValidationError) {
    return {
      status: error.status,
      body: sendError(app, error.status, {
        code: error.code,
        message: error.message,
        details: error.details
      })
    };
  }

  if (error instanceof SettlementExecutionError) {
    const status =
      error.code === "missing_private_key" || error.code === "chain_id_mismatch" ? 500 : 402;
    return {
      status,
      body: sendError(app, status, {
        code: error.code,
        message: error.message,
        details: error.details
      })
    };
  }

  const message = error instanceof Error ? error.message : String(error);
  return {
    status: 500,
    body: sendError(app, 500, {
      code: "settle_internal_error",
      message: "Internal settle error",
      details: { reason: message }
    })
  };
}

export async function createServer(input: {
  env?: FacilitatorEnv;
  settlementClient?: SettlementClient;
} = {}): Promise<FastifyInstance> {
  const env = input.env ?? loadEnv();
  const settlement = input.settlementClient ?? new KiteSettlementClient(env);
  const app = Fastify({ logger: true });

  app.get("/health", async () => ({
    status: "ok",
    service: "x402-facilitator",
    timestamp: new Date().toISOString(),
    network: env.canonicalNetwork,
    scheme: env.canonicalScheme,
    chainId: env.chainId,
    configured: {
      rpcUrl: Boolean(env.rpcUrl),
      privateKey: Boolean(env.privateKey)
    }
  }));

  app.get("/v2/supported", async () => ({
    kinds: [
      {
        x402Version: 1,
        scheme: env.canonicalScheme,
        network: env.canonicalNetwork
      }
    ]
  }));

  app.post("/v2/verify", async (request, reply) => {
    try {
      const payment = normalizePaymentRequest(request.body, env);
      await settlement.simulate(payment);
      return {
        valid: true,
        verified: true,
        authorized: true,
        scheme: payment.scheme,
        network: payment.network,
        x402Version: payment.x402Version,
        paymentRequestId: payment.paymentRequestId
      };
    } catch (error) {
      const mapped = mapVerifyError(app, error);
      return reply.status(mapped.status).send(mapped.body);
    }
  });

  app.post("/v2/settle", async (request, reply) => {
    try {
      const payment = normalizePaymentRequest(request.body, env);
      await settlement.simulate(payment);
      const txHash = await settlement.settle(payment);
      return {
        settled: true,
        success: true,
        txHash,
        scheme: payment.scheme,
        network: payment.network,
        x402Version: payment.x402Version,
        paymentRequestId: payment.paymentRequestId
      };
    } catch (error) {
      const mapped = mapSettleError(app, error);
      return reply.status(mapped.status).send(mapped.body);
    }
  });

  return app;
}
