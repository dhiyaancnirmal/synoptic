import { randomUUID } from "node:crypto";
import type { ActivityEvent, Agent, Payment, Trade } from "@synoptic/types";

export type CompatAgentStatus = "ACTIVE" | "PAUSED" | "STOPPED";
export type CompatOrderStatus = "PENDING" | "EXECUTED" | "REJECTED";

export interface CompatOrder {
  orderId: string;
  agentId: string;
  status: CompatOrderStatus;
  venueType: "SPOT";
  marketId: string;
  side: "BUY" | "SELL";
  size: string;
  createdAt: string;
  updatedAt: string;
}

export interface CompatEvent {
  eventId: string;
  eventName: string;
  agentId: string;
  timestamp: string;
  status: "INFO" | "SUCCESS" | "ERROR";
  metadata: Record<string, unknown>;
}

export interface RuntimeStoreContract {
  listAgents(): Promise<Agent[]>;
  getAgent(id: string): Promise<Agent | undefined>;
  createAgent(input?: Partial<Agent>): Promise<Agent>;
  updateAgent(id: string, input: Partial<Agent>): Promise<Agent | undefined>;
  setAgentStatus(id: string, status: Agent["status"]): Promise<Agent | undefined>;
  listTrades(): Promise<Trade[]>;
  getTrade(id: string): Promise<Trade | undefined>;
  createTrade(input: {
    agentId: string;
    chainId: number;
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    amountOut: string;
    routingType: string;
    status: Trade["status"];
    strategyReason?: string;
    quoteRequest?: Record<string, unknown>;
    quoteResponse?: Record<string, unknown>;
    swapTx?: Record<string, unknown>;
  }): Promise<Trade>;
  updateTradeStatus(
    id: string,
    status: Trade["status"],
    details?: {
      executionTxHash?: string;
      kiteAttestationTx?: string;
      errorMessage?: string;
      gasUsed?: string;
    }
  ): Promise<Trade | undefined>;
  listPayments(): Promise<Payment[]>;
  getPayment(id: string): Promise<Payment | undefined>;
  createPayment(input: {
    agentId: string;
    direction: Payment["direction"];
    amountWei: string;
    amountUsd: string;
    tokenAddress: string;
    serviceUrl: string;
    status: Payment["status"];
    x402Challenge?: Record<string, unknown>;
  }): Promise<Payment>;
  updatePaymentStatus(
    id: string,
    status: Payment["status"],
    details?: {
      kiteTxHash?: string;
      facilitatorResponse?: Record<string, unknown>;
    }
  ): Promise<Payment | undefined>;
  setAgentSpentTodayUsd(id: string, spentTodayUsd: string): Promise<Agent | undefined>;
  listActivity(agentId?: string): Promise<ActivityEvent[]>;
  createPriceSnapshot(input: {
    pair: string;
    price: string;
    source: string;
    timestamp: Date;
  }): Promise<{ pair: string; price: string; source: string; timestamp: string }>;
  listRecentPriceSnapshots(pair: string, since: Date): Promise<Array<{ pair: string; price: string; source: string; timestamp: string }>>;
  addActivity(
    agentId: string,
    eventType: string,
    chain: ActivityEvent["chain"],
    data: Record<string, unknown>
  ): Promise<ActivityEvent>;
  upsertStreamBlock(input: {
    blockNumber: number;
    blockHash?: string;
    parentHash?: string;
    timestamp?: number;
    transactionCount: number;
    gasUsed?: string;
    gasLimit?: string;
    rawPayload?: Record<string, unknown>;
  }): Promise<{ id: string; blockNumber: number }>;
  insertDerivedTransfer(input: {
    blockNumber: number;
    txHash: string;
    logIndex: number;
    fromAddress: string;
    toAddress: string;
    tokenAddress: string;
    amount?: string;
    tokenSymbol?: string;
  }): Promise<{ id: string }>;
  upsertContractActivity(input: {
    contractAddress: string;
    blockStart: number;
    blockEnd: number;
    txCount: number;
    uniqueCallers: number;
    failedTxCount: number;
    totalGasUsed?: string;
  }): Promise<{ id: string }>;
  queryStreamBlocks(limit?: number): Promise<Array<{
    id: string;
    blockNumber: number;
    blockHash?: string;
    transactionCount: number;
    gasUsed?: string;
    timestamp?: number;
    receivedAt: string;
  }>>;
  queryDerivedTransfers(limit?: number): Promise<Array<{
    id: string;
    blockNumber: number;
    txHash: string;
    fromAddress: string;
    toAddress: string;
    tokenAddress: string;
    amount?: string;
    createdAt: string;
  }>>;
  queryContractActivity(limit?: number): Promise<Array<{
    id: string;
    contractAddress: string;
    blockStart: number;
    blockEnd: number;
    txCount: number;
    uniqueCallers: number;
    computedAt: string;
  }>>;
  createPurchase(input: {
    agentId?: string;
    sku: string;
    params?: Record<string, unknown>;
    paymentId?: string;
    status: string;
    resultHash?: string;
    resultPayload?: Record<string, unknown>;
  }): Promise<{ id: string; sku: string; status: string; createdAt: string }>;
  getPurchase(id: string): Promise<{
    id: string;
    agentId?: string;
    sku: string;
    params?: Record<string, unknown>;
    paymentId?: string;
    status: string;
    resultHash?: string;
    resultPayload?: Record<string, unknown>;
    createdAt: string;
  } | undefined>;
  listPurchases(agentId?: string): Promise<Array<{
    id: string;
    agentId?: string;
    sku: string;
    paymentId?: string;
    status: string;
    resultHash?: string;
    createdAt: string;
  }>>;
  compatAgents(): Promise<Array<{ agentId: string; ownerAddress: string; status: CompatAgentStatus; createdAt: string }>>;
  compatAgent(id: string): Promise<{ agentId: string; ownerAddress: string; status: CompatAgentStatus; createdAt: string } | undefined>;
  compatEvents(agentId: string): Promise<CompatEvent[]>;
  compatOrder(id: string): Promise<CompatOrder | undefined>;
  createCompatOrder(input: { agentId: string; side: "BUY" | "SELL"; size: string; marketId: string }): Promise<CompatOrder>;
}

