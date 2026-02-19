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
