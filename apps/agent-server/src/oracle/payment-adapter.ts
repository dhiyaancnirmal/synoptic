import type { PaymentAdapter } from "@synoptic/agent-core";
import { DemoPaymentAdapter } from "./demo-facilitator.js";
import { RealFacilitatorPaymentAdapter } from "./facilitator.js";

export type PaymentMode = "facilitator" | "demo";

export function createPaymentAdapter(input: {
  mode: PaymentMode;
  facilitatorUrl: string;
  network: string;
}): PaymentAdapter {
  if (input.mode === "demo") {
    return new DemoPaymentAdapter();
  }
  if (!input.facilitatorUrl || input.facilitatorUrl.trim().length === 0) {
    throw new Error("KITE_PAYMENT_MODE=facilitator requires KITE_FACILITATOR_URL");
  }
  return new RealFacilitatorPaymentAdapter({
    baseUrl: input.facilitatorUrl,
    network: input.network
  });
}