export class RuntimeStore implements RuntimeStoreContract {
  private readonly agents = new Map<string, Agent>();
  private readonly trades = new Map<string, Trade>();
  private readonly payments = new Map<string, Payment>();
  private readonly activity: ActivityEvent[] = [];
  private readonly orders = new Map<string, CompatOrder>();
  private readonly priceSnapshots: Array<{ pair: string; price: string; source: string; timestamp: string }> = [];
  private readonly streamBlocksByNumber = new Map<number, { id: string; blockNumber: number; blockHash?: string; parentHash?: string; timestamp?: number; transactionCount: number; gasUsed?: string; gasLimit?: string; rawPayload?: Record<string, unknown>; receivedAt: string }>();
  private readonly derivedTransfersList: Array<{ id: string; blockNumber: number; txHash: string; logIndex: number; fromAddress: string; toAddress: string; tokenAddress: string; amount?: string; tokenSymbol?: string; createdAt: string }> = [];
  private readonly contractActivityMap = new Map<string, { id: string; contractAddress: string; blockStart: number; blockEnd: number; txCount: number; uniqueCallers: number; failedTxCount: number; totalGasUsed?: string; computedAt: string }>();
  private readonly purchases = new Map<string, { id: string; agentId?: string; sku: string; params?: Record<string, unknown>; paymentId?: string; status: string; resultHash?: string; resultPayload?: Record<string, unknown>; createdAt: string }>();

  async listAgents(): Promise<Agent[]> {
    return [...this.agents.values()];
  }

  async getAgent(id: string): Promise<Agent | undefined> {
    return this.agents.get(id);
  }

  async createAgent(input: Partial<Agent> = {}): Promise<Agent> {
    const now = new Date().toISOString();
    const id = input.id ?? randomUUID();
    const agent: Agent = {
      id,
      name: input.name ?? "Agent",
      role: input.role ?? "strategy",
      status: input.status ?? "idle",
      kitePassportId: input.kitePassportId,
      eoaAddress: input.eoaAddress ?? "0x0000000000000000000000000000000000000001",
      dailyBudgetUsd: input.dailyBudgetUsd ?? "100",
      spentTodayUsd: input.spentTodayUsd ?? "0",
      strategy: input.strategy ?? "momentum",
      strategyConfig: input.strategyConfig ?? {},
      createdAt: now,
      updatedAt: now
    };
    this.agents.set(id, agent);
    await this.addActivity(id, "agent.created", "kite-testnet", { name: agent.name });
    return agent;
  }

  async updateAgent(id: string, input: Partial<Agent>): Promise<Agent | undefined> {
    const existing = this.agents.get(id);
    if (!existing) return undefined;
    const updated: Agent = {
      ...existing,
      ...input,
      id,
      updatedAt: new Date().toISOString()
    };
    this.agents.set(id, updated);
    await this.addActivity(id, "agent.updated", "kite-testnet", { fields: Object.keys(input) });
    return updated;
  }

