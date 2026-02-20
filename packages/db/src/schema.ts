import { index, integer, jsonb, numeric, pgTable, serial, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const agents = pgTable("agents", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  status: text("status").notNull(),
  kitePassportId: text("kite_passport_id").unique(),
  eoaAddress: text("eoa_address").notNull(),
  dailyBudgetUsd: numeric("daily_budget_usd").notNull(),
  spentTodayUsd: numeric("spent_today_usd").default("0").notNull(),
  budgetResetAt: timestamp("budget_reset_at", { withTimezone: true }),
  strategy: text("strategy"),
  strategyConfig: jsonb("strategy_config").default({}),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id),
    direction: text("direction").notNull(),
    amountWei: text("amount_wei").notNull(),
    amountUsd: numeric("amount_usd").notNull(),
    tokenAddress: text("token_address").notNull(),
    serviceUrl: text("service_url").notNull(),
    status: text("status").notNull(),
    kiteTxHash: text("kite_tx_hash"),
    facilitatorResponse: jsonb("facilitator_response"),
    x402Challenge: jsonb("x402_challenge"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    settledAt: timestamp("settled_at", { withTimezone: true })
  },
  (table) => ({
    agentIdx: index("idx_payments_agent_id").on(table.agentId),
    statusIdx: index("idx_payments_status").on(table.status)
  })
);

export const trades = pgTable(
  "trades",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id),
    chainId: integer("chain_id").notNull(),
    tokenIn: text("token_in").notNull(),
    tokenOut: text("token_out").notNull(),
    amountIn: text("amount_in").notNull(),
    amountOut: text("amount_out").notNull(),
    routingType: text("routing_type").notNull(),
    slippage: numeric("slippage"),
    status: text("status").notNull(),
    quoteRequest: jsonb("quote_request"),
    quoteResponse: jsonb("quote_response"),
    swapTx: jsonb("swap_tx"),
    executionTxHash: text("sepolia_tx_hash"),
    kiteAttestationTx: text("kite_attestation_tx"),
    gasUsed: text("gas_used"),
    errorMessage: text("error_message"),
    strategyReason: text("strategy_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true })
  },
  (table) => ({
    agentIdx: index("idx_trades_agent_id").on(table.agentId),
    statusIdx: index("idx_trades_status").on(table.status)
  })
);

export const activityEvents = pgTable(
  "activity_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id),
    eventType: text("event_type").notNull(),
    chain: text("chain").notNull(),
    txHash: text("tx_hash"),
    blockNumber: integer("block_number"),
    data: jsonb("data").default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    agentIdx: index("idx_activity_agent_id").on(table.agentId),
    typeIdx: index("idx_activity_type").on(table.eventType),
    createdIdx: index("idx_activity_created").on(table.createdAt)
  })
);

export const priceSnapshots = pgTable(
  "price_snapshots",
  {
    id: serial("id").primaryKey(),
    pair: text("pair").notNull(),
    price: numeric("price").notNull(),
    source: text("source").notNull(),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull()
  },
  (table) => ({
    pairTimestampIdx: index("idx_price_pair_time").on(table.pair, table.timestamp)
  })
);
