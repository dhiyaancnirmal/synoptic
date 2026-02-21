export interface FacilitatorEnv {
  port: number;
  rpcUrl: string;
  privateKey: string;
  canonicalScheme: string;
  canonicalNetwork: string;
  chainId: number;
  settleConfirmations: number;
}

function readNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadEnv(): FacilitatorEnv {
  return {
    port: readNumber(process.env.PORT, 4010),
    rpcUrl: process.env.FACILITATOR_RPC_URL ?? process.env.KITE_RPC_URL ?? "https://rpc-testnet.gokite.ai/",
    privateKey: process.env.FACILITATOR_PRIVATE_KEY ?? "",
    canonicalScheme: process.env.FACILITATOR_CANONICAL_SCHEME ?? "gokite-aa",
    canonicalNetwork: process.env.FACILITATOR_CANONICAL_NETWORK ?? "kite-testnet",
    chainId: readNumber(process.env.FACILITATOR_CHAIN_ID, 2368),
    settleConfirmations: readNumber(process.env.FACILITATOR_SETTLE_CONFIRMATIONS, 1)
  };
}
