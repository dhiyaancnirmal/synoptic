import { z } from "zod";

export const WalletSchema = z.object({
  version: z.literal(1),
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  privateKey: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  createdAt: z.string().datetime(),
  chains: z.object({
    kite: z.object({
      chainId: z.number(),
      rpc: z.string().url()
    }),
    monad: z.object({
      chainId: z.number(),
      rpc: z.string().url()
    }),
    monadTestnet: z
      .object({
        chainId: z.number(),
        rpc: z.string().url()
      })
      .optional()
  })
});

export type WalletData = z.infer<typeof WalletSchema>;

export const ConfigSchema = z.object({
  defaultAmount: z.string().default("0.01"),
  tickIntervalMs: z.number().int().positive().default(30000),
  maxRetries: z.number().int().positive().default(3),
  backoffMs: z.number().int().positive().default(1000),
  apiUrl: z.string().url().default("https://agent-server-production-e47b.up.railway.app"),
  kiteRpcUrl: z.string().url().default("https://rpc-testnet.gokite.ai/"),
  monadRpcUrl: z.string().url().default("https://rpc.monad.xyz"),
  monadTestnetRpcUrl: z.string().url().optional(),
  kiteExplorerUrl: z.string().url().default("https://testnet.kitescan.ai"),
  monadExplorerUrl: z.string().url().default("https://monadexplorer.com"),
  monadTestnetExplorerUrl: z.string().url().optional(),
  logLevel: z.enum(["debug", "info", "warn", "error"]).default("info")
});

export type Config = z.infer<typeof ConfigSchema>;

export interface TradeSignal {
  action: "buy" | "sell" | "hold";
  reason: string;
}

export interface TradingLoopOptions {
  dryRun?: boolean;
  tickIntervalMs?: number;
  amount?: string;
  onTick?: (tick: TickResult) => void;
  onTrade?: (trade: TradeResult) => void;
  onError?: (error: Error) => void;
}

export interface TickResult {
  timestamp: Date;
  price: number;
  signal: TradeSignal;
  actionTaken: boolean;
}

export interface TradeResult {
  timestamp: Date;
  type: "buy" | "sell";
  amountIn: string;
  amountOut?: string;
  txHash?: string;
  attestationTxHash?: string;
  status: "pending" | "confirmed" | "failed";
  error?: string;
}

export interface BalanceInfo {
  chain: "kite" | "monad";
  symbol: string;
  balance: string;
  decimals: number;
}

export interface X402Payment {
  paymentToken: string;
  payerAddr: string;
  payeeAddr: string;
  amount: string;
  tokenType: string;
}
