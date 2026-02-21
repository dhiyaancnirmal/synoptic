import assert from "node:assert/strict";
import test from "node:test";
import { resolveSwapModeForChain } from "./execution-mode.js";

test("resolveSwapModeForChain chooses live for Monad mainnet in auto mode", () => {
  const resolution = resolveSwapModeForChain(
    {
      swapExecutionMode: "auto",
      simulatedChainIds: [10143],
      simulateOnchain: false
    },
    143
  );

  assert.equal(resolution.effectiveMode, "live");
});

test("resolveSwapModeForChain chooses simulated for Monad testnet in auto mode", () => {
  const resolution = resolveSwapModeForChain(
    {
      swapExecutionMode: "auto",
      simulatedChainIds: [10143],
      simulateOnchain: false
    },
    10143
  );

  assert.equal(resolution.effectiveMode, "simulated");
});

test("resolveSwapModeForChain forces simulated when requested mode is simulated", () => {
  const resolution = resolveSwapModeForChain(
    {
      swapExecutionMode: "simulated",
      simulatedChainIds: [],
      simulateOnchain: false
    },
    143
  );

  assert.equal(resolution.effectiveMode, "simulated");
});

test("resolveSwapModeForChain rejects unsupported chains in live mode", () => {
  const resolution = resolveSwapModeForChain(
    {
      swapExecutionMode: "live",
      simulatedChainIds: [],
      simulateOnchain: false
    },
    10143
  );

  assert.equal(resolution.effectiveMode, "simulated");
  assert.match(resolution.reason, /not marked as live-tradable/);
});

test("resolveSwapModeForChain honors SIMULATE_ONCHAIN compatibility flag", () => {
  const resolution = resolveSwapModeForChain(
    {
      swapExecutionMode: "auto",
      simulatedChainIds: [],
      simulateOnchain: true
    },
    143
  );

  assert.equal(resolution.effectiveMode, "simulated");
  assert.match(resolution.reason, /SIMULATE_ONCHAIN/);
});
