import type { Strategy, StrategyInput, StrategyResult } from "./base.js";

export class RebalanceStrategy implements Strategy {
  evaluate(input: StrategyInput): StrategyResult {
    if (input.prices.length === 0) {
      return { action: "hold", reason: "no data" };
    }
    return { action: "hold", reason: "rebalance strategy placeholder" };
  }
}
