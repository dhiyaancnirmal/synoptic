import { createDbClient } from "./index.js";
import { agents, payments, activityEvents } from "./schema.js";

export async function seedDatabase(): Promise<void> {
  const db = createDbClient();

  const [agent] = await db
    .insert(agents)
    .values({
      name: "Seed Trader",
      role: "strategy",
      status: "idle",
      eoaAddress: "0x0000000000000000000000000000000000000001",
      dailyBudgetUsd: "100",
      spentTodayUsd: "0",
      strategy: "momentum",
      strategyConfig: { lookback: 20, thresholdPct: 1.5 }
    })
    .onConflictDoNothing()
    .returning();

  if (!agent) {
    return;
  }

  await db.insert(payments).values({
    agentId: agent.id,
    direction: "outgoing",
    amountWei: "10000",
    amountUsd: "0.1",
    tokenAddress: "0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63",
    serviceUrl: "/oracle/price",
    status: "requested"
  });

  await db.insert(activityEvents).values({
    agentId: agent.id,
    eventType: "agent.created",
    chain: "kite-testnet",
    data: { source: "seed" }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedDatabase()
    .then(() => {
      console.log("db seed complete");
    })
    .catch((error) => {
      console.error("db seed failed", error);
      process.exit(1);
    });
}
