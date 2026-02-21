import assert from "node:assert/strict";
import test from "node:test";

function parsePaymentToken(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    const b64 = Buffer.from(raw, "base64").toString("utf-8");
    try {
      return JSON.parse(b64) as Record<string, unknown>;
    } catch {
      const normalized = raw.replace(/-/g, "+").replace(/_/g, "/");
      const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
      const b64u = Buffer.from(padded, "base64").toString("utf-8");
      return JSON.parse(b64u) as Record<string, unknown>;
    }
  }
}

test("real facilitator rejects replayed x402 token", async (t) => {
  if (process.env.E2E_REAL_FACILITATOR !== "true") {
    t.skip("set E2E_REAL_FACILITATOR=true to run real facilitator replay test");
    return;
  }

  const baseUrl = process.env.KITE_FACILITATOR_URL;
  const rawToken = process.env.E2E_REAL_X_PAYMENT_TOKEN;
  assert.ok(baseUrl, "KITE_FACILITATOR_URL is required");
  if (!rawToken) {
    t.skip("set E2E_REAL_X_PAYMENT_TOKEN to run real facilitator replay test");
    return;
  }

  const payload = parsePaymentToken(rawToken);

  const verify1 = await fetch(`${baseUrl}/v2/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  assert.ok(
    verify1.ok,
    `first verify must succeed, got ${verify1.status}: ${await verify1.text()}`
  );

  const settle = await fetch(`${baseUrl}/v2/settle`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  assert.ok(
    settle.ok,
    `first settle must succeed, got ${settle.status}: ${await settle.text()}`
  );

  const verify2 = await fetch(`${baseUrl}/v2/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  assert.equal(verify2.ok, false, "replayed token should be rejected");
});
