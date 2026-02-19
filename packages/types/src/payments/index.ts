export interface PaymentRequirement {
  network: string;
  asset: string;
  amount: string;
  payTo: string;
}

export interface PaymentSettlement {
  settlementId: string;
  status: "SETTLED" | "FAILED";
  txHash?: string;
}

export interface PaymentHeaderPayload {
  paymentId: string;
  signature: string;
  amount: string;
  asset: string;
  network: string;
  payer: string;
  txHash?: string;
}

export function buildPaymentHeader(payload: PaymentHeaderPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf-8").toString("base64url");
}
