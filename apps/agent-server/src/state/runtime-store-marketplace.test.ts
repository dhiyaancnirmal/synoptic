import assert from "node:assert/strict";
import test from "node:test";
import { RuntimeStore } from "./runtime-store.js";

test("upsertStreamBlock inserts and returns block", async () => {
  const store = new RuntimeStore();
  const result = await store.upsertStreamBlock({
    blockNumber: 100,
    blockHash: "0xabc",
    transactionCount: 5,
    gasUsed: "21000"
  });
  assert.equal(result.blockNumber, 100);
  assert.ok(result.id);
});

test("upsertStreamBlock is idempotent on blockNumber", async () => {
  const store = new RuntimeStore();
  const first = await store.upsertStreamBlock({
    blockNumber: 200,
    blockHash: "0xfirst",
    transactionCount: 3
  });
  const second = await store.upsertStreamBlock({
    blockNumber: 200,
    blockHash: "0xsecond",
    transactionCount: 7
  });
  assert.equal(first.id, second.id);

  const blocks = await store.queryStreamBlocks(10);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0]?.transactionCount, 7);
});

test("queryStreamBlocks returns blocks in descending order", async () => {
  const store = new RuntimeStore();
  await store.upsertStreamBlock({ blockNumber: 10, transactionCount: 1 });
  await store.upsertStreamBlock({ blockNumber: 30, transactionCount: 3 });
  await store.upsertStreamBlock({ blockNumber: 20, transactionCount: 2 });

  const blocks = await store.queryStreamBlocks(10);
  assert.equal(blocks.length, 3);
  assert.equal(blocks[0]?.blockNumber, 30);
  assert.equal(blocks[1]?.blockNumber, 20);
  assert.equal(blocks[2]?.blockNumber, 10);
});

test("queryStreamBlocks respects limit", async () => {
  const store = new RuntimeStore();
  for (let i = 0; i < 10; i++) {
    await store.upsertStreamBlock({ blockNumber: i, transactionCount: i });
  }
  const blocks = await store.queryStreamBlocks(3);
  assert.equal(blocks.length, 3);
});

test("insertDerivedTransfer inserts and deduplicates", async () => {
  const store = new RuntimeStore();
  const first = await store.insertDerivedTransfer({
    blockNumber: 100,
    txHash: "0xtx1",
    logIndex: 0,
    fromAddress: "0xfrom",
    toAddress: "0xto",
    tokenAddress: "0xtoken"
  });
  assert.ok(first.id);

  const dup = await store.insertDerivedTransfer({
    blockNumber: 100,
    txHash: "0xtx1",
    logIndex: 0,
    fromAddress: "0xfrom",
    toAddress: "0xto",
    tokenAddress: "0xtoken"
  });
  assert.equal(dup.id, first.id);

  const transfers = await store.queryDerivedTransfers(10);
  assert.equal(transfers.length, 1);
});

test("queryDerivedTransfers returns recent first", async () => {
  const store = new RuntimeStore();
  await store.insertDerivedTransfer({
    blockNumber: 1,
    txHash: "0xa",
    logIndex: 0,
    fromAddress: "0x1",
    toAddress: "0x2",
    tokenAddress: "0xt"
  });
  await store.insertDerivedTransfer({
    blockNumber: 2,
    txHash: "0xb",
    logIndex: 0,
    fromAddress: "0x1",
    toAddress: "0x2",
    tokenAddress: "0xt"
  });

  const transfers = await store.queryDerivedTransfers(10);
  assert.equal(transfers.length, 2);
  assert.equal(transfers[0]?.txHash, "0xb");
});

test("upsertContractActivity inserts and updates", async () => {
  const store = new RuntimeStore();
  const first = await store.upsertContractActivity({
    contractAddress: "0xcontract",
    blockStart: 100,
    blockEnd: 100,
    txCount: 5,
    uniqueCallers: 3,
    failedTxCount: 0
  });
  assert.ok(first.id);

  const updated = await store.upsertContractActivity({
    contractAddress: "0xcontract",
    blockStart: 100,
    blockEnd: 100,
    txCount: 10,
    uniqueCallers: 6,
    failedTxCount: 1
  });
  assert.equal(updated.id, first.id);

  const activity = await store.queryContractActivity(10);
  assert.equal(activity.length, 1);
  assert.equal(activity[0]?.txCount, 10);
  assert.equal(activity[0]?.uniqueCallers, 6);
});

test("createPurchase and getPurchase round-trip", async () => {
  const store = new RuntimeStore();
  const created = await store.createPurchase({
    sku: "monad_transfer_feed",
    status: "completed",
    resultHash: "abc123"
  });
  assert.ok(created.id);
  assert.equal(created.sku, "monad_transfer_feed");
  assert.equal(created.status, "completed");

  const fetched = await store.getPurchase(created.id);
  assert.ok(fetched);
  assert.equal(fetched.sku, "monad_transfer_feed");
  assert.equal(fetched.resultHash, "abc123");
});

test("getPurchase returns undefined for non-existent id", async () => {
  const store = new RuntimeStore();
  const result = await store.getPurchase("non-existent-id");
  assert.equal(result, undefined);
});

test("listPurchases returns all purchases", async () => {
  const store = new RuntimeStore();
  await store.createPurchase({ sku: "sku1", status: "completed" });
  await store.createPurchase({ sku: "sku2", status: "completed" });
  await store.createPurchase({ sku: "sku3", status: "completed" });

  const all = await store.listPurchases();
  assert.equal(all.length, 3);
  const skus = all.map((p) => p.sku).sort();
  assert.deepEqual(skus, ["sku1", "sku2", "sku3"]);
});

test("listPurchases filters by agentId", async () => {
  const store = new RuntimeStore();
  const agent = await store.createAgent({ name: "Test" });
  await store.createPurchase({ sku: "sku1", status: "completed", agentId: agent.id });
  await store.createPurchase({ sku: "sku2", status: "completed", agentId: "other-agent" });

  const filtered = await store.listPurchases(agent.id);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0]?.sku, "sku1");
});
