import assert from "node:assert/strict";
import test from "node:test";
import type { Repositories } from "@synoptic/db";
import type { ActivityEvent, Agent, Payment, Trade } from "@synoptic/types";
import { DbRuntimeStore } from "./db-runtime-store.js";

test("DbRuntimeStore uses repositories for canonical and compat paths", async () => {
  const agents: Agent[] = [];
  const trades: Trade[] = [];
  const payments: Payment[] = [];
  const activity: ActivityEvent[] = [];

  const repos = {
    agentRepo: {
      async list() {
        return [...agents];
      },
      async getById(id: string) {
        return agents.find((agent) => agent.id === id);
      },
      async create(input: {
        name: string;
        role: Agent["role"];
        eoaAddress: string;
        dailyBudgetUsd: string;
        strategy?: string;
        strategyConfig?: Record<string, unknown>;
        kitePassportId?: string;
      }) {
        const now = new Date().toISOString();
        const agent: Agent = {
          id: `agent-${agents.length + 1}`,
          name: input.name,
          role: input.role,
          status: "idle",
          kitePassportId: input.kitePassportId,
          eoaAddress: input.eoaAddress,
          dailyBudgetUsd: input.dailyBudgetUsd,
          spentTodayUsd: "0",
          strategy: input.strategy,
          strategyConfig: input.strategyConfig,
          createdAt: now,
          updatedAt: now
        };
        agents.push(agent);
        return agent;
      },
      async update(id: string, input: { name?: string; strategy?: string }) {
        const idx = agents.findIndex((agent) => agent.id === id);
        if (idx === -1) return undefined;
        agents[idx] = { ...agents[idx]!, ...input, updatedAt: new Date().toISOString() };
        return agents[idx];
      },
      async setStatus(id: string, status: Agent["status"]) {
        const idx = agents.findIndex((agent) => agent.id === id);
        if (idx === -1) return undefined;
        agents[idx] = { ...agents[idx]!, status, updatedAt: new Date().toISOString() };
        return agents[idx];
      },
      async findByAddress(address: string) {
        return agents.find((agent) => agent.eoaAddress === address);
      },
      async setSpentTodayUsd(id: string, spentTodayUsd: string) {
        const idx = agents.findIndex((agent) => agent.id === id);
        if (idx === -1) return undefined;
        agents[idx] = { ...agents[idx]!, spentTodayUsd, updatedAt: new Date().toISOString() };
        return agents[idx];
      }
    },
    paymentRepo: {
      async list() {
        return [...payments];
      },
      async getById(id: string) {
        return payments.find((payment) => payment.id === id);
      },
      async create(input: {
        agentId: string;
        direction: Payment["direction"];
        amountWei: string;
        amountUsd: string;
        tokenAddress: string;
        serviceUrl: string;
        status: Payment["status"];
        x402Challenge?: Record<string, unknown>;
      }) {
        const payment: Payment = {
          id: `payment-${payments.length + 1}`,
          createdAt: new Date().toISOString(),
          settledAt: undefined,
          ...input
        };
        payments.push(payment);
        return payment;
      },
      async updateStatus(id: string, status: Payment["status"]) {
        const idx = payments.findIndex((payment) => payment.id === id);
        if (idx === -1) return undefined;
        payments[idx] = { ...payments[idx]!, status };
        return payments[idx];
      }
    },
    tradeRepo: {
      async list() {
        return [...trades];
      },
      async getById(id: string) {
        return trades.find((trade) => trade.id === id);
      },
      async create(input: {
        agentId: string;
        chainId: number;
        tokenIn: string;
        tokenOut: string;
        amountIn: string;
        amountOut: string;
        routingType: string;
        status: Trade["status"];
        strategyReason?: string;
      }) {
        const trade: Trade = {
          id: `trade-${trades.length + 1}`,
          createdAt: new Date().toISOString(),
          confirmedAt: input.status === "confirmed" ? new Date().toISOString() : undefined,
          ...input
        };
        trades.push(trade);
        return trade;
      },
      async updateStatus(id: string, status: Trade["status"]) {
        const idx = trades.findIndex((trade) => trade.id === id);
        if (idx === -1) return undefined;
        trades[idx] = {
          ...trades[idx]!,
          status,
          confirmedAt: status === "confirmed" ? new Date().toISOString() : trades[idx]!.confirmedAt
        };
        return trades[idx];
      }
    },
    activityRepo: {
      async list(agentId?: string) {
        return agentId ? activity.filter((event) => event.agentId === agentId) : [...activity];
      },
      async create(input: {
        agentId: string;
        eventType: string;
        chain: ActivityEvent["chain"];
        txHash?: string;
        blockNumber?: number;
        data?: Record<string, unknown>;
      }) {
        const event: ActivityEvent = {
          id: `event-${activity.length + 1}`,
          createdAt: new Date().toISOString(),
          txHash: undefined,
          blockNumber: undefined,
          data: {},
          ...input
        };
        activity.unshift(event);
        return event;
      }
    },
    priceRepo: {
      async create(input: { pair: string; price: string; source: string; timestamp: Date }) {
        return {
          id: 1,
          pair: input.pair,
          price: input.price,
          source: input.source,
          timestamp: input.timestamp.toISOString()
        };
      },
      async listRecent() {
        return [];
      }
    }
  } as unknown as Repositories;

  const store = new DbRuntimeStore(repos);
  const created = await store.createAgent({ name: "A1", eoaAddress: "0xabc", dailyBudgetUsd: "50" });
  assert.equal(created.name, "A1");
  assert.equal((await store.listAgents()).length, 1);

  await store.setAgentStatus(created.id, "running");
  const compatAgents = await store.compatAgents();
  assert.equal(compatAgents[0]?.status, "ACTIVE");

  const order = await store.createCompatOrder({
    agentId: created.id,
    side: "BUY",
    size: "1",
    marketId: "ETH-USDC"
  });
  assert.ok(order.orderId);
  assert.equal((await store.listTrades()).length, 1);
  assert.ok((await store.compatOrder(order.orderId)));

  const compatEvents = await store.compatEvents(created.id);
  assert.ok(compatEvents.length > 0);
});
