import type { PaymentSettlement } from "@synoptic/types/payments";

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      auth?: {
        agentId: string;
        ownerAddress: string;
        scopes: string[];
      };
      paymentSettlement?: PaymentSettlement;
    }
  }
}

export {};
