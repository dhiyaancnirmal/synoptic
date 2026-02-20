export interface PassportHealth {
  ok: boolean;
  details?: string;
}

interface JsonRpcResponse {
  result?: string;
  error?: { message?: string };
}

export async function verifyPassport(
  kiteRpcUrl: string = process.env.KITE_RPC_URL ?? process.env.KITE_TESTNET_RPC ?? "https://rpc-testnet.gokite.ai/"
): Promise<PassportHealth> {
  try {
    const response = await fetch(kiteRpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_chainId",
        params: []
      })
    });

    if (!response.ok) {
      return { ok: false, details: `kite_rpc_http_${response.status}` };
    }

    const payload = (await response.json()) as JsonRpcResponse;
    const chainIdHex = payload.result;
    if (!chainIdHex) {
      return { ok: false, details: payload.error?.message ?? "kite_rpc_missing_chain_id" };
    }

    const chainId = Number.parseInt(chainIdHex, 16);
    if (chainId !== 2368) {
      return { ok: false, details: `kite_chain_mismatch_${chainId}` };
    }

    return { ok: true };
  } catch (error) {
    return { ok: false, details: error instanceof Error ? error.message : "kite_rpc_unreachable" };
  }
}
