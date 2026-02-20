interface MintPaymentParams {
  agentId: string;
  route: "/markets/quote" | "/markets/execute";
}

interface MintPaymentResult {
  xPayment: string;
}

const DEFAULT_MINT_TIMEOUT_MS = 4000;

export async function resolveXPayment(
  params: MintPaymentParams,
  overrideHeader?: string
): Promise<string> {
  if (typeof overrideHeader === "string" && overrideHeader.trim().length > 0) {
    return overrideHeader;
  }

  const staticFromEnv = process.env.SYNOPTIC_X_PAYMENT;
  if (typeof staticFromEnv === "string" && staticFromEnv.trim().length > 0) {
    return staticFromEnv;
  }

  const mintUrl = process.env.SYNOPTIC_X402_MINT_URL;
  const mintToken = process.env.SYNOPTIC_X402_MINT_TOKEN;
  if (!mintUrl || !mintToken) {
    throw new Error(
      "Missing x402 payment source. Provide --x-payment, SYNOPTIC_X_PAYMENT, or configure SYNOPTIC_X402_MINT_URL + SYNOPTIC_X402_MINT_TOKEN."
    );
  }

  const timeoutMs = Number(process.env.SYNOPTIC_X402_MINT_TIMEOUT_MS ?? DEFAULT_MINT_TIMEOUT_MS);
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_MINT_TIMEOUT_MS);

  try {
    const response = await fetch(mintUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${mintToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        agentId: params.agentId,
        route: params.route,
        amount: process.env.X402_PRICE_USD ?? "0.10",
        network: process.env.KITE_CHAIN_ID ?? "2368",
        asset: process.env.SETTLEMENT_TOKEN_ADDRESS
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`x402 mint rejected with ${response.status}`);
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const xPayment = readString(payload, ["xPayment", "x_payment", "paymentHeader"]);
    if (!xPayment) {
      throw new Error("x402 mint response missing xPayment field");
    }

    return xPayment;
  } finally {
    clearTimeout(timeout);
  }
}

function readString(payload: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}

export type { MintPaymentResult };