  async setAgentStatus(id: string, status: Agent["status"]): Promise<Agent | undefined> {
    const agent = await this.updateAgent(id, { status });
    if (!agent) return undefined;
    await this.addActivity(id, "agent.status", "kite-testnet", { status });
    return agent;
  }

  async listTrades(): Promise<Trade[]> {
    return [...this.trades.values()];
  }

  async getTrade(id: string): Promise<Trade | undefined> {
    return this.trades.get(id);
  }

  async createTrade(input: {
    agentId: string;
    chainId: number;
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    amountOut: string;
    routingType: string;
    status: Trade["status"];
    strategyReason?: string;
    quoteRequest?: Record<string, unknown>;
    quoteResponse?: Record<string, unknown>;
    swapTx?: Record<string, unknown>;
  }): Promise<Trade> {
    const now = new Date().toISOString();
    const trade: Trade = {
      id: randomUUID(),
      agentId: input.agentId,
      chainId: input.chainId,
      tokenIn: input.tokenIn,
      tokenOut: input.tokenOut,
      amountIn: input.amountIn,
      amountOut: input.amountOut,
      routingType: input.routingType,
      status: input.status,
      strategyReason: input.strategyReason,
      createdAt: now,
      confirmedAt: input.status === "confirmed" ? now : undefined
    };
    this.trades.set(trade.id, trade);
    return trade;
  }

  async updateTradeStatus(
    id: string,
    status: Trade["status"],
    details?: {
      executionTxHash?: string;
      kiteAttestationTx?: string;
      errorMessage?: string;
      gasUsed?: string;
    }
  ): Promise<Trade | undefined> {
    const existing = this.trades.get(id);
    if (!existing) return undefined;
    const updated: Trade = {
      ...existing,
      status,
      executionTxHash: details?.executionTxHash ?? existing.executionTxHash,
      kiteAttestationTx: details?.kiteAttestationTx ?? existing.kiteAttestationTx,
      confirmedAt: status === "confirmed" ? new Date().toISOString() : existing.confirmedAt
    };
    this.trades.set(id, updated);
    return updated;
  }

  async listPayments(): Promise<Payment[]> {
    return [...this.payments.values()];
  }

  async getPayment(id: string): Promise<Payment | undefined> {
    return this.payments.get(id);
  }

  async createPayment(input: {
    agentId: string;
    direction: Payment["direction"];
    amountWei: string;
    amountUsd: string;
    tokenAddress: string;
    serviceUrl: string;
    status: Payment["status"];
    x402Challenge?: Record<string, unknown>;
  }): Promise<Payment> {
    const payment: Payment = {
      id: randomUUID(),
      agentId: input.agentId,
      direction: input.direction,
      amountWei: input.amountWei,
      amountUsd: input.amountUsd,
      tokenAddress: input.tokenAddress,
      serviceUrl: input.serviceUrl,
      status: input.status,
      x402Challenge: input.x402Challenge,
      createdAt: new Date().toISOString()
    };
    this.payments.set(payment.id, payment);
    return payment;
  }

  async updatePaymentStatus(
    id: string,
    status: Payment["status"],
    details?: {
      kiteTxHash?: string;
      facilitatorResponse?: Record<string, unknown>;
    }
  ): Promise<Payment | undefined> {
    const existing = this.payments.get(id);
    if (!existing) return undefined;
    const next: Payment = {
      ...existing,
      status,
      kiteTxHash: details?.kiteTxHash ?? existing.kiteTxHash,
      facilitatorResponse: details?.facilitatorResponse ?? existing.facilitatorResponse,
      settledAt: status === "settled" ? new Date().toISOString() : existing.settledAt
    };
    this.payments.set(id, next);
    return next;
  }

  async setAgentSpentTodayUsd(id: string, spentTodayUsd: string): Promise<Agent | undefined> {
    const existing = this.agents.get(id);
    if (!existing) return undefined;
    const updated: Agent = {
      ...existing,
      spentTodayUsd,
      updatedAt: new Date().toISOString()
    };
    this.agents.set(id, updated);
    return updated;
  }

  async listActivity(agentId?: string): Promise<ActivityEvent[]> {
    if (!agentId) return [...this.activity];
    return this.activity.filter((event) => event.agentId === agentId);
  }

  async createPriceSnapshot(input: { pair: string; price: string; source: string; timestamp: Date }) {
    const snapshot = {
      pair: input.pair,
      price: input.price,
      source: input.source,
      timestamp: input.timestamp.toISOString()
    };
    this.priceSnapshots.unshift(snapshot);
    return snapshot;
  }

