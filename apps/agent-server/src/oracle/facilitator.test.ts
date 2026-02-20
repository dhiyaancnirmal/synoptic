import assert from "node:assert/strict";
import test from "node:test";
import { RealFacilitatorPaymentAdapter } from "./facilitator.js";

function toBase64Json(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value), "utf-8").toString("base64");
}

test("real facilitator adapter calls verify and settle endpoints", async () => {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const fetchImpl: typeof fetch = (async (input, init) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    calls.push({ url, body });
    if (url.endsWith("/v2/verify")) {
      return new Response(JSON.stringify({ valid: true }), { status: 200 });
    }
    if (url.endsWith("/v2/settle")) {
      return new Response(JSON.stringify({ settled: true, txHash: "0xabc" }), { status: 200 });
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;

  const adapter = new RealFacilitatorPaymentAdapter({
    baseUrl: "https://facilitator.pieverse.io",
    network: "kite-testnet",
    fetchImpl
  });

  const xPayment = toBase64Json({
    authorization: { amount: "1" },
    signature: "0xsig"
  });

  const verified = await adapter.verify(xPayment);
  assert.equal(verified.authorized, true);
  const settled = await adapter.settle(xPayment);
  assert.equal(settled.settled, true);
  assert.equal(settled.txHash, "0xabc");

  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.url, "https://facilitator.pieverse.io/v2/verify");
  assert.equal(calls[1]?.url, "https://facilitator.pieverse.io/v2/settle");
  assert.equal(calls[0]?.body.network, "kite-testnet");
  assert.equal(calls[1]?.body.network, "kite-testnet");
});

test("real facilitator adapter rejects invalid x-payment payloads", async () => {
  const adapter = new RealFacilitatorPaymentAdapter({
    baseUrl: "https://facilitator.pieverse.io",
    network: "kite-testnet"
  });

  const verified = await adapter.verify("not-base64-json");
  assert.equal(verified.authorized, false);
  assert.equal(verified.reason, "invalid_x_payment_payload");

  const settled = await adapter.settle("not-base64-json");
  assert.equal(settled.settled, false);
  assert.equal(settled.reason, "invalid_x_payment_payload");
});
