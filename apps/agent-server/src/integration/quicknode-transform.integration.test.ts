import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "../server.js";

const SECURITY_TOKEN = "qn-test-token-transform";

test("POST /webhooks/quicknode/monad processes block and populates stream_blocks", async (t) => {
  process.env.QUICKNODE_SECURITY_TOKEN = SECURITY_TOKEN;
  const app = await createServer();
  t.after(async () => {
    delete process.env.QUICKNODE_SECURITY_TOKEN;
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
          transactionCount: 2
        }
      ]
    }
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.ok, true);
  assert.equal(body.blocksProcessed, 1);
  assert.equal(body.lastBlockNumber, 420);
});

test("POST /webhooks/quicknode/monad extracts ERC-20 transfers from pre-filtered data", async (t) => {
  process.env.QUICKNODE_SECURITY_TOKEN = SECURITY_TOKEN;
  const app = await createServer();
  t.after(async () => {
    delete process.env.QUICKNODE_SECURITY_TOKEN;
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
              blockNumber: 500
            },
            {
              txHash: "0xtransfer2",
              from: "0xsender2",
              to: "0xreceiver2",
              tokenContract: "0xtoken2",
              blockNumber: 500
            }
          ],
          deployments: [
            {
              txHash: "0xdeploy1",
              deployer: "0xdeployer",
              contractAddress: "0xnewcontract",
              blockNumber: 500
            }
          ]
        }
      ]
    }
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.transfersExtracted, 2);
  assert.equal(body.deploymentsDetected, 1);
});

test("POST /webhooks/quicknode/monad extracts transfers from raw transactions", async (t) => {
  process.env.QUICKNODE_SECURITY_TOKEN = SECURITY_TOKEN;
  const app = await createServer();
  t.after(async () => {
    delete process.env.QUICKNODE_SECURITY_TOKEN;
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
              input: "0xa9059cbb000000000000000000000000receiver000000000000000000000000000000000064"
            },
            {
              hash: "0xtx_deploy",
              from: "0xdeployer",
              to: null,
              contractAddress: "0xnewly_deployed"
            },
            {
              hash: "0xtx_normal",
              from: "0xsender",
              to: "0xrecipient",
              input: "0x12345678"
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
});

test("POST /webhooks/quicknode/monad handles multiple blocks", async (t) => {
  process.env.QUICKNODE_SECURITY_TOKEN = SECURITY_TOKEN;
  const app = await createServer();
  t.after(async () => {
    delete process.env.QUICKNODE_SECURITY_TOKEN;
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
        { number: 700, hash: "0xblock700", transactionCount: 1 },
        { number: 701, hash: "0xblock701", transactionCount: 2 },
        { number: 702, hash: "0xblock702", transactionCount: 3 }
      ]
    }
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.blocksProcessed, 3);
  assert.equal(body.lastBlockNumber, 702);
});

test("POST /webhooks/quicknode/monad handles empty data gracefully", async (t) => {
  process.env.QUICKNODE_SECURITY_TOKEN = SECURITY_TOKEN;
  const app = await createServer();
  t.after(async () => {
    delete process.env.QUICKNODE_SECURITY_TOKEN;
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/webhooks/quicknode/monad",
    headers: {
      "x-quicknode-token": SECURITY_TOKEN,
      "content-type": "application/json"
    },
    payload: { data: [] }
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.ok, true);
  assert.equal(body.blocksProcessed, 0);
});