  async listRecentPriceSnapshots(pair: string, since: Date) {
    return this.priceSnapshots.filter((item) => item.pair === pair && new Date(item.timestamp) >= since);
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
    const existing = this.streamBlocksByNumber.get(input.blockNumber);
    const id = existing?.id ?? randomUUID();
    const record = { id, ...input, receivedAt: new Date().toISOString() };
    this.streamBlocksByNumber.set(input.blockNumber, record);
    return { id, blockNumber: input.blockNumber };
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
    const dup = this.derivedTransfersList.find(
      (t) => t.txHash === input.txHash && t.logIndex === input.logIndex
    );
    if (dup) return { id: dup.id };
    const id = randomUUID();
    this.derivedTransfersList.unshift({ id, ...input, createdAt: new Date().toISOString() });
    return { id };
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
    const key = `${input.contractAddress}:${input.blockStart}:${input.blockEnd}`;
    const existing = this.contractActivityMap.get(key);
    const id = existing?.id ?? randomUUID();
    this.contractActivityMap.set(key, { id, ...input, computedAt: new Date().toISOString() });
    return { id };
  }

  async queryStreamBlocks(limit = 50) {
    return [...this.streamBlocksByNumber.values()]
      .sort((a, b) => b.blockNumber - a.blockNumber)
      .slice(0, limit)
      .map(({ id, blockNumber, blockHash, transactionCount, gasUsed, timestamp, receivedAt }) => ({
        id, blockNumber, blockHash, transactionCount, gasUsed, timestamp, receivedAt
      }));
  }

  async queryDerivedTransfers(limit = 50) {
    return this.derivedTransfersList.slice(0, limit).map(
      ({ id, blockNumber, txHash, fromAddress, toAddress, tokenAddress, amount, createdAt }) => ({
        id, blockNumber, txHash, fromAddress, toAddress, tokenAddress, amount, createdAt
      })
    );
  }

  async queryContractActivity(limit = 50) {
    return [...this.contractActivityMap.values()]
      .sort((a, b) => b.blockEnd - a.blockEnd)
      .slice(0, limit)
      .map(({ id, contractAddress, blockStart, blockEnd, txCount, uniqueCallers, computedAt }) => ({
        id, contractAddress, blockStart, blockEnd, txCount, uniqueCallers, computedAt
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
    const id = randomUUID();
    const now = new Date().toISOString();
    const record = { id, ...input, createdAt: now };
    this.purchases.set(id, record);
    return { id, sku: input.sku, status: input.status, createdAt: now };
  }

  async getPurchase(id: string) {
    return this.purchases.get(id);
  }

  async listPurchases(agentId?: string) {
    const all = [...this.purchases.values()];
    const filtered = agentId ? all.filter((p) => p.agentId === agentId) : all;
    return filtered
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(({ id, agentId, sku, paymentId, status, resultHash, createdAt }) => ({
        id, agentId, sku, paymentId, status, resultHash, createdAt
      }));
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
    const order: CompatOrder = {
      orderId: randomUUID(),
      agentId: input.agentId,
      status: "EXECUTED",
      venueType: "SPOT",
      marketId: input.marketId,
      side: input.side,
      size: input.size,
      createdAt: now,
      updatedAt: now
    };
    this.orders.set(order.orderId, order);
    await this.addActivity(input.agentId, "trade.executed", "monad-testnet", { orderId: order.orderId });
    return order;
  }

  async addActivity(
    agentId: string,
    eventType: string,
    chain: ActivityEvent["chain"],
    data: Record<string, unknown>
  ): Promise<ActivityEvent> {
    const event: ActivityEvent = {
      id: randomUUID(),
      agentId,
      eventType,
      chain,
      data,
      createdAt: new Date().toISOString()
    };
    this.activity.unshift(event);
    return event;
  }
}

export function toCompatStatus(status: Agent["status"]): CompatAgentStatus {
  if (status === "running") return "ACTIVE";
  if (status === "paused") return "PAUSED";
  return "STOPPED";
}

export function mapEventName(eventType: string): string {
  switch (eventType) {
    case "payment.requested":
      return "x402.payment.requested";
    case "payment.authorized":
      return "x402.payment.authorized";
    case "payment.settled":
      return "x402.payment.settled";
    case "payment.failed":
      return "x402.payment.failed";
    case "trade.executed":
      return "trade.executed";
    case "trade.failed":
      return "trade.rejected";
    default:
      return "agent.created";
  }
}
