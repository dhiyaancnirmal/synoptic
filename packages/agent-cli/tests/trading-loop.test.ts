import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { MomentumStrategy } from "../src/trading-loop.js";

describe("Momentum Strategy", () => {
  let strategy: MomentumStrategy;

  beforeEach(() => {
    strategy = new MomentumStrategy();
  });

  it("should return hold with insufficient data", () => {
    strategy.addPrice(100);
    strategy.addPrice(101);

    const result = strategy.evaluate();

    assert.equal(result.action, "hold");
    assert.ok(result.reason.includes("not enough"));
  });

  it("should return buy on three upward candles", () => {
    strategy.addPrice(100);
    strategy.addPrice(101);
    strategy.addPrice(102);

    const result = strategy.evaluate();

    assert.equal(result.action, "buy");
    assert.ok(result.reason.includes("upward"));
  });

  it("should return sell on three downward candles", () => {
    strategy.addPrice(102);
    strategy.addPrice(101);
    strategy.addPrice(100);

    const result = strategy.evaluate();

    assert.equal(result.action, "sell");
    assert.ok(result.reason.includes("downward"));
  });

  it("should return hold on mixed candles", () => {
    strategy.addPrice(100);
    strategy.addPrice(102);
    strategy.addPrice(101);

    const result = strategy.evaluate();

    assert.equal(result.action, "hold");
    assert.ok(result.reason.includes("momentum"));
  });

  it("should maintain price history correctly", () => {
    for (let i = 0; i < 15; i++) {
      strategy.addPrice(100 + i);
    }

    const history = strategy.getHistory();

    assert.ok(history.length <= 10);
  });

  it("should evaluate based on last 3 prices only", () => {
    strategy.addPrice(1000);
    strategy.addPrice(900);
    strategy.addPrice(100);
    strategy.addPrice(101);
    strategy.addPrice(102);

    const result = strategy.evaluate();

    assert.equal(result.action, "buy");
  });
});
