import type { SynopticDb } from "../index.js";
import { ActivityRepo } from "./activity-repo.js";
import { AgentRepo } from "./agent-repo.js";
import { PaymentRepo } from "./payment-repo.js";
import { PriceRepo } from "./price-repo.js";
import { TradeRepo } from "./trade-repo.js";
import { LiquidityRepo } from "./liquidity-repo.js";

export interface Repositories {
  agentRepo: AgentRepo;
  paymentRepo: PaymentRepo;
  tradeRepo: TradeRepo;
  activityRepo: ActivityRepo;
  priceRepo: PriceRepo;
  liquidityRepo: LiquidityRepo;
}

export function createRepositories(db: SynopticDb): Repositories {
  return {
    agentRepo: new AgentRepo(db),
    paymentRepo: new PaymentRepo(db),
    tradeRepo: new TradeRepo(db),
    activityRepo: new ActivityRepo(db),
    priceRepo: new PriceRepo(db),
    liquidityRepo: new LiquidityRepo(db)
  };
}

export * from "./agent-repo.js";
export * from "./payment-repo.js";
export * from "./trade-repo.js";
export * from "./activity-repo.js";
export * from "./price-repo.js";
export * from "./liquidity-repo.js";
