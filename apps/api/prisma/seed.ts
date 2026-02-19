import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  // Dashboard agent — matches NEXT_PUBLIC_DASH_AGENT_ID in apps/dashboard/.env.local
  const dashAgent = await prisma.agent.upsert({
    where: { agentId: "dash-agent-local" },
    update: {},
    create: {
      agentId: "dash-agent-local",
      ownerAddress: "0xabc123",
      status: "ACTIVE"
    }
  });

  // Extra seed agents
  await prisma.agent.upsert({
    where: { agentId: "agent-seed-001" },
    update: {},
    create: {
      agentId: "agent-seed-001",
      ownerAddress: "0x0000000000000000000000000000000000000001",
      status: "ACTIVE"
    }
  });

  await prisma.agent.upsert({
    where: { agentId: "agent-seed-002" },
    update: {},
    create: {
      agentId: "agent-seed-002",
      ownerAddress: "0x0000000000000000000000000000000000000002",
      status: "PAUSED"
    }
  });

  // Settlement for executed trades
  const settlement1 = await prisma.settlement.upsert({
    where: { settlementId: "settle-seed-001" },
    update: {},
    create: {
      settlementId: "settle-seed-001",
      agentId: dashAgent.agentId,
      status: "SETTLED",
      txHash: "0xaabbccdd11223344556677889900aabbccdd11223344556677889900aabbccdd",
      providerRef: "mock-ref-001"
    }
  });

  const settlement2 = await prisma.settlement.upsert({
    where: { settlementId: "settle-seed-002" },
    update: {},
    create: {
      settlementId: "settle-seed-002",
      agentId: dashAgent.agentId,
      status: "SETTLED",
      txHash: "0x1122334455667788990011223344556677889900aabbccddeeff001122334455",
      providerRef: "mock-ref-002"
    }
  });

  await prisma.settlement.upsert({
    where: { settlementId: "settle-seed-003" },
    update: {},
    create: {
      settlementId: "settle-seed-003",
      agentId: dashAgent.agentId,
      status: "FAILED",
      providerRef: "mock-ref-003"
    }
  });

  // Orders
  const order1Id = "order-seed-001";
  await prisma.order.upsert({
    where: { orderId: order1Id },
    update: {},
    create: {
      orderId: order1Id,
      agentId: dashAgent.agentId,
      status: "EXECUTED",
      venueType: "SPOT",
      marketId: "ETH-USDC",
      side: "BUY",
      size: "1.5",
      limitPrice: "2450.00",
      paymentSettlementId: settlement1.settlementId
    }
  });

  const order2Id = "order-seed-002";
  await prisma.order.upsert({
    where: { orderId: order2Id },
    update: {},
    create: {
      orderId: order2Id,
      agentId: dashAgent.agentId,
      status: "EXECUTED",
      venueType: "SPOT",
      marketId: "BTC-USDC",
      side: "SELL",
      size: "0.05",
      limitPrice: "68000.00",
      paymentSettlementId: settlement2.settlementId
    }
  });

  const order3Id = "order-seed-003";
  await prisma.order.upsert({
    where: { orderId: order3Id },
    update: {},
    create: {
      orderId: order3Id,
      agentId: dashAgent.agentId,
      status: "REJECTED",
      venueType: "SPOT",
      marketId: "SOL-USDC",
      side: "BUY",
      size: "5000",
      rejectionReason: "RISK_LIMIT"
    }
  });

  // Events — all attached to dashboard agent so the dashboard can see them
  const now = new Date();
  const events = [
    {
      eventId: randomUUID(),
      eventName: "AGENT_CREATED" as const,
      agentId: dashAgent.agentId,
      timestamp: new Date(now.getTime() - 6 * 60 * 60 * 1000),
      status: "SUCCESS" as const,
      metadata: { ownerAddress: dashAgent.ownerAddress }
    },
    {
      eventId: randomUUID(),
      eventName: "X402_CHALLENGE_ISSUED" as const,
      agentId: dashAgent.agentId,
      timestamp: new Date(now.getTime() - 5 * 60 * 60 * 1000),
      status: "INFO" as const,
      metadata: { route: "/markets/execute", amount: "0.10", network: "2368" }
    },
    {
      eventId: randomUUID(),
      eventName: "X402_PAYMENT_SETTLED" as const,
      agentId: dashAgent.agentId,
      timestamp: new Date(now.getTime() - 4.9 * 60 * 60 * 1000),
      status: "SUCCESS" as const,
      metadata: {
        route: "/markets/execute",
        settlementId: settlement1.settlementId,
        txHash: settlement1.txHash
      }
    },
    {
      eventId: randomUUID(),
      eventName: "TRADE_EXECUTED" as const,
      agentId: dashAgent.agentId,
      timestamp: new Date(now.getTime() - 4.8 * 60 * 60 * 1000),
      status: "SUCCESS" as const,
      metadata: { orderId: order1Id, settlementId: settlement1.settlementId }
    },
    {
      eventId: randomUUID(),
      eventName: "X402_CHALLENGE_ISSUED" as const,
      agentId: dashAgent.agentId,
      timestamp: new Date(now.getTime() - 3 * 60 * 60 * 1000),
      status: "INFO" as const,
      metadata: { route: "/markets/execute", amount: "0.10", network: "2368" }
    },
    {
      eventId: randomUUID(),
      eventName: "X402_PAYMENT_SETTLED" as const,
      agentId: dashAgent.agentId,
      timestamp: new Date(now.getTime() - 2.9 * 60 * 60 * 1000),
      status: "SUCCESS" as const,
      metadata: {
        route: "/markets/execute",
        settlementId: settlement2.settlementId,
        txHash: settlement2.txHash
      }
    },
    {
      eventId: randomUUID(),
      eventName: "TRADE_EXECUTED" as const,
      agentId: dashAgent.agentId,
      timestamp: new Date(now.getTime() - 2.8 * 60 * 60 * 1000),
      status: "SUCCESS" as const,
      metadata: { orderId: order2Id, settlementId: settlement2.settlementId }
    },
    {
      eventId: randomUUID(),
      eventName: "RISK_LIMIT_HIT" as const,
      agentId: dashAgent.agentId,
      timestamp: new Date(now.getTime() - 1 * 60 * 60 * 1000),
      status: "ERROR" as const,
      metadata: { orderId: order3Id, reason: "RISK_LIMIT" }
    },
    {
      eventId: randomUUID(),
      eventName: "TRADE_REJECTED" as const,
      agentId: dashAgent.agentId,
      timestamp: new Date(now.getTime() - 0.9 * 60 * 60 * 1000),
      status: "ERROR" as const,
      metadata: { orderId: order3Id, reason: "RISK_LIMIT" }
    }
  ];

  for (const event of events) {
    await prisma.event.upsert({
      where: { eventId: event.eventId },
      update: {},
      create: event
    });
  }

  console.log(`Seeded: ${3} agents, ${3} settlements, ${3} orders, ${events.length} events`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
