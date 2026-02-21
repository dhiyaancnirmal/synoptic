import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { PaymentAdapter } from "@synoptic/agent-core";
import type { RuntimeStoreContract } from "../state/runtime-store.js";
import { WsHub } from "../ws/hub.js";
import { requireX402PaymentForResource } from "../oracle/middleware.js";

interface MarketplaceDeps {
  store: RuntimeStoreContract;
  wsHub: WsHub;
  paymentAdapter: PaymentAdapter;
  network: string;
  payToAddress: string;
  paymentAssetAddress: string;
  paymentAssetDecimals: number;
  budgetResetTimeZone: string;
}

interface CatalogItem {
  sku: string;
  name: string;
  description: string;
  priceUsd: number;
  dataSource: string;
  sampleSize: number;
}

const CATALOG: CatalogItem[] = [
  {
    sku: "monad_transfer_feed",
    name: "Monad Transfer Feed",
    description:
      "Recent ERC-20 token transfers on Monad testnet extracted from QuickNode Streams block data.",
    priceUsd: 0.1,
    dataSource: "derived_transfers",
    sampleSize: 3
  },
  {
    sku: "monad_contract_activity",
    name: "Contract Activity Report",
    description:
      "Per-contract transaction stats and caller analytics derived from QuickNode Streams.",
    priceUsd: 0.25,
    dataSource: "derived_contract_activity",
    sampleSize: 3
  },
  {
    sku: "monad_block_summary",
    name: "Block Summary Analytics",
    description:
      "Block-level gas utilization, transaction density, and timing metrics from QuickNode Streams.",
    priceUsd: 0.05,
    dataSource: "stream_blocks",
    sampleSize: 3
  }
];

function findSku(sku: string): CatalogItem | undefined {
  return CATALOG.find((item) => item.sku === sku);
}

function hashPayload(data: unknown): string {
  return createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

async function querySkuData(
  sku: string,
  store: RuntimeStoreContract,
  limit?: number
): Promise<unknown[]> {
  switch (sku) {
    case "monad_transfer_feed":
      return store.queryDerivedTransfers(limit);
    case "monad_contract_activity":
      return store.queryContractActivity(limit);
    case "monad_block_summary":
      return store.queryStreamBlocks(limit);
    default:
      return [];
  }
}

export async function registerMarketplaceRoutes(
  app: FastifyInstance,
  deps: MarketplaceDeps
): Promise<void> {
  app.get("/marketplace/catalog", async () => ({
    catalog: CATALOG.map(({ sku, name, description, priceUsd, dataSource }) => ({
      sku,
      name,
      description,
      priceUsd,
      dataSource
    }))
  }));

  app.get("/marketplace/products/:sku/preview", async (request, reply) => {
    const { sku } = request.params as { sku: string };
    const item = findSku(sku);
    if (!item) {
      return reply.status(404).send({ code: "SKU_NOT_FOUND", message: `Unknown SKU: ${sku}` });
    }

    const data = await querySkuData(sku, deps.store, item.sampleSize);
    return {
      sku: item.sku,
      name: item.name,
      priceUsd: item.priceUsd,
      preview: true,
      sampleSize: item.sampleSize,
      data
    };
  });

  app.post("/marketplace/products/:sku/purchase", async (request, reply) => {
    const { sku } = request.params as { sku: string };
    const item = findSku(sku);
    if (!item) {
      return reply.status(404).send({ code: "SKU_NOT_FOUND", message: `Unknown SKU: ${sku}` });
    }

    const allowed = await requireX402PaymentForResource(request, reply, {
      store: deps.store,
      paymentAdapter: deps.paymentAdapter,
      network: deps.network,
      payToAddress: deps.payToAddress,
      paymentAssetAddress: deps.paymentAssetAddress,
      paymentAssetDecimals: deps.paymentAssetDecimals,
      budgetResetTimeZone: deps.budgetResetTimeZone,
      enforceLocalBudget: false,
      onPayment(payment) {
        deps.wsHub.broadcast({ type: "payment.update", payment });
      },
      onActivity(event) {
        deps.wsHub.broadcast({ type: "activity.new", event });
      }
    }, {
      resourcePath: `/marketplace/products/${sku}/purchase`,
      description: item.description,
      merchantName: "Synoptic Marketplace",
      costUsd: item.priceUsd,
      metadata: { sku: item.sku, dataSource: item.dataSource }
    });

    if (!allowed) return;

    const data = await querySkuData(sku, deps.store, 50);
    const resultHash = hashPayload(data);

    // Find the most recent settled payment for this request
    const payments = await deps.store.listPayments();
    const settledPayment = payments.find(
      (p) => p.status === "settled" && p.serviceUrl === `/marketplace/products/${sku}/purchase`
    );

    const purchase = await deps.store.createPurchase({
      agentId: settledPayment?.agentId,
      sku: item.sku,
      params: (request.body as Record<string, unknown>) ?? {},
      paymentId: settledPayment?.id,
      status: "completed",
      resultHash,
      resultPayload: { data }
    });

    deps.wsHub.broadcast({
      type: "activity.new",
      event: {
        id: purchase.id,
        agentId: settledPayment?.agentId ?? "unknown",
        eventType: "marketplace.purchase",
        chain: "monad",
        data: {
          sku: item.sku,
          purchaseId: purchase.id,
          paymentId: settledPayment?.id,
          resultHash
        },
        createdAt: purchase.createdAt
      }
    });

    return {
      purchaseId: purchase.id,
      sku: item.sku,
      paymentId: settledPayment?.id,
      settlementTxHash: settledPayment?.kiteTxHash,
      data,
      resultHash,
      timestamp: purchase.createdAt
    };
  });

  app.get("/api/marketplace/purchases", async (request) => {
    const agentId = (request.query as { agentId?: string })?.agentId;
    const purchases = await deps.store.listPurchases(agentId);
    return { purchases };
  });

  app.get("/api/marketplace/purchases/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const purchase = await deps.store.getPurchase(id);
    if (!purchase) {
      return reply.status(404).send({ code: "NOT_FOUND", message: "Purchase not found" });
    }
    return { purchase };
  });
}
