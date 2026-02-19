import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPaymentHeader } from "./index.js";

test("buildPaymentHeader returns base64url payload", () => {
  const encoded = buildPaymentHeader({
    paymentId: "p1",
    signature: "sig",
    amount: "0.1",
    asset: "asset",
    network: "2368",
    payer: "tester"
  });

  assert.equal(typeof encoded, "string");
  assert.ok(encoded.length > 0);
});
