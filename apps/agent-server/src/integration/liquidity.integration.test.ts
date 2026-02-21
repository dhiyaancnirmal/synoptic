import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { AddressInfo } from "node:net";
import test from "node:test";
import { keccak256 } from "ethers";
import { createServer } from "../server.js";
import { createTestAuthHeaders } from "./test-auth.js";

interface RpcCall {
  id: number | string | null;
  method: string;
  params?: unknown[];
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return JSON.parse(raw) as unknown;
}

function writeRpcResponse(res: ServerResponse, call: RpcCall, result: unknown): void {
  res.setHeader("content-type", "application/json");
  res.end(
    JSON.stringify({
      jsonrpc: "2.0",
      id: call.id,
      result
    })
  );
}

async function startRpcServer(): Promise<{ url: string; close: () => Promise<void> }> {
  let lastTxHash = `0x${"a".repeat(64)}`;

  function rpcResult(call: RpcCall): unknown {
    switch (call.method) {
      case "eth_chainId":
        return "0x279f"; // 10143
      case "eth_getTransactionCount":
        return "0x1";
      case "eth_sendRawTransaction": {
        const rawTx = typeof call.params?.[0] === "string" ? call.params[0] : "0x";
        lastTxHash = keccak256(rawTx);
        return lastTxHash;
      }
      case "eth_blockNumber":
        return "0x2";
      case "eth_getTransactionReceipt":
        return {
          transactionHash: lastTxHash,
          transactionIndex: "0x0",
          blockHash: `0x${"b".repeat(64)}`,
          blockNumber: "0x1",
          from: "0x1111111111111111111111111111111111111111",
          to: "0x2222222222222222222222222222222222222222",
          cumulativeGasUsed: "0x5208",
          gasUsed: "0x5208",
          contractAddress: null,
          logs: [],
          logsBloom: `0x${"0".repeat(512)}`,
          status: "0x1",
          effectiveGasPrice: "0x1",
          type: "0x2"
        };
      default:
        return "0x1";
    }
  }

  const server = createHttpServer(async (req, res) => {
    const payload = (await readJsonBody(req)) as RpcCall | RpcCall[];
    if (Array.isArray(payload)) {
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify(
          payload.map((call) => ({
            jsonrpc: "2.0",
            id: call.id,
            result: rpcResult(call)
          }))
        )
      );
      return;
    }
    writeRpcResponse(res, payload, rpcResult(payload));
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: async () => {
      server.close();
      await once(server, "close");
    }
  };
}

test("liquidity mutating endpoints return 402 without x-payment", async (t) => {
  process.env.FACILITATOR_MODE = "demo";
  const app = await createServer();
  t.after(async () => {
    delete process.env.FACILITATOR_MODE;
    await app.close();
  });

  const endpoints = ["/liquidity/create", "/liquidity/increase", "/liquidity/decrease", "/liquidity/collect"] as const;
  const authHeaders = createTestAuthHeaders();
  for (const endpoint of endpoints) {
    const response = await app.inject({
      method: "POST",
      url: endpoint,
      headers: { ...authHeaders, "content-type": "application/json" },
      payload: {
        token0: "0x760afe86e5de5fa0ee542fc7b7b713e1c5425701",
        token1: "0x62534e4bbd6d9ebac0ac99aeaa0aa48e56372df0",
        amount0: "1",
        amount1: "1"
      }
    });
    assert.equal(response.statusCode, 402);
    assert.equal(response.json().x402Version, 1);
  }
});

