import assert from "node:assert/strict";
import test from "node:test";
import { UniswapClient } from "./uniswap-client.js";
import {
  UNISWAP_CONTENT_TYPE,
  UNISWAP_GATEWAY_BASE_URL,
  UNISWAP_UNIVERSAL_ROUTER_VERSION
} from "./uniswap-types.js";

test("Uniswap client uses required headers on check_approval, quote, and swap", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  const client = new UniswapClient("api-key-1", UNISWAP_GATEWAY_BASE_URL, async (url, init) => {
    const asUrl = String(url);
    calls.push({ url: asUrl, init });
    if (asUrl.endsWith("/check_approval")) {
      return new Response(JSON.stringify({ requestId: "a-1" }), { status: 200 });
    }
    if (asUrl.endsWith("/quote")) {
      return new Response(JSON.stringify({ requestId: "q-1", routing: "BEST_PRICE" }), { status: 200 });
    }
    return new Response(
      JSON.stringify({ requestId: "s-1", swap: { to: "0x1", data: "0x1234", value: "0" } }),
      { status: 200 }
    );
  });

  await client.checkApproval({
    walletAddress: "0x2222222222222222222222222222222222222222",
    token: "0x0000000000000000000000000000000000000000",
    amount: "1000000000000000",
    chainId: 11155111
  });

  await client.quote({
    tokenIn: "0x0000000000000000000000000000000000000000",
    tokenOut: "0x1111111111111111111111111111111111111111",
    tokenInChainId: 11155111,
    tokenOutChainId: 11155111,
    type: "EXACT_INPUT",
    amount: "1000000000000000",
    swapper: "0x2222222222222222222222222222222222222222"
  });

  await client.swap({ requestId: "q-1" });

  assert.deepEqual(
    calls.map((call) => call.url),
    [
      "https://trade-api.gateway.uniswap.org/v1/check_approval",
      "https://trade-api.gateway.uniswap.org/v1/quote",
      "https://trade-api.gateway.uniswap.org/v1/swap"
    ]
  );

  for (const call of calls) {
    const headers = call.init?.headers as Record<string, string>;
    assert.equal(headers["x-api-key"], "api-key-1");
    assert.equal(headers["x-universal-router-version"], UNISWAP_UNIVERSAL_ROUTER_VERSION);
    assert.equal(headers["content-type"], UNISWAP_CONTENT_TYPE);
  }

  const parsedBody = JSON.parse(String(calls[1]?.init?.body));
  assert.equal(parsedBody.routingPreference, "BEST_PRICE");
  assert.deepEqual(parsedBody.protocols, ["V2", "V3", "V4"]);
});

test("Uniswap client validates tx data in /check_approval and /swap responses", async () => {
  const okClient = new UniswapClient("api-key", UNISWAP_GATEWAY_BASE_URL, async (url) => {
    if (String(url).endsWith("/check_approval")) {
      return new Response(
        JSON.stringify({
          requestId: "a-1",
          approval: { to: "0x1", data: "0xabcdef", value: "0" }
        }),
        { status: 200 }
      );
    }
    return new Response(
      JSON.stringify({
        requestId: "s-1",
        swap: { to: "0x2", data: "0x1234", value: "0" }
      }),
      { status: 200 }
    );
  });

  const approval = await okClient.checkApproval({
    walletAddress: "0x3333333333333333333333333333333333333333",
    token: "0x4444444444444444444444444444444444444444",
    amount: "10",
    chainId: 11155111
  });
  assert.equal(approval.requestId, "a-1");

  const swap = await okClient.swap({ requestId: "q-1" });
  assert.equal(swap.requestId, "s-1");

  const badClient = new UniswapClient("api-key", UNISWAP_GATEWAY_BASE_URL, async () => {
    return new Response(
      JSON.stringify({
        requestId: "s-2",
        swap: { to: "0x2", data: "0x", value: "0" }
      }),
      { status: 200 }
    );
  });

  await assert.rejects(async () => badClient.swap({ requestId: "q-2" }), /Invalid Uniswap \/swap/);
});

test("Uniswap client supports /supported_chains with required headers", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const client = new UniswapClient("api-key-2", UNISWAP_GATEWAY_BASE_URL, async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(
      JSON.stringify({
        chains: [
          { chainId: 1, name: "ethereum" },
          { chainId: 10143, name: "monad-testnet" }
        ]
      }),
      { status: 200 }
    );
  });

  const response = await client.supportedChains();
  assert.equal(response.chains.length, 2);
  assert.equal(response.chains[0]?.chainId, 1);
  assert.equal(response.chains[1]?.chainId, 10143);

  const first = calls[0];
  assert.ok(first);
  assert.equal(first.url, "https://trade-api.gateway.uniswap.org/v1/supported_chains");
  const headers = first.init?.headers as Record<string, string>;
  assert.equal(headers["x-api-key"], "api-key-2");
  assert.equal(headers["x-universal-router-version"], UNISWAP_UNIVERSAL_ROUTER_VERSION);
});

test("Uniswap client falls back to static supported chains on endpoint error", async () => {
  const client = new UniswapClient("api-key-3", UNISWAP_GATEWAY_BASE_URL, async () => {
    return new Response("upstream unavailable", { status: 503 });
  });

  const response = await client.supportedChains();
  assert.ok(response.chains.length > 0);
  assert.ok(response.chains.some((chain) => chain.chainId === 143));
});

test("Uniswap client exposes LP endpoint wrappers", async () => {
  const calledPaths: string[] = [];
  const client = new UniswapClient("api-key-4", UNISWAP_GATEWAY_BASE_URL, async (url) => {
    const asUrl = String(url);
    calledPaths.push(asUrl.replace(UNISWAP_GATEWAY_BASE_URL, ""));
    return new Response(
      JSON.stringify({
        requestId: "lp-1",
        tx: { to: "0x1", data: "0x1234", value: "0" }
      }),
      { status: 200 }
    );
  });

  await client.lpApprove({ token0: "0x1" });
  await client.lpQuote({ token0: "0x1" });
  await client.lpCreate({ token0: "0x1" });
  await client.lpIncrease({ token0: "0x1" });
  await client.lpDecrease({ token0: "0x1" });
  await client.lpCollect({ token0: "0x1" });
  await client.lpHistory("0xabc", 10143);

  assert.deepEqual(calledPaths, [
    "/lp/approve",
    "/lp/quote",
    "/lp/create",
    "/lp/increase",
    "/lp/decrease",
    "/lp/collect",
    "/lp/history?walletAddress=0xabc&chainId=10143"
  ]);
});
