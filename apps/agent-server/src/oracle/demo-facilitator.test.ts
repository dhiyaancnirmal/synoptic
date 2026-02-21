import assert from "node:assert/strict";
import test from "node:test";
import { DemoPaymentAdapter } from "./demo-facilitator.js";

function toBase64Json(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value), "utf-8").toString("base64");
}

test("demo adapter verify accepts well-formed JSON payload", async () => {
  const adapter = new DemoPaymentAdapter();
  const result = await adapter.verify(
    JSON.stringify({
      paymentPayload: { authorization: { payer: "0x1", amount: "100" }, signature: "0xsig" },
      paymentRequirements: { scheme: "exact", network: "eip155:2368" }
    })
  );
  assert.equal(result.authorized, true);
});

test("demo adapter verify accepts base64-encoded payload", async () => {
  const adapter = new DemoPaymentAdapter();
  const encoded = toBase64Json({
    paymentPayload: { authorization: { payer: "0x1" } },
    paymentRequirements: { scheme: "exact" }
  });
  const result = await adapter.verify(encoded);
  assert.equal(result.authorized, true);
});

test("demo adapter verify rejects empty string", async () => {
  const adapter = new DemoPaymentAdapter();
  const result = await adapter.verify("");
  assert.equal(result.authorized, false);
  assert.equal(result.reason, "demo_invalid_payload");
});

test("demo adapter verify rejects non-JSON string", async () => {
  const adapter = new DemoPaymentAdapter();
  const result = await adapter.verify("not-json-at-all");
  assert.equal(result.authorized, false);
  assert.equal(result.reason, "demo_invalid_payload");
});

test("demo adapter verify rejects empty object (no payment fields)", async () => {
  const adapter = new DemoPaymentAdapter();
  const result = await adapter.verify(JSON.stringify({}));
  assert.equal(result.authorized, false);
  assert.equal(result.reason, "demo_missing_payment_fields");
});

test("demo adapter verify accepts payload with scheme field", async () => {
  const adapter = new DemoPaymentAdapter();
  const result = await adapter.verify(JSON.stringify({ scheme: "exact", authorization: {} }));
  assert.equal(result.authorized, true);
});

test("demo adapter settle returns deterministic tx hash", async () => {
  const adapter = new DemoPaymentAdapter();
  const payload = JSON.stringify({
    paymentPayload: { authorization: {} },
    paymentRequirements: { paymentRequestId: "req-123", scheme: "exact" }
  });
  const result = await adapter.settle(payload);
  assert.equal(result.settled, true);
  assert.ok(result.txHash?.startsWith("0xdemo_"));
  assert.ok(result.txHash?.includes("req-123"));
});

test("demo adapter settle rejects empty string", async () => {
  const adapter = new DemoPaymentAdapter();
  const result = await adapter.settle("");
  assert.equal(result.settled, false);
  assert.equal(result.reason, "demo_invalid_payload");
});

test("demo adapter settle handles missing paymentRequestId", async () => {
  const adapter = new DemoPaymentAdapter();
  const result = await adapter.settle(JSON.stringify({ scheme: "exact", authorization: {} }));
  assert.equal(result.settled, true);
  assert.ok(result.txHash?.startsWith("0xdemo_"));
});
