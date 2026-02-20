export type StrategyAction = "buy" | "sell" | "hold";

export interface StrategyInput {
  prices: number[];
}

export interface StrategyResult {
  action: StrategyAction;
  reason: string;
}

export interface Strategy {
  evaluate(input: StrategyInput): StrategyResult;
}
