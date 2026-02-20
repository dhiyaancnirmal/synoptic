export interface X402Challenge {
  x402Version: number;
  scheme: string;
  network: string;
  asset: string;
  payTo: string;
  maxAmountRequired: string;
  maxTimeoutSeconds: number;
}
