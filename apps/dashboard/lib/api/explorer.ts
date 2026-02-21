/**
 * Explorer chain resolution. Defaults: Kite + Monad.
 * `sepolia` is retained as a deprecated compatibility shim for legacy payloads/links.
 */
export type ExplorerChain = "kite-testnet" | "monad" | "monad-testnet" | "sepolia" | (string & {});

function normalizeChain(value?: string): ExplorerChain | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (normalized === "kite" || normalized === "kite-testnet") return "kite-testnet";
  if (normalized === "monad") return "monad";
  if (normalized === "monad-testnet") return "monad-testnet";
  if (normalized === "sepolia") return "sepolia";
  return normalized as ExplorerChain;
}

function explorerBaseUrl(chain: ExplorerChain): string {
  if (chain === "kite-testnet") return process.env.NEXT_PUBLIC_KITE_EXPLORER_URL ?? "";
  if (chain === "monad") return process.env.NEXT_PUBLIC_MONAD_EXPLORER_URL ?? "https://monadexplorer.com";
  if (chain === "monad-testnet") {
    return process.env.NEXT_PUBLIC_MONAD_TESTNET_EXPLORER_URL ?? "https://testnet.monadexplorer.com";
  }
  if (chain === "sepolia") return process.env.NEXT_PUBLIC_SEPOLIA_EXPLORER_URL ?? "";
  return process.env.NEXT_PUBLIC_EXPLORER_URL ?? "";
}

function chainFromId(chainId?: number): ExplorerChain | undefined {
  if (chainId === 2368) return "kite-testnet";
  if (chainId === 143) return "monad";
  if (chainId === 10143) return "monad-testnet";
  return undefined;
}

export function resolveChainLabel(input?: { chain?: string; chainId?: number }): string {
  const chain = normalizeChain(input?.chain) ?? chainFromId(input?.chainId);
  if (chain) return chain;
  if (typeof input?.chainId === "number") return `chain-${input.chainId}`;
  return "unknown";
}

export function buildExplorerTxUrl(input: {
  txHash?: string;
  chain?: string;
  chainId?: number;
}): string | null {
  const txHash = input.txHash?.trim();
  if (!txHash) return null;

  const chain = normalizeChain(input.chain) ?? chainFromId(input.chainId);
  if (!chain) return null;

  const baseUrl = explorerBaseUrl(chain).trim().replace(/\/+$/, "");
  if (!baseUrl) return null;

  return `${baseUrl}/tx/${txHash}`;
}

export function buildExplorerAddressUrl(input: {
  address?: string;
  chain?: string;
  chainId?: number;
}): string | null {
  const address = input.address?.trim();
  if (!address) return null;

  const chain = normalizeChain(input.chain) ?? chainFromId(input.chainId);
  if (!chain) return null;

  const baseUrl = explorerBaseUrl(chain).trim().replace(/\/+$/, "");
  if (!baseUrl) return null;

  return `${baseUrl}/address/${address}`;
}
