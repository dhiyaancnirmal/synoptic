import type { Strategy, StrategyInput, StrategyResult } from "./base.js";

export class MomentumStrategy implements Strategy {
  evaluate(input: StrategyInput): StrategyResult {
    if (input.prices.length < 3) {
      return { action: "hold", reason: "not enough data" };
    }

    const [a, b, c] = input.prices.slice(-3);
    if (a < b && b < c) {
      return { action: "buy", reason: "three consecutive upward candles" };
    }
    if (a > b && b > c) {
      return { action: "sell", reason: "three consecutive downward candles" };
    }
    return { action: "hold", reason: "no clear momentum" };
  }
}
