import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import {
  MONAD_CHAIN_ID,
  MONAD_TESTNET_CHAIN_ID,
  RealAttestationAdapter,
  type AttestationAdapter,
  type PaymentAdapter
} from "@synoptic/agent-core";
import type { RuntimeStoreContract } from "../state/runtime-store.js";
import { WsHub } from "../ws/hub.js";
import { requireX402PaymentForResource } from "../oracle/middleware.js";
import type { AgentServerEnv } from "../env.js";

interface MarketplaceDeps {
  store: RuntimeStoreContract;
  wsHub: WsHub;
  paymentAdapter: PaymentAdapter;
  env: AgentServerEnv;
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
  category: "lp_intelligence" | "orderflow" | "contract_analytics" | "signature_analytics" | "launch_monitor";
  refreshCadence: "realtime" | "1m" | "5m";
  sampleSchema: Record<string, string>;
  dataConfidence: "high" | "medium" | "experimental";
}

interface ValidationSuccess {
  ok: true;
  params: Record<string, unknown>;
}

interface ValidationFailure {
  ok: false;
  statusCode: number;
  code: "SKU_PARAMS_INVALID" | "CHAIN_UNSUPPORTED";
  message: string;
}

type ValidationResult = ValidationSuccess | ValidationFailure;

const MARKETPLACE_FETCH_LIMIT = 500;

const CATALOG: CatalogItem[] = [
  {
    sku: "monad_lp_range_signal",
    name: "Monad LP Range Signal",
    description: "Preset-ready LP range recommendations derived from stream volatility and orderflow bias.",
    priceUsd: 0.35,
    dataSource: "derived_transfers+stream_blocks",
    sampleSize: 3,
    category: "lp_intelligence",
    refreshCadence: "1m",
    sampleSchema: {
      token0: "string",
      token1: "string",
      volatilityScore: "number(0..1)",
      flowBias: "number(-1..1)",
      preset: "uniform|bell|bid_ask_inverse",
      bounds: "object"
    },
    dataConfidence: "medium"
  },
  {
    sku: "monad_orderflow_imbalance",
    name: "Monad Orderflow Imbalance",
    description: "Token-level inflow/outflow imbalance with active wallet participation from transfer streams.",
    priceUsd: 0.2,
    dataSource: "derived_transfers",
    sampleSize: 8,
    category: "orderflow",
    refreshCadence: "realtime",
    sampleSchema: {
      tokenAddress: "string",
      inflow: "number",
      outflow: "number",
      imbalance: "number(-1..1)",
      activeWallets: "number"
    },
    dataConfidence: "high"
  },
  {
    sku: "monad_contract_momentum",
    name: "Monad Contract Momentum",
    description: "Ranked contract momentum from transaction count, unique callers, and gas pressure.",
    priceUsd: 0.3,
    dataSource: "derived_contract_activity",
    sampleSize: 8,
    category: "contract_analytics",
    refreshCadence: "1m",
    sampleSchema: {
      contractAddress: "string",
      txCount: "number",
      uniqueCallers: "number",
      gasPressure: "number",
      momentumScore: "number"
    },
    dataConfidence: "medium"
  },
  {
    sku: "monad_selector_heatmap",
    name: "Monad Selector Heatmap",
    description: "Top smart contract method selectors extracted from transaction input signatures.",
    priceUsd: 0.15,
    dataSource: "stream_blocks.raw_payload",
    sampleSize: 10,
    category: "signature_analytics",
    refreshCadence: "realtime",
    sampleSchema: {
      selector: "string(0x12345678)",
      callCount: "number",
      uniqueContracts: "number",
      lastSeenBlock: "number"
    },
    dataConfidence: "medium"
  },
  {
    sku: "monad_launchpad_watch",
    name: "Monad Launchpad Watch",
    description: "New contract deployment radar with early activity acceleration scoring.",
    priceUsd: 0.4,
    dataSource: "stream_blocks.raw_payload+derived_contract_activity",
    sampleSize: 6,
    category: "launch_monitor",
    refreshCadence: "5m",
    sampleSchema: {
      contractAddress: "string",
      deployer: "string",
      firstSeenBlock: "number",
      activityTxCount: "number",
      accelerationScore: "number"
    },
    dataConfidence: "experimental"
  }
];

function findSku(sku: string): CatalogItem | undefined {
  return CATALOG.find((item) => item.sku === sku);
}

