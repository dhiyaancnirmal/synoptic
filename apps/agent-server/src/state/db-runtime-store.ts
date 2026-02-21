import { randomUUID } from "node:crypto";
import type { Repositories, SynopticDb } from "@synoptic/db";
import {
  eq,
  desc,
  streamBlocks,
  derivedTransfers,
  derivedContractActivity,
  marketplacePurchases
} from "@synoptic/db";
import type { ActivityEvent, Agent, LiquidityAction, LiquidityActionStatus, Trade } from "@synoptic/types";
import type {
  CompatEvent,
  CompatOrder,
  LiquidityActionRecord,
  RuntimeStoreContract
} from "./runtime-store.js";
import { mapEventName, toCompatStatus } from "./runtime-store.js";

export class DbRuntimeStore implements RuntimeStoreContract {
  private readonly orders = new Map<string, CompatOrder>();
  private readonly db: SynopticDb | undefined;

  constructor(private readonly repos: Repositories, db?: SynopticDb) {
    this.db = db;
  }

  async listAgents() {
    return this.repos.agentRepo.list();
  }

  async getAgent(id: string) {
    return this.repos.agentRepo.getById(id);
  }

  async createAgent(input: Partial<Agent> = {}) {
    const agent = await this.repos.agentRepo.create({
      name: input.name ?? "Agent",
      role: input.role ?? "strategy",
      eoaAddress: input.eoaAddress ?? "0x0000000000000000000000000000000000000001",
      dailyBudgetUsd: input.dailyBudgetUsd ?? "100",
      strategy: input.strategy,
      strategyConfig: input.strategyConfig ?? {},
      kitePassportId: input.kitePassportId
    });
    await this.addActivity(agent.id, "agent.created", "kite-testnet", { name: agent.name });
    return agent;
  }

  async updateAgent(id: string, input: Partial<Agent>) {
    const agent = await this.repos.agentRepo.update(id, {
      name: input.name,
      strategy: input.strategy,
      eoaAddress: input.eoaAddress,
      strategyConfig: input.strategyConfig
    });
    if (agent) {
      await this.addActivity(id, "agent.updated", "kite-testnet", { fields: Object.keys(input) });
    }
    return agent;
  }

  async setAgentStatus(id: string, status: Agent["status"]) {
    const updated = await this.repos.agentRepo.setStatus(id, status);
    if (updated) {
      await this.addActivity(id, "agent.status", "kite-testnet", { status });
    }
    return updated;
  }

  async listTrades() {
    return this.repos.tradeRepo.list();
  }

  async getTrade(id: string) {
    return this.repos.tradeRepo.getById(id);
  }

  async createTrade(input: {
    agentId: string;
    chainId: number;
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    amountOut: string;
    routingType: string;
    intent?: Trade["intent"];
    quoteRequestId?: string;
    swapRequestId?: string;
    status: Trade["status"];
    strategyReason?: string;
    quoteRequest?: Record<string, unknown>;
    quoteResponse?: Record<string, unknown>;
    swapTx?: Record<string, unknown>;
  }) {
    return this.repos.tradeRepo.create(input);
  }

  async updateTradeStatus(
    id: string,
    status: Trade["status"],
    details?: {
      executionTxHash?: string;
      kiteAttestationTx?: string;
      errorMessage?: string;
      gasUsed?: string;
      quoteRequestId?: string;
      swapRequestId?: string;
    }
  ) {
    return this.repos.tradeRepo.updateStatus(id, status, details);
  }

  async listPayments() {
    return this.repos.paymentRepo.list();
  }

  async getPayment(id: string) {
    return this.repos.paymentRepo.getById(id);
  }

  async createPayment(input: {
    agentId: string;
    direction: "outgoing" | "incoming";
    amountWei: string;
    amountUsd: string;
    tokenAddress: string;
    serviceUrl: string;
    status: "requested" | "authorized" | "settled" | "failed";
    x402Challenge?: Record<string, unknown>;
  }) {
    return this.repos.paymentRepo.create(input);
  }

  async updatePaymentStatus(
    id: string,
    status: "requested" | "authorized" | "settled" | "failed",
    details?: {
      kiteTxHash?: string;
      facilitatorResponse?: Record<string, unknown>;
    }
  ) {
    return this.repos.paymentRepo.updateStatus(id, status, details);
  }

  async setAgentSpentTodayUsd(id: string, spentTodayUsd: string) {
    return this.repos.agentRepo.setSpentTodayUsd(id, spentTodayUsd);
  }

  async listActivity(agentId?: string) {
    return this.repos.activityRepo.list(agentId);
  }

  async createPriceSnapshot(input: { pair: string; price: string; source: string; timestamp: Date }) {
    return this.repos.priceRepo.create(input);
  }

  async listRecentPriceSnapshots(pair: string, since: Date) {
    return this.repos.priceRepo.listRecent(pair, since);
  }

