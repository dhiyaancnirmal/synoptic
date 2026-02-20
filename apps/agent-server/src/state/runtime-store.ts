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
      sepoliaTxHash?: string;
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
      sepoliaTxHash?: string;
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
      executionTxHash: details?.executionTxHash ?? details?.sepoliaTxHash ?? existing.executionTxHash ?? existing.sepoliaTxHash,
      sepoliaTxHash: details?.executionTxHash ?? details?.sepoliaTxHash ?? existing.executionTxHash ?? existing.sepoliaTxHash,
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
    await this.addActivity(input.agentId, "trade.executed", "sepolia", { orderId: order.orderId });
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
