import assert from "node:assert/strict";
import test from "node:test";
import { computeAllLiquidityPresets, computeLiquidityPreset } from "./presets";

test("uniform preset computes bounded symmetric width", () => {
  const result = computeLiquidityPreset("uniform", {
    volatilityScore: 0.9,
    flowBias: 0,
    risk: 1
  });
  assert.equal(result.executeAsSeparateLegs, false);
  assert.equal(result.bands.length, 1);
  const [band] = result.bands;
  assert.ok(band);
  assert.ok(band.lowerBoundPct < 0);
  assert.ok(band.upperBoundPct > 0);
  const width = band.upperBoundPct - band.lowerBoundPct;
  assert.ok(width <= 0.85);
});

test("bell preset stays narrow and symmetric", () => {
  const result = computeLiquidityPreset("bell", {
    volatilityScore: 1,
    flowBias: 0,
    risk: 1
  });
  const [band] = result.bands;
  assert.ok(band);
  assert.equal(result.executeAsSeparateLegs, false);
  const width = band.upperBoundPct - band.lowerBoundPct;
  assert.ok(width <= 0.3);
  assert.equal(Math.abs(band.lowerBoundPct), Math.abs(band.upperBoundPct));
});

test("bid_ask_inverse preset emits two one-sided bands", () => {
  const result = computeLiquidityPreset("bid_ask_inverse", {
    volatilityScore: 0.2,
    flowBias: 0.75,
    risk: 0.4
  });
  assert.equal(result.executeAsSeparateLegs, true);
  assert.equal(result.bands.length, 2);
  assert.equal(result.bands[0]?.leg, "bid");
  assert.equal(result.bands[1]?.leg, "ask");
  assert.equal(result.bands[0]?.upperBoundPct, -0.02);
  assert.equal(result.bands[1]?.lowerBoundPct, 0.02);
});

test("all presets helper returns all three presets", () => {
  const result = computeAllLiquidityPresets({ volatilityScore: 0.3, flowBias: -0.2, risk: 0.5 });
  assert.equal(result.length, 3);
  assert.deepEqual(
    result.map((item) => item.preset),
    ["uniform", "bell", "bid_ask_inverse"]
  );
});