function hashPayload(data: unknown): string {
  return createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

function randomHex(bytes = 32): string {
  return `0x${createHash("sha256").update(String(Date.now()) + String(Math.random())).digest("hex").slice(0, bytes * 2)}`;
}

function createMarketplaceAttestationAdapter(env: AgentServerEnv): AttestationAdapter | undefined {
  if (env.kitePaymentMode === "demo" || env.swapExecutionMode === "simulated") {
    return {
      async recordService() {
        return { attestationTxHash: randomHex(32) };
      },
      async recordTrade() {
        return { attestationTxHash: randomHex(32) };
      }
    };
  }
  if (!env.agentPrivateKey || !env.kiteRpcUrl || !env.registryAddress) {
    return undefined;
  }
  return new RealAttestationAdapter({
    privateKey: env.agentPrivateKey,
    kiteRpcUrl: env.kiteRpcUrl,
    serviceRegistryAddress: env.registryAddress
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function toNormalizedParams(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object") return {};
  const record = input as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(record)) {
    if (raw === undefined || raw === null || raw === "") continue;
    if (Array.isArray(raw)) {
      if (raw.length > 0) result[key] = raw[0];
      continue;
    }
    result[key] = raw;
  }
  return result;
}

function isMonadChain(params: Record<string, unknown>): boolean {
  const chainId = toNumber(params.chainId);
  if (chainId !== undefined) {
    return chainId === MONAD_CHAIN_ID || chainId === MONAD_TESTNET_CHAIN_ID;
  }
  const chain = typeof params.chain === "string" ? params.chain.toLowerCase() : undefined;
  if (!chain) return true;
  return chain === "monad" || chain === "monad-testnet";
}

function requireNumberInRange(
  params: Record<string, unknown>,
  field: string,
  min: number,
  max: number
): number | undefined | ValidationFailure {
  if (!(field in params)) return undefined;
  const numeric = toNumber(params[field]);
  if (numeric === undefined || numeric < min || numeric > max) {
    return {
      ok: false,
      statusCode: 400,
      code: "SKU_PARAMS_INVALID",
      message: `${field} must be a number between ${min} and ${max}`
    };
  }
  return numeric;
}

function validateSkuRequest(sku: string, raw: Record<string, unknown>): ValidationResult {
  if (!isMonadChain(raw)) {
    return {
      ok: false,
      statusCode: 400,
      code: "CHAIN_UNSUPPORTED",
      message: "Only Monad chain data is available for this SKU"
    };
  }

  const params: Record<string, unknown> = {};
  const requestedChainId = toNumber(raw.chainId);
  const requestedChainRaw = typeof raw.chain === "string" ? raw.chain.toLowerCase() : undefined;
  const normalizedChainId =
    requestedChainId === MONAD_CHAIN_ID || requestedChainId === MONAD_TESTNET_CHAIN_ID
      ? requestedChainId
      : requestedChainRaw === "monad-testnet"
        ? MONAD_TESTNET_CHAIN_ID
        : MONAD_CHAIN_ID;
  const normalizedChain = normalizedChainId === MONAD_TESTNET_CHAIN_ID ? "monad-testnet" : "monad";

  if ("chainId" in raw) params.chainId = normalizedChainId;
  if ("chain" in raw) params.chain = normalizedChain;

  switch (sku) {
    case "monad_lp_range_signal": {
      const risk = requireNumberInRange(raw, "risk", 0, 1);
      if (typeof risk === "object" && risk !== null && risk.ok === false) return risk;
      params.risk = typeof risk === "number" ? risk : 0.5;

      const flowBias = requireNumberInRange(raw, "flowBias", -1, 1);
      if (typeof flowBias === "object" && flowBias !== null && flowBias.ok === false) return flowBias;
      if (typeof flowBias === "number") params.flowBias = flowBias;

      const volatilityScore = requireNumberInRange(raw, "volatilityScore", 0, 1);
      if (typeof volatilityScore === "object" && volatilityScore !== null && volatilityScore.ok === false) {
        return volatilityScore;
      }
      if (typeof volatilityScore === "number") params.volatilityScore = volatilityScore;

      const preset = typeof raw.preset === "string" ? raw.preset : undefined;
      if (preset) {
        const normalized = preset.toLowerCase();
        if (!["uniform", "bell", "bid_ask_inverse", "all"].includes(normalized)) {
          return {
            ok: false,
            statusCode: 400,
            code: "SKU_PARAMS_INVALID",
            message: "preset must be one of uniform|bell|bid_ask_inverse|all"
          };
        }
        params.preset = normalized;
      }

      if (typeof raw.token0 === "string" && raw.token0.trim()) params.token0 = raw.token0.trim();
      if (typeof raw.token1 === "string" && raw.token1.trim()) params.token1 = raw.token1.trim();
      return { ok: true, params };
    }

    case "monad_orderflow_imbalance": {
      const windowBlocks = requireNumberInRange(raw, "windowBlocks", 10, 20_000);
      if (typeof windowBlocks === "object" && windowBlocks !== null && windowBlocks.ok === false) {
        return windowBlocks;
      }
      params.windowBlocks = typeof windowBlocks === "number" ? windowBlocks : 1_000;

      const limit = requireNumberInRange(raw, "limit", 1, 100);
      if (typeof limit === "object" && limit !== null && limit.ok === false) return limit;
      params.limit = typeof limit === "number" ? Math.floor(limit) : 25;

      if (typeof raw.tokenAddress === "string" && raw.tokenAddress.trim()) {
        params.tokenAddress = raw.tokenAddress.trim().toLowerCase();
      }
      return { ok: true, params };
    }

    case "monad_contract_momentum": {
      const limit = requireNumberInRange(raw, "limit", 1, 100);
      if (typeof limit === "object" && limit !== null && limit.ok === false) return limit;
      params.limit = typeof limit === "number" ? Math.floor(limit) : 25;

      const minTxCount = requireNumberInRange(raw, "minTxCount", 1, 1_000_000);
      if (typeof minTxCount === "object" && minTxCount !== null && minTxCount.ok === false) {
        return minTxCount;
      }
      params.minTxCount = typeof minTxCount === "number" ? Math.floor(minTxCount) : 1;
      return { ok: true, params };
    }

    case "monad_selector_heatmap": {
      const limit = requireNumberInRange(raw, "limit", 1, 100);
      if (typeof limit === "object" && limit !== null && limit.ok === false) return limit;
      params.limit = typeof limit === "number" ? Math.floor(limit) : 25;
      return { ok: true, params };
    }

    case "monad_launchpad_watch": {
      const limit = requireNumberInRange(raw, "limit", 1, 100);
      if (typeof limit === "object" && limit !== null && limit.ok === false) return limit;
      params.limit = typeof limit === "number" ? Math.floor(limit) : 25;

      const minAcceleration = requireNumberInRange(raw, "minAcceleration", 0, 10_000);
      if (typeof minAcceleration === "object" && minAcceleration !== null && minAcceleration.ok === false) {
        return minAcceleration;
      }
      params.minAcceleration = typeof minAcceleration === "number" ? minAcceleration : 0;
      return { ok: true, params };
    }

    default:
      return {
        ok: false,
        statusCode: 404,
        code: "SKU_PARAMS_INVALID",
        message: `Unsupported SKU validation target: ${sku}`
      };
  }
}

function parseAmount(value?: string): number {
  if (!value) return 1;
  const asNum = Number(value);
  if (!Number.isFinite(asNum) || asNum <= 0) return 1;
  return asNum;
}

function extractSelector(input?: string): string | undefined {
  if (typeof input !== "string") return undefined;
  if (!input.startsWith("0x") || input.length < 10) return undefined;
  return input.slice(0, 10).toLowerCase();
}

function computeStdDev(values: number[]): number {
  if (values.length <= 1) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) * (value - mean), 0) / values.length;
  return Math.sqrt(variance);
}

async function queryLpRangeSignal(
  store: RuntimeStoreContract,
  params: Record<string, unknown>
): Promise<unknown[]> {
  const [blocks, transfers] = await Promise.all([
    store.queryStreamBlocks(120),
    store.queryDerivedTransfers(MARKETPLACE_FETCH_LIMIT)
  ]);

  const txCounts = blocks.map((block) => block.transactionCount).filter((value) => Number.isFinite(value));
  const avgTx = txCounts.length > 0 ? txCounts.reduce((sum, value) => sum + value, 0) / txCounts.length : 0;
  const volatilityDerived = avgTx > 0 ? clamp(computeStdDev(txCounts) / avgTx, 0, 1) : 0;
  const volatilityScore =
    typeof params.volatilityScore === "number"
      ? clamp(params.volatilityScore, 0, 1)
      : volatilityDerived;
  const risk = typeof params.risk === "number" ? clamp(params.risk, 0, 1) : 0.5;

  const tokenFlow = new Map<string, { inflow: number; outflow: number }>();
  for (const transfer of transfers) {
    const token = transfer.tokenAddress.toLowerCase();
    const entry = tokenFlow.get(token) ?? { inflow: 0, outflow: 0 };
    const amount = parseAmount(transfer.amount);
    entry.inflow += amount;
    entry.outflow += amount;
    tokenFlow.set(token, entry);
  }

  const tokenPair = {
    token0: typeof params.token0 === "string" ? params.token0 : transfers[0]?.tokenAddress ?? "token0",
    token1: typeof params.token1 === "string" ? params.token1 : transfers[1]?.tokenAddress ?? "token1"
  };

  const flowBias =
    typeof params.flowBias === "number"
      ? clamp(params.flowBias, -1, 1)
      : (() => {
          const primary = tokenFlow.get(String(tokenPair.token0).toLowerCase()) ?? { inflow: 0, outflow: 0 };
          const denominator = primary.inflow + primary.outflow;
          if (denominator <= 0) return 0;
          return clamp((primary.inflow - primary.outflow) / denominator, -1, 1);
        })();

  const flowMagnitude = clamp(Math.abs(flowBias), 0, 1);
  const uniformWidth = clamp(0.35 + volatilityScore * 0.2 + risk * 0.15, 0.25, 0.85);
  const bellWidth = clamp(0.08 + volatilityScore * 0.1 + risk * 0.08, 0.05, 0.3);
  const inverseWidth = clamp(0.18 + flowMagnitude * 0.12, 0.18, 0.3);

  const allPresets = [
    {
      preset: "uniform",
      bounds: {
        lowerBoundPct: -uniformWidth / 2,
        upperBoundPct: uniformWidth / 2
      }
    },
    {
      preset: "bell",
      bounds: {
        lowerBoundPct: -bellWidth / 2,
        upperBoundPct: bellWidth / 2
      }
    },
    {
      preset: "bid_ask_inverse",
      bounds: {
        bidLowerBoundPct: -inverseWidth,
        bidUpperBoundPct: -0.02,
        askLowerBoundPct: 0.02,
        askUpperBoundPct: inverseWidth
      }
    }
  ];

  const requestedPreset = typeof params.preset === "string" ? params.preset : "all";
  return allPresets
    .filter((entry) => requestedPreset === "all" || entry.preset === requestedPreset)
    .map((entry) => ({
      token0: tokenPair.token0,
      token1: tokenPair.token1,
      chainId: MONAD_CHAIN_ID,
      volatilityScore,
      flowBias,
      risk,
      ...entry
    }));
}

async function queryOrderflowImbalance(
  store: RuntimeStoreContract,
  params: Record<string, unknown>
): Promise<unknown[]> {
  const transfers = await store.queryDerivedTransfers(MARKETPLACE_FETCH_LIMIT);
  const tokenFilter = typeof params.tokenAddress === "string" ? params.tokenAddress.toLowerCase() : undefined;
  const limit = typeof params.limit === "number" ? params.limit : 25;

  const buckets = new Map<
    string,
    {
      inflow: number;
      outflow: number;
      activeWallets: Set<string>;
      transferCount: number;
      lastSeenBlock: number;
    }
  >();

  for (const transfer of transfers) {
    const tokenAddress = transfer.tokenAddress.toLowerCase();
    if (tokenFilter && tokenAddress !== tokenFilter) continue;
    const bucket = buckets.get(tokenAddress) ?? {
      inflow: 0,
      outflow: 0,
      activeWallets: new Set<string>(),
      transferCount: 0,
      lastSeenBlock: 0
    };
    const amount = parseAmount(transfer.amount);
    bucket.inflow += amount;
    bucket.outflow += amount;
    if (transfer.fromAddress) bucket.activeWallets.add(transfer.fromAddress.toLowerCase());
    if (transfer.toAddress) bucket.activeWallets.add(transfer.toAddress.toLowerCase());
    bucket.transferCount += 1;
    bucket.lastSeenBlock = Math.max(bucket.lastSeenBlock, transfer.blockNumber);
    buckets.set(tokenAddress, bucket);
  }

  return Array.from(buckets.entries())
    .map(([tokenAddress, bucket]) => {
      const total = bucket.inflow + bucket.outflow;
      const imbalance = total > 0 ? (bucket.inflow - bucket.outflow) / total : 0;
      return {
        tokenAddress,
        inflow: bucket.inflow,
        outflow: bucket.outflow,
        netFlow: bucket.inflow - bucket.outflow,
        imbalance,
        activeWallets: bucket.activeWallets.size,
        transferCount: bucket.transferCount,
        lastSeenBlock: bucket.lastSeenBlock
      };
    })
    .sort((a, b) => Math.abs(b.imbalance) - Math.abs(a.imbalance))
    .slice(0, limit);
}

async function queryContractMomentum(
  store: RuntimeStoreContract,
  params: Record<string, unknown>
): Promise<unknown[]> {
  const activities = await store.queryContractActivity(MARKETPLACE_FETCH_LIMIT);
  const limit = typeof params.limit === "number" ? params.limit : 25;
  const minTxCount = typeof params.minTxCount === "number" ? params.minTxCount : 1;

  return activities
    .filter((row) => row.txCount >= minTxCount)
    .map((row) => {
      const gasPressure = Math.max(0, Number(row.txCount) * (row.uniqueCallers / Math.max(row.txCount, 1)));
      const momentumScore = row.txCount * (1 + row.uniqueCallers / Math.max(1, row.txCount)) + gasPressure;
      return {
        contractAddress: row.contractAddress,
        txCount: row.txCount,
        uniqueCallers: row.uniqueCallers,
        gasPressure: Number(gasPressure.toFixed(4)),
        momentumScore: Number(momentumScore.toFixed(4)),
        blockStart: row.blockStart,
        blockEnd: row.blockEnd,
        computedAt: row.computedAt
      };
    })
    .sort((a, b) => b.momentumScore - a.momentumScore)
    .slice(0, limit);
}

async function querySelectorHeatmap(
  store: RuntimeStoreContract,
  params: Record<string, unknown>
): Promise<unknown[]> {
  const limit = typeof params.limit === "number" ? params.limit : 25;
  const blocks = await store.queryStreamBlocks(200);

  const selectors = new Map<string, { callCount: number; uniqueContracts: Set<string>; lastSeenBlock: number }>();

  for (const block of blocks) {
    const raw = block.rawPayload;
    if (!raw || typeof raw !== "object") continue;
    const txs = Array.isArray((raw as { transactions?: unknown[] }).transactions)
      ? ((raw as { transactions: unknown[] }).transactions as Array<Record<string, unknown>>)
      : [];
    for (const tx of txs) {
      const selector = extractSelector(typeof tx.input === "string" ? tx.input : undefined);
      if (!selector) continue;
      const bucket = selectors.get(selector) ?? {
        callCount: 0,
        uniqueContracts: new Set<string>(),
        lastSeenBlock: 0
      };
      bucket.callCount += 1;
      if (typeof tx.to === "string" && tx.to) bucket.uniqueContracts.add(tx.to.toLowerCase());
      bucket.lastSeenBlock = Math.max(bucket.lastSeenBlock, block.blockNumber);
      selectors.set(selector, bucket);
    }
  }

  return Array.from(selectors.entries())
    .map(([selector, bucket]) => ({
      selector,
      callCount: bucket.callCount,
      uniqueContracts: bucket.uniqueContracts.size,
      lastSeenBlock: bucket.lastSeenBlock
    }))
    .sort((a, b) => b.callCount - a.callCount)
    .slice(0, limit);
}

async function queryLaunchpadWatch(
  store: RuntimeStoreContract,
  params: Record<string, unknown>
): Promise<unknown[]> {
  const limit = typeof params.limit === "number" ? params.limit : 25;
  const minAcceleration = typeof params.minAcceleration === "number" ? params.minAcceleration : 0;

  const [blocks, contractActivity] = await Promise.all([
    store.queryStreamBlocks(200),
    store.queryContractActivity(MARKETPLACE_FETCH_LIMIT)
  ]);

  const deployments = new Map<
    string,
    { contractAddress: string; deployer: string; firstSeenBlock: number; txAfterDeploy: number; lastSeenBlock: number }
  >();

  for (const block of blocks) {
    const raw = block.rawPayload;
    if (!raw || typeof raw !== "object") continue;
    const deploymentRows = Array.isArray((raw as { deployments?: unknown[] }).deployments)
      ? ((raw as { deployments: unknown[] }).deployments as Array<Record<string, unknown>>)
      : [];
    for (const deployment of deploymentRows) {
      const contractAddress =
        typeof deployment.contractAddress === "string" ? deployment.contractAddress.toLowerCase() : "";
      if (!contractAddress) continue;
      const entry = deployments.get(contractAddress) ?? {
        contractAddress,
        deployer: typeof deployment.deployer === "string" ? deployment.deployer : "",
        firstSeenBlock: block.blockNumber,
        txAfterDeploy: 0,
        lastSeenBlock: block.blockNumber
      };
      entry.firstSeenBlock = Math.min(entry.firstSeenBlock, block.blockNumber);
      entry.lastSeenBlock = Math.max(entry.lastSeenBlock, block.blockNumber);
      deployments.set(contractAddress, entry);
    }
  }

  for (const activity of contractActivity) {
    const key = activity.contractAddress.toLowerCase();
    const entry = deployments.get(key);
    if (!entry) continue;
    entry.txAfterDeploy += activity.txCount;
    entry.lastSeenBlock = Math.max(entry.lastSeenBlock, activity.blockEnd);
  }

  return Array.from(deployments.values())
    .map((entry) => {
      const ageBlocks = Math.max(1, entry.lastSeenBlock - entry.firstSeenBlock + 1);
      const accelerationScore = Number(((entry.txAfterDeploy / ageBlocks) * 100).toFixed(4));
      return {
        contractAddress: entry.contractAddress,
        deployer: entry.deployer || "unknown",
        firstSeenBlock: entry.firstSeenBlock,
        latestBlock: entry.lastSeenBlock,
        activityTxCount: entry.txAfterDeploy,
        accelerationScore
      };
    })
    .filter((entry) => entry.accelerationScore >= minAcceleration)
    .sort((a, b) => b.accelerationScore - a.accelerationScore)
    .slice(0, limit);
}

async function querySkuData(
  item: CatalogItem,
  store: RuntimeStoreContract,
  params: Record<string, unknown>,
  limitOverride?: number
): Promise<unknown[]> {
  const merged = { ...params };
  if (typeof limitOverride === "number") merged.limit = limitOverride;
  switch (item.sku) {
    case "monad_lp_range_signal":
      return queryLpRangeSignal(store, merged);
    case "monad_orderflow_imbalance":
      return queryOrderflowImbalance(store, merged);
    case "monad_contract_momentum":
      return queryContractMomentum(store, merged);
    case "monad_selector_heatmap":
      return querySelectorHeatmap(store, merged);
    case "monad_launchpad_watch":
      return queryLaunchpadWatch(store, merged);
    default:
      return [];
  }
}

export async function registerMarketplaceRoutes(
  app: FastifyInstance,
  deps: MarketplaceDeps
): Promise<void> {
  app.get("/marketplace/catalog", async () => ({ catalog: CATALOG }));

  app.get("/marketplace/products/:sku/preview", async (request, reply) => {
    const { sku } = request.params as { sku: string };
    const item = findSku(sku);
    if (!item) {
      return reply.status(404).send({ code: "SKU_NOT_FOUND", message: `Unknown SKU: ${sku}` });
    }

    const rawParams = toNormalizedParams(request.query);
    const validated = validateSkuRequest(item.sku, rawParams);
    if (!validated.ok) {
      return reply.status(validated.statusCode).send({ code: validated.code, message: validated.message });
    }

    const data = await querySkuData(item, deps.store, validated.params, item.sampleSize);
    return {
      sku: item.sku,
      name: item.name,
      category: item.category,
      refreshCadence: item.refreshCadence,
      sampleSchema: item.sampleSchema,
      dataConfidence: item.dataConfidence,
      priceUsd: item.priceUsd,
      preview: true,
      sampleSize: item.sampleSize,
      params: validated.params,
      data
    };
  });

  app.post("/marketplace/products/:sku/purchase", async (request, reply) => {
    const { sku } = request.params as { sku: string };
    const item = findSku(sku);
    if (!item) {
      return reply.status(404).send({ code: "SKU_NOT_FOUND", message: `Unknown SKU: ${sku}` });
    }

    const rawParams = toNormalizedParams(request.body);
    const validated = validateSkuRequest(item.sku, rawParams);
    if (!validated.ok) {
      return reply.status(validated.statusCode).send({ code: validated.code, message: validated.message });
    }

    const allowed = await requireX402PaymentForResource(
      request,
      reply,
      {
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
      },
      {
        resourcePath: `/marketplace/products/${sku}/purchase`,
        description: item.description,
        merchantName: "Synoptic Marketplace",
        costUsd: item.priceUsd,
        metadata: { sku: item.sku, category: item.category, dataSource: item.dataSource }
      }
    );

    if (!allowed) return;

    const data = await querySkuData(item, deps.store, validated.params);
    const resultHash = hashPayload(data);

    const payments = await deps.store.listPayments();
    const settledPayment = payments.find(
      (payment) => payment.status === "settled" && payment.serviceUrl === `/marketplace/products/${sku}/purchase`
    );
    const attestationAdapter = createMarketplaceAttestationAdapter(deps.env);
    if (!attestationAdapter) {
      return reply.status(503).send({
        code: "ATTESTATION_NOT_CONFIGURED",
        message: "Set AGENT_PRIVATE_KEY, KITE_RPC_URL, and SERVICE_REGISTRY_ADDRESS"
      });
    }

    const attestationChainId =
      typeof validated.params.chainId === "number" ? validated.params.chainId : MONAD_CHAIN_ID;
    const sourceTxRef =
      settledPayment?.kiteTxHash ?? `purchase:${item.sku}:${resultHash}`;
    let attestationTxHash: string;
    try {
      if (attestationAdapter.recordService) {
        const attested = await attestationAdapter.recordService({
          serviceType: "marketplace_purchase",
          sourceChainId: attestationChainId,
          sourceTxHashOrRef: sourceTxRef,
          tokenIn: deps.paymentAssetAddress,
          tokenOut: deps.paymentAssetAddress,
          amountIn: settledPayment?.amountWei ?? "0",
          amountOut: settledPayment?.amountWei ?? "0",
          metadata: `x402-gated marketplace purchase:${item.sku}`
        });
        attestationTxHash = attested.attestationTxHash;
      } else {
        const attested = await attestationAdapter.recordTrade({
          sourceChainId: attestationChainId,
          sourceTxHash: sourceTxRef,
          tokenIn: deps.paymentAssetAddress,
          tokenOut: deps.paymentAssetAddress,
          amountIn: settledPayment?.amountWei ?? "0",
          amountOut: settledPayment?.amountWei ?? "0",
          strategyReason: `x402-gated marketplace purchase:${item.sku}`
        });
        attestationTxHash = attested.attestationTxHash;
      }
    } catch (cause) {
      return reply.status(502).send({
        code: "ATTESTATION_FAILED",
        message: cause instanceof Error ? cause.message : "Attestation failed"
      });
    }

    const purchase = await deps.store.createPurchase({
      agentId: settledPayment?.agentId,
      sku: item.sku,
      params: validated.params,
      paymentId: settledPayment?.id,
      status: "completed",
      resultHash,
      resultPayload: {
        sku: item.sku,
        category: item.category,
        refreshCadence: item.refreshCadence,
        sampleSchema: item.sampleSchema,
        dataConfidence: item.dataConfidence,
        data,
        attestationTxHash
      }
    });

    deps.wsHub.broadcast({
      type: "activity.new",
      event: {
        id: purchase.id,
        agentId: settledPayment?.agentId ?? "unknown",
        eventType: "marketplace.purchase",
        chain:
          typeof validated.params.chain === "string"
            ? (validated.params.chain as "monad" | "monad-testnet")
            : "monad",
        data: {
          sku: item.sku,
          purchaseId: purchase.id,
          paymentId: settledPayment?.id,
          resultHash,
          attestationTxHash
        },
        createdAt: purchase.createdAt
      }
    });

    return {
      purchaseId: purchase.id,
      sku: item.sku,
      category: item.category,
      refreshCadence: item.refreshCadence,
      sampleSchema: item.sampleSchema,
      dataConfidence: item.dataConfidence,
      paymentId: settledPayment?.id,
      settlementTxHash: settledPayment?.kiteTxHash,
      attestationTxHash,
      params: validated.params,
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