test("POST /liquidity/create simulates on Monad testnet (10143) in auto mode", async (t) => {
  process.env.FACILITATOR_MODE = "demo";
  process.env.UNISWAP_API_KEY = "test-uniswap-key";
  process.env.AGENT_PRIVATE_KEY = "0x59c6995e998f97a5a0044966f0945382f4ff449bbf44e0f8c4f3fcbf7f0f6b0f";

  const rpc = await startRpcServer();
  process.env.EXECUTION_RPC_URL = rpc.url;
  process.env.EXECUTION_CHAIN_ID = "10143";

  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    if (url.includes("/lp/create")) {
      return new Response(
        JSON.stringify({
          requestId: "lp-create-1",
          positionId: "123",
          tx: {
            to: "0x1111111111111111111111111111111111111111",
            data: "0x1234",
            value: "0",
            chainId: 10143,
            gasLimit: "21000",
            maxFeePerGas: "1",
            maxPriorityFeePerGas: "1"
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (url.includes("/supported_chains")) {
      return new Response(
        JSON.stringify({
          chains: [{ chainId: 10143, name: "monad-testnet" }]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    return previousFetch(input, init);
  }) as typeof fetch;

  const app = await createServer();
  t.after(async () => {
    globalThis.fetch = previousFetch;
    delete process.env.FACILITATOR_MODE;
    delete process.env.UNISWAP_API_KEY;
    delete process.env.AGENT_PRIVATE_KEY;
    delete process.env.EXECUTION_RPC_URL;
    delete process.env.EXECUTION_CHAIN_ID;
    await app.close();
    await rpc.close();
  });

  const challengeRes = await app.inject({
    method: "POST",
    url: "/liquidity/create",
    headers: { ...createTestAuthHeaders(), "content-type": "application/json" },
    payload: {
      chainId: 10143,
      token0: "0x760afe86e5de5fa0ee542fc7b7b713e1c5425701",
      token1: "0x62534e4bbd6d9ebac0ac99aeaa0aa48e56372df0",
      amount0: "1",
      amount1: "1",
      feeTier: 3000,
      preset: "uniform",
      lowerBoundPct: -0.2,
      upperBoundPct: 0.2
    }
  });

  assert.equal(challengeRes.statusCode, 402);
  const challenge = challengeRes.json();

  const xPayment = JSON.stringify({
    paymentPayload: {
      scheme: challenge.scheme ?? "exact",
      network: challenge.network ?? "eip155:2368",
      authorization: {
        payer: "0xTestPayer",
        payee: challenge.payTo,
        amount: challenge.maxAmountRequired
      },
      signature: "0xdemo_signature"
    },
    paymentRequirements: challenge
  });

  const successRes = await app.inject({
    method: "POST",
    url: "/liquidity/create",
    headers: {
      ...createTestAuthHeaders(),
      "content-type": "application/json",
      "x-payment": xPayment,
      "x-payment-request-id": challenge.paymentRequestId
    },
    payload: {
      chainId: 10143,
      token0: "0x760afe86e5de5fa0ee542fc7b7b713e1c5425701",
      token1: "0x62534e4bbd6d9ebac0ac99aeaa0aa48e56372df0",
      amount0: "1",
      amount1: "1",
      feeTier: 3000,
      preset: "uniform",
      lowerBoundPct: -0.2,
      upperBoundPct: 0.2
    }
  });

  assert.equal(successRes.statusCode, 200);
  const body = successRes.json();
  assert.equal(body.status, "confirmed");
  assert.ok(body.txHash);
  assert.ok(body.attestationTxHash);
  assert.equal(typeof body.positionId, "string");
  assert.equal(body.positionId.length, 16);
  assert.equal(body.simulation?.enabled, true);
  assert.equal(body.simulation?.chainId, 10143);
});

test("POST /liquidity/create fails when strict attestation is not configured in live mode", async (t) => {
  process.env.FACILITATOR_MODE = "demo";
  process.env.SWAP_EXECUTION_MODE = "live";
  process.env.EXECUTION_CHAIN_ID = "143";
  process.env.UNISWAP_API_KEY = "test-uniswap-key";
  process.env.AGENT_PRIVATE_KEY = "0x59c6995e998f97a5a0044966f0945382f4ff449bbf44e0f8c4f3fcbf7f0f6b0f";
  process.env.EXECUTION_RPC_URL = "http://127.0.0.1:8545";
  delete process.env.KITE_RPC_URL;
  delete process.env.SERVICE_REGISTRY_ADDRESS;

  const app = await createServer();
  t.after(async () => {
    delete process.env.FACILITATOR_MODE;
    delete process.env.SWAP_EXECUTION_MODE;
    delete process.env.EXECUTION_CHAIN_ID;
    delete process.env.UNISWAP_API_KEY;
    delete process.env.AGENT_PRIVATE_KEY;
    delete process.env.EXECUTION_RPC_URL;
    await app.close();
  });

  const challengeRes = await app.inject({
    method: "POST",
    url: "/liquidity/create",
    headers: { ...createTestAuthHeaders(), "content-type": "application/json" },
    payload: {
      chainId: 143,
      token0: "0x760afe86e5de5fa0ee542fc7b7b713e1c5425701",
      token1: "0x62534e4bbd6d9ebac0ac99aeaa0aa48e56372df0",
      amount0: "1",
      amount1: "1"
    }
  });
  assert.equal(challengeRes.statusCode, 402);
  const challenge = challengeRes.json();

  const xPayment = JSON.stringify({
    paymentPayload: {
      scheme: challenge.scheme ?? "exact",
      network: challenge.network ?? "eip155:2368",
      authorization: {
        payer: "0xTestPayer",
        payee: challenge.payTo,
        amount: challenge.maxAmountRequired
      },
      signature: "0xdemo_signature"
    },
    paymentRequirements: challenge
  });

  const response = await app.inject({
    method: "POST",
    url: "/liquidity/create",
    headers: {
      ...createTestAuthHeaders(),
      "content-type": "application/json",
      "x-payment": xPayment,
      "x-payment-request-id": challenge.paymentRequestId
    },
    payload: {
      chainId: 143,
      token0: "0x760afe86e5de5fa0ee542fc7b7b713e1c5425701",
      token1: "0x62534e4bbd6d9ebac0ac99aeaa0aa48e56372df0",
      amount0: "1",
      amount1: "1"
    }
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.json().code, "ATTESTATION_NOT_CONFIGURED");
});

test("GET /trade/supported-chains reports Monad unsupported when missing", async (t) => {
  process.env.FACILITATOR_MODE = "demo";
  process.env.UNISWAP_API_KEY = "test-uniswap-key";
  process.env.AGENT_PRIVATE_KEY = "0x59c6995e998f97a5a0044966f0945382f4ff449bbf44e0f8c4f3fcbf7f0f6b0f";
  process.env.EXECUTION_RPC_URL = "http://127.0.0.1:8555";

  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    if (url.includes("/supported_chains")) {
      return new Response(
        JSON.stringify({
          chains: [{ chainId: 1, name: "ethereum" }]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    return previousFetch(input, init);
  }) as typeof fetch;

  const app = await createServer();
  t.after(async () => {
    globalThis.fetch = previousFetch;
    delete process.env.FACILITATOR_MODE;
    delete process.env.UNISWAP_API_KEY;
    delete process.env.AGENT_PRIVATE_KEY;
    delete process.env.EXECUTION_RPC_URL;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/trade/supported-chains"
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.monadSupportedForSwap, false);
  assert.equal(body.monadSupportedForLp, false);
});
