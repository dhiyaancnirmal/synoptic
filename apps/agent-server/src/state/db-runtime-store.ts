import { randomUUID } from "node:crypto";
import type { Repositories } from "@synoptic/db";
import type { ActivityEvent, Agent } from "@synoptic/types";
import type { CompatEvent, CompatOrder, RuntimeStoreContract } from "./runtime-store.js";
import { mapEventName, toCompatStatus } from "./runtime-store.js";

export class DbRuntimeStore implements RuntimeStoreContract {
  private readonly orders = new Map<string, CompatOrder>();

  constructor(private readonly repos: Repositories) {}

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
      strategy: input.strategy
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
    status: "quoting" | "approving" | "signing" | "broadcast" | "confirmed" | "reverted" | "failed";
    strategyReason?: string;
    quoteRequest?: Record<string, unknown>;
    quoteResponse?: Record<string, unknown>;
    swapTx?: Record<string, unknown>;
  }) {
    return this.repos.tradeRepo.create(input);
  }

  async updateTradeStatus(
    id: string,
    status: "quoting" | "approving" | "signing" | "broadcast" | "confirmed" | "reverted" | "failed",
    details?: {
      executionTxHash?: string;
      kiteAttestationTx?: string;
      errorMessage?: string;
      gasUsed?: string;
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
      status: "confirmed",
      strategyReason: "compat.execute"
    });
    await this.addActivity(input.agentId, "trade.executed", "monad-testnet", { orderId });
    return order;
  }
}
