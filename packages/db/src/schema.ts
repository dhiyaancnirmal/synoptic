import { index, integer, jsonb, numeric, pgTable, serial, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

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
    executionTxHash: text("execution_tx_hash"),
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

export const streamBlocks = pgTable(
  "stream_blocks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    blockNumber: integer("block_number").notNull(),
    blockHash: text("block_hash"),
    parentHash: text("parent_hash"),
    timestamp: integer("timestamp"),
    transactionCount: integer("transaction_count").default(0).notNull(),
    gasUsed: text("gas_used"),
    gasLimit: text("gas_limit"),
    rawPayload: jsonb("raw_payload"),
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    blockNumberUniq: uniqueIndex("idx_stream_blocks_number").on(table.blockNumber),
    receivedIdx: index("idx_stream_blocks_received").on(table.receivedAt)
  })
);

export const derivedTransfers = pgTable(
  "derived_transfers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    blockNumber: integer("block_number").notNull(),
    txHash: text("tx_hash").notNull(),
    logIndex: integer("log_index").default(0).notNull(),
    fromAddress: text("from_address").notNull(),
    toAddress: text("to_address").notNull(),
    tokenAddress: text("token_address").notNull(),
    amount: text("amount"),
    tokenSymbol: text("token_symbol"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    txLogUniq: uniqueIndex("idx_derived_transfers_tx_log").on(table.txHash, table.logIndex),
    blockIdx: index("idx_derived_transfers_block").on(table.blockNumber)
  })
);

export const derivedContractActivity = pgTable(
  "derived_contract_activity",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    contractAddress: text("contract_address").notNull(),
    blockStart: integer("block_start").notNull(),
    blockEnd: integer("block_end").notNull(),
    txCount: integer("tx_count").default(0).notNull(),
    uniqueCallers: integer("unique_callers").default(0).notNull(),
    failedTxCount: integer("failed_tx_count").default(0).notNull(),
    totalGasUsed: text("total_gas_used"),
    computedAt: timestamp("computed_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    contractBlockUniq: uniqueIndex("idx_derived_contract_block").on(
      table.contractAddress,
      table.blockStart,
      table.blockEnd
    ),
    contractIdx: index("idx_derived_contract_address").on(table.contractAddress)
  })
);

export const marketplacePurchases = pgTable(
  "marketplace_purchases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id").references(() => agents.id),
    sku: text("sku").notNull(),
    params: jsonb("params").default({}),
    paymentId: uuid("payment_id").references(() => payments.id),
    status: text("status").notNull(),
    resultHash: text("result_hash"),
    resultPayload: jsonb("result_payload"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    agentIdx: index("idx_purchases_agent_id").on(table.agentId),
    skuIdx: index("idx_purchases_sku").on(table.sku)
  })
);
