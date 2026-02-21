import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "../server.js";

const SECURITY_TOKEN = "qn-test-token-transform";

const ERC20_INPUT_WITH_AMOUNT_100 =
  "0xa9059cbb" +
  "00000000000000000000000000000000000000000000000000000000000000aa" +
  "0000000000000000000000000000000000000000000000000000000000000064";

test("POST /webhooks/quicknode/monad processes block and emits enriched metrics", async (t) => {
  process.env.QUICKNODE_SECURITY_TOKEN = SECURITY_TOKEN;
  process.env.FACILITATOR_MODE = "demo";
  const app = await createServer();
  t.after(async () => {
    delete process.env.QUICKNODE_SECURITY_TOKEN;
    delete process.env.FACILITATOR_MODE;
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/webhooks/quicknode/monad",
    headers: {
      "x-quicknode-token": SECURITY_TOKEN,
      "content-type": "application/json"
    },
    payload: {
      data: [
        {
          number: "0x1a4",
          hash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
          parentHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
          timestamp: "0x65a1b2c3",
          gasUsed: "0x5208",
          transactionCount: 2,
          transactions: [
            {
              hash: "0xtx_selector_1",
              from: "0x1111",
              to: "0x2222",
              input: "0x1234567800000000000000000000000000000000000000000000000000000000"
            }
          ]
        }
      ]
    }
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.ok, true);
  assert.equal(body.blocksProcessed, 1);
  assert.equal(body.lastBlockNumber, 420);
  assert.equal(body.selectorsExtracted, 1);
});

test("POST /webhooks/quicknode/monad extracts transfers from pre-filtered data with decoded amounts", async (t) => {
  process.env.QUICKNODE_SECURITY_TOKEN = SECURITY_TOKEN;
  process.env.FACILITATOR_MODE = "demo";
  const app = await createServer();
  t.after(async () => {
    delete process.env.QUICKNODE_SECURITY_TOKEN;
    delete process.env.FACILITATOR_MODE;
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/webhooks/quicknode/monad",
    headers: {
      "x-quicknode-token": SECURITY_TOKEN,
      "content-type": "application/json"
    },
    payload: {
      data: [
        {
          number: 500,
          hash: "0xblock500",
          transactionCount: 3,
          transfers: [
            {
              txHash: "0xtransfer1",
              from: "0xsender",
              to: "0xreceiver",
              tokenContract: "0xtoken",
              input: ERC20_INPUT_WITH_AMOUNT_100,
              blockNumber: 500
            }
          ]
        }
      ]
    }
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.transfersExtracted, 1);

  const preview = await app.inject({
    method: "GET",
    url: "/marketplace/products/monad_orderflow_imbalance/preview?limit=1"
  });
  assert.equal(preview.statusCode, 200);
  const previewBody = preview.json();
  assert.ok(Array.isArray(previewBody.data));
  assert.ok(previewBody.data.length > 0);
  assert.equal(previewBody.data[0]?.inflow, 100);
});

test("POST /webhooks/quicknode/monad extracts selectors and deployments from raw transactions", async (t) => {
  process.env.QUICKNODE_SECURITY_TOKEN = SECURITY_TOKEN;
  process.env.FACILITATOR_MODE = "demo";
  const app = await createServer();
  t.after(async () => {
    delete process.env.QUICKNODE_SECURITY_TOKEN;
    delete process.env.FACILITATOR_MODE;
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/webhooks/quicknode/monad",
    headers: {
      "x-quicknode-token": SECURITY_TOKEN,
      "content-type": "application/json"
    },
    payload: {
      data: [
        {
          number: 600,
          hash: "0xblock600",
          transactions: [
            {
              hash: "0xtx_erc20",
              from: "0xsender",
              to: "0xtokencontract",
              input: ERC20_INPUT_WITH_AMOUNT_100
            },
            {
              hash: "0xtx_deploy",
              from: "0xdeployer",
              to: null,
              contractAddress: "0xnewly_deployed",
              input: "0x60806040"
            },
            {
              hash: "0xtx_normal",
              from: "0xsender",
              to: "0xrecipient",
              input: "0x1234567800000000"
            }
          ]
        }
      ]
    }
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.transfersExtracted, 1);
  assert.equal(body.deploymentsDetected, 1);
  assert.ok(body.selectorsExtracted >= 2);

  const selectorPreview = await app.inject({
    method: "GET",
    url: "/marketplace/products/monad_selector_heatmap/preview?limit=5"
  });
  assert.equal(selectorPreview.statusCode, 200);
  const selectorBody = selectorPreview.json();
  assert.ok(Array.isArray(selectorBody.data));
  assert.ok(selectorBody.data.some((entry: { selector?: string }) => entry.selector === "0xa9059cbb"));
});

test("POST /webhooks/quicknode/monad handles multiple blocks and empty payloads", async (t) => {
  process.env.QUICKNODE_SECURITY_TOKEN = SECURITY_TOKEN;
  process.env.FACILITATOR_MODE = "demo";
  const app = await createServer();
  t.after(async () => {
    delete process.env.QUICKNODE_SECURITY_TOKEN;
    delete process.env.FACILITATOR_MODE;
    await app.close();
  });

  const multiResponse = await app.inject({
    method: "POST",
    url: "/webhooks/quicknode/monad",
    headers: {
      "x-quicknode-token": SECURITY_TOKEN,
      "content-type": "application/json"
    },
    payload: {
      data: [
        { number: 700, hash: "0xblock700", transactionCount: 1 },
        { number: 701, hash: "0xblock701", transactionCount: 2 },
        { number: 702, hash: "0xblock702", transactionCount: 3 }
      ]
    }
  });

  assert.equal(multiResponse.statusCode, 200);
  const multiBody = multiResponse.json();
  assert.equal(multiBody.blocksProcessed, 3);
  assert.equal(multiBody.lastBlockNumber, 702);

  const emptyResponse = await app.inject({
    method: "POST",
    url: "/webhooks/quicknode/monad",
    headers: {
      "x-quicknode-token": SECURITY_TOKEN,
      "content-type": "application/json"
    },
    payload: { data: [] }
  });

  assert.equal(emptyResponse.statusCode, 200);
  const emptyBody = emptyResponse.json();
  assert.equal(emptyBody.ok, true);
  assert.equal(emptyBody.blocksProcessed, 0);
});
