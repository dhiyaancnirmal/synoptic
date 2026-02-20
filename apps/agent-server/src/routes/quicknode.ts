import type { FastifyInstance, FastifyRequest } from "fastify";
import type { RuntimeStoreContract } from "../state/runtime-store.js";
import { WsHub } from "../ws/hub.js";

interface QuickNodeWebhookOptions {
  store: RuntimeStoreContract;
  wsHub: WsHub;
  securityToken?: string;
}

interface QuickNodeBlockLike {
  number?: string | number;
  hash?: string;
  parentHash?: string;
  timestamp?: string | number;
}

interface QuickNodeWebhookBody {
  data?: QuickNodeBlockLike[];
  [key: string]: unknown;
}

function extractToken(headers: FastifyRequest["headers"]): string | undefined {
  const auth = headers.authorization;
  if (typeof auth === "string" && auth.startsWith("Bearer ")) {
    return auth.slice("Bearer ".length).trim();
  }

  for (const value of Object.values(headers)) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function toDecimalString(value: string | number | undefined): string | undefined {
  if (typeof value === "number") return String(value);
  if (typeof value !== "string") return undefined;
  if (value.startsWith("0x")) {
    try {
      return BigInt(value).toString(10);
    } catch {
      return value;
    }
  }
  return value;
}

export async function registerQuickNodeWebhookRoutes(
  app: FastifyInstance,
  options: QuickNodeWebhookOptions
): Promise<void> {
  app.get("/webhooks/quicknode/monad", async () => ({
    ok: true,
    provider: "quicknode",
    network: "monad-testnet"
  }));

  app.post("/webhooks/quicknode/monad", async (request, reply) => {
    const configuredToken = options.securityToken?.trim();
    if (configuredToken) {
      const token = extractToken(request.headers);
      if (token !== configuredToken) {
        return reply.status(401).send({
          code: "QUICKNODE_UNAUTHORIZED",
          message: "Invalid QuickNode webhook token"
        });
      }
    }

    const payload = (request.body ?? {}) as QuickNodeWebhookBody;
    const block = payload.data?.[0];
    const blockNumber = toDecimalString(block?.number);
    const blockHash = block?.hash;

    const agents = await options.store.listAgents();
    const agent = agents[0] ?? (await options.store.createAgent({ name: "Webhook Agent", status: "idle" }));
    const event = await options.store.addActivity(agent.id, "quicknode.block.received", "monad", {
      dataset: "block",
      blockNumber,
      blockHash,
      parentHash: block?.parentHash,
      timestamp: block?.timestamp,
      payloadSizeBytes: JSON.stringify(payload).length
    });

    options.wsHub.broadcast({ type: "activity.new", event });
    return reply.status(200).send({
      ok: true,
      received: true,
      blockNumber,
      blockHash
    });
  });
}
