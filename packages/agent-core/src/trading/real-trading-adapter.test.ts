import assert from "node:assert/strict";
import test from "node:test";
import { RealTradingAdapter } from "./real-trading-adapter.js";

const TEST_PRIVATE_KEY = "0x59c6995e998f97a5a0044966f0945380f2fbe6f7f0f5a5f97f79ea57004a3f27";

function makeAdapter() {
  return new RealTradingAdapter({
    privateKey: TEST_PRIVATE_KEY,
    sepoliaRpcUrl: "http://127.0.0.1:8545",
    uniswapApiKey: "test-key"
  });
}

test("RealTradingAdapter enforces checkApproval before quote", async () => {
  const adapter = makeAdapter();
  const fakeClient = {
    async quote() {
      return { requestId: "q-1", quote: { output: { amount: "100" } } };
    }
  };
  (adapter as unknown as { client: typeof fakeClient }).client = fakeClient;

  await assert.rejects(
    async () =>
      adapter.quote({
        tokenIn: "0x0000000000000000000000000000000000000001",
        tokenOut: "0x0000000000000000000000000000000000000002",
        amountIn: "1",
        chainId: 11155111,
        swapper: "0x0000000000000000000000000000000000000003"
      }),
    /Uniswap flow violation: call checkApproval before quote/
  );
});

test("RealTradingAdapter enforces quote linkage before swap", async () => {
  const adapter = makeAdapter();
  const fakeClient = {
    async checkApproval() {
      return { requestId: "a-1" };
    },
    async quote() {
      return { requestId: "q-1", quote: { output: { amount: "100" } } };
    }
  };
  (adapter as unknown as { client: typeof fakeClient }).client = fakeClient;

  await adapter.checkApproval({
    walletAddress: "0x0000000000000000000000000000000000000003",
    token: "0x0000000000000000000000000000000000000001",
    amount: "1",
    chainId: 11155111
  });
  await adapter.quote({
    tokenIn: "0x0000000000000000000000000000000000000001",
    tokenOut: "0x0000000000000000000000000000000000000002",
    amountIn: "1",
    chainId: 11155111,
    swapper: "0x0000000000000000000000000000000000000003"
  });

  await assert.rejects(
    async () => adapter.executeSwap({ quoteResponse: { requestId: "q-unknown" } }),
    /Uniswap flow violation: executeSwap requires a quoteResponse returned by quote/
  );
});