  async addActivity(
    agentId: string,
    eventType: string,
    chain: ActivityEvent["chain"],
    data: Record<string, unknown>
  ): Promise<ActivityEvent> {
    return this.repos.activityRepo.create({
      agentId,
      eventType,
      chain,
      data
    });
  }

  async upsertStreamBlock(input: {
    blockNumber: number;
    blockHash?: string;
    parentHash?: string;
    timestamp?: number;
    transactionCount: number;
    gasUsed?: string;
    gasLimit?: string;
    rawPayload?: Record<string, unknown>;
  }) {
    if (!this.db) {
      return { id: randomUUID(), blockNumber: input.blockNumber };
    }
    const [row] = await this.db
      .insert(streamBlocks)
      .values({
        blockNumber: input.blockNumber,
        blockHash: input.blockHash,
        parentHash: input.parentHash,
        timestamp: input.timestamp,
        transactionCount: input.transactionCount,
        gasUsed: input.gasUsed,
        gasLimit: input.gasLimit,
        rawPayload: input.rawPayload
      })
      .onConflictDoUpdate({
        target: streamBlocks.blockNumber,
        set: {
          blockHash: input.blockHash,
          transactionCount: input.transactionCount,
          gasUsed: input.gasUsed,
          receivedAt: new Date()
        }
      })
      .returning({ id: streamBlocks.id, blockNumber: streamBlocks.blockNumber });
    return row!;
  }

  async insertDerivedTransfer(input: {
    blockNumber: number;
    txHash: string;
    logIndex: number;
    fromAddress: string;
    toAddress: string;
    tokenAddress: string;
    amount?: string;
    tokenSymbol?: string;
  }) {
    if (!this.db) return { id: randomUUID() };
    const [row] = await this.db
      .insert(derivedTransfers)
      .values(input)
      .onConflictDoNothing()
      .returning({ id: derivedTransfers.id });
    return row ?? { id: randomUUID() };
  }

  async upsertContractActivity(input: {
    contractAddress: string;
    blockStart: number;
    blockEnd: number;
    txCount: number;
    uniqueCallers: number;
    failedTxCount: number;
    totalGasUsed?: string;
  }) {
    if (!this.db) return { id: randomUUID() };
    const [row] = await this.db
      .insert(derivedContractActivity)
      .values(input)
      .onConflictDoUpdate({
        target: [
          derivedContractActivity.contractAddress,
          derivedContractActivity.blockStart,
          derivedContractActivity.blockEnd
        ],
        set: {
          txCount: input.txCount,
          uniqueCallers: input.uniqueCallers,
          failedTxCount: input.failedTxCount,
          totalGasUsed: input.totalGasUsed,
          computedAt: new Date()
        }
      })
      .returning({ id: derivedContractActivity.id });
    return row!;
  }

  async queryStreamBlocks(limit = 50) {
    if (!this.db) return [];
    const rows = await this.db
      .select()
      .from(streamBlocks)
      .orderBy(desc(streamBlocks.blockNumber))
      .limit(limit);
    return rows.map((r) => ({
      id: r.id,
      blockNumber: r.blockNumber,
      blockHash: r.blockHash ?? undefined,
      transactionCount: r.transactionCount,
      gasUsed: r.gasUsed ?? undefined,
      timestamp: r.timestamp ?? undefined,
      rawPayload: (r.rawPayload as Record<string, unknown>) ?? undefined,
      receivedAt: r.receivedAt.toISOString()
    }));
  }

  async queryDerivedTransfers(limit = 50) {
    if (!this.db) return [];
    const rows = await this.db
      .select()
      .from(derivedTransfers)
      .orderBy(desc(derivedTransfers.createdAt))
      .limit(limit);
    return rows.map((r) => ({
      id: r.id,
      blockNumber: r.blockNumber,
      txHash: r.txHash,
      fromAddress: r.fromAddress,
      toAddress: r.toAddress,
      tokenAddress: r.tokenAddress,
      amount: r.amount ?? undefined,
      createdAt: r.createdAt.toISOString()
    }));
  }

  async queryContractActivity(limit = 50) {
    if (!this.db) return [];
    const rows = await this.db
      .select()
      .from(derivedContractActivity)
      .orderBy(desc(derivedContractActivity.computedAt))
      .limit(limit);
    return rows.map((r) => ({
      id: r.id,
      contractAddress: r.contractAddress,
      blockStart: r.blockStart,
      blockEnd: r.blockEnd,
      txCount: r.txCount,
      uniqueCallers: r.uniqueCallers,
      computedAt: r.computedAt.toISOString()
    }));
  }

  async createPurchase(input: {
    agentId?: string;
    sku: string;
    params?: Record<string, unknown>;
    paymentId?: string;
    status: string;
    resultHash?: string;
    resultPayload?: Record<string, unknown>;
  }) {
    if (!this.db) {
      const id = randomUUID();
      const now = new Date().toISOString();
      return { id, sku: input.sku, status: input.status, createdAt: now };
    }
    const [row] = await this.db
      .insert(marketplacePurchases)
      .values({
        agentId: input.agentId,
        sku: input.sku,
        params: input.params ?? {},
        paymentId: input.paymentId,
        status: input.status,
        resultHash: input.resultHash,
        resultPayload: input.resultPayload
      })
      .returning();
    return {
      id: row!.id,
      sku: row!.sku,
      status: row!.status,
      createdAt: row!.createdAt.toISOString()
    };
  }

