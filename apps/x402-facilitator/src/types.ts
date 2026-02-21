export interface PaymentAuthorization {
  from: string;
  to: string;
  token: string;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
}

export interface NormalizedPaymentRequest {
  paymentPayload: Record<string, unknown>;
  paymentRequirements: Record<string, unknown>;
  authorization: PaymentAuthorization;
  signature: string;
  sessionId: string;
  metadata: string;
  metadataBytes: string;
  paymentRequestId?: string;
  scheme: string;
  network: string;
  x402Version: number;
  asset: string;
  payTo: string;
  maxAmountRequired: string;
}

export interface SettlementClient {
  simulate(input: NormalizedPaymentRequest): Promise<void>;
  settle(input: NormalizedPaymentRequest): Promise<string>;
}