  async getPurchase(id: string) {
    if (!this.db) return undefined;
    const [row] = await this.db
      .select()
      .from(marketplacePurchases)
      .where(eq(marketplacePurchases.id, id))
      .limit(1);
    if (!row) return undefined;
    return {
      id: row.id,
      agentId: row.agentId ?? undefined,
      sku: row.sku,
      params: (row.params as Record<string, unknown>) ?? undefined,
      paymentId: row.paymentId ?? undefined,
      status: row.status,
      resultHash: row.resultHash ?? undefined,
      resultPayload: (row.resultPayload as Record<string, unknown>) ?? undefined,
      createdAt: row.createdAt.toISOString()
    };
  }

  async listPurchases(agentId?: string) {
    if (!this.db) return [];
    const query = this.db
      .select()
      .from(marketplacePurchases)
      .orderBy(desc(marketplacePurchases.createdAt))
      .limit(100);
    const rows = agentId
      ? await this.db.select().from(marketplacePurchases).where(eq(marketplacePurchases.agentId, agentId)).orderBy(desc(marketplacePurchases.createdAt)).limit(100)
      : await query;
    return rows.map((r) => ({
      id: r.id,
      agentId: r.agentId ?? undefined,
      sku: r.sku,
      paymentId: r.paymentId ?? undefined,
      status: r.status,
      resultHash: r.resultHash ?? undefined,
      createdAt: r.createdAt.toISOString()
    }));
  }

  async createLiquidityAction(input: {
    agentId: string;
    actionType: LiquidityAction["actionType"];
    chainId: number;
    token0: string;
    token1: string;
    feeTier: number;
    preset: LiquidityAction["preset"];
    lowerBoundPct: number;
    upperBoundPct: number;
    amount0: string;
    amount1: string;
    positionId?: string;
    txHash?: string;
    status: LiquidityAction["status"];
    errorMessage?: string;
  }): Promise<LiquidityActionRecord> {
    return this.repos.liquidityRepo.create(input);
  }

  async updateLiquidityAction(
    id: string,
    input: {
      status?: LiquidityActionStatus;
      txHash?: string;
      positionId?: string;
      errorMessage?: string;
    }
  ): Promise<LiquidityActionRecord | undefined> {
    return this.repos.liquidityRepo.update(id, input);
  }

  async listLiquidityActions(limit = 200): Promise<LiquidityActionRecord[]> {
    return this.repos.liquidityRepo.list(limit);
  }

  async compatAgents() {
    const agents = await this.listAgents();
    return agents.map((agent) => ({
      agentId: agent.id,
      ownerAddress: agent.eoaAddress,
      status: toCompatStatus(agent.status),
      createdAt: agent.createdAt
    }));
  }

  async compatAgent(id: string) {
    const agent = await this.getAgent(id);
    if (!agent) return undefined;
    return {
      agentId: agent.id,
      ownerAddress: agent.eoaAddress,
      status: toCompatStatus(agent.status),
      createdAt: agent.createdAt
    };
  }

  async compatEvents(agentId: string): Promise<CompatEvent[]> {
    const events = await this.listActivity(agentId);
    return events.map((event) => ({
      eventId: event.id,
      eventName: mapEventName(event.eventType),
      agentId: event.agentId,
      timestamp: event.createdAt,
      status: event.eventType.includes("error") ? "ERROR" : "SUCCESS",
      metadata: event.data
    }));
  }

  async compatOrder(id: string): Promise<CompatOrder | undefined> {
    return this.orders.get(id);
  }

  async createCompatOrder(input: {
    agentId: string;
    side: "BUY" | "SELL";
    size: string;
    marketId: string;
  }): Promise<CompatOrder> {
    const now = new Date().toISOString();
    const orderId = randomUUID();
    const order: CompatOrder = {
      orderId,
      agentId: input.agentId,
      status: "EXECUTED",
      venueType: "SPOT",
      marketId: input.marketId,
      side: input.side,
      size: input.size,
      createdAt: now,
      updatedAt: now
    };
    this.orders.set(orderId, order);

    await this.repos.tradeRepo.create({
      agentId: input.agentId,
      chainId: 10143,
      tokenIn: "0x760afe86e5de5fa0ee542fc7b7b713e1c5425701",
      tokenOut: "0x62534e4bbd6d9ebac0ac99aeaa0aa48e56372df0",
      amountIn: input.size,
      amountOut: input.size,
      routingType: "BEST_PRICE",
      intent: "swap",
      status: "confirmed",
      strategyReason: "compat.execute"
    });
    await this.addActivity(input.agentId, "trade.executed", "monad-testnet", { orderId });
    return order;
  }
}
