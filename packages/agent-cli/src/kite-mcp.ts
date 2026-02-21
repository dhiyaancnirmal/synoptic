import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import logger from "./logger.js";

export const KITE_MCP_URL = "https://neo.dev.gokite.ai/v1/mcp";

export const KITE_MCP_SETUP_INSTRUCTIONS = `
╔═══════════════════════════════════════════════════════════════════════════╗
║                       KITE MCP SETUP REQUIRED                             ║
╠═══════════════════════════════════════════════════════════════════════════╣
║                                                                           ║
║  x402 payments require a Kite Passport MCP connection.                    ║
║                                                                           ║
║  IMPORTANT: 'synoptic-agent start' runs in a separate Node process.       ║
║  It cannot reuse Cursor/Claude/OpenCode MCP login sessions.               ║
║                                                                           ║
║  Required env for standalone CLI loop:                                    ║
║    export KITE_MCP_BEARER_TOKEN="<token>"                                 ║
║    # or export KITE_MCP_AUTHORIZATION="Bearer <token>"                    ║
║                                                                           ║
║  Optional:                                                                 ║
║    export KITE_MCP_CLIENT_ID="<client id>"                                ║
║                                                                           ║
║  If you only have MCP access inside Cursor/Claude, run the strategy       ║
║  through your AI agent instead of the standalone CLI loop.                ║
╚═══════════════════════════════════════════════════════════════════════════╝
`;

export const KITE_FAUCET_URL = "https://faucet.gokite.ai";
export const MONAD_FAUCET_URL = "https://testnet.monad.xyz/faucet";

function resolveAuthorizationHeader(): string | null {
  const explicitHeader = process.env.KITE_MCP_AUTHORIZATION?.trim();
  if (explicitHeader) {
    return explicitHeader;
  }

  const bearerToken = process.env.KITE_MCP_BEARER_TOKEN?.trim();
  if (bearerToken) {
    return `Bearer ${bearerToken}`;
  }

  return null;
}

export function checkMcpAvailable(): boolean {
  if (process.env.SYNOPTIC_SKIP_MCP_CHECK === "true") {
    return true;
  }

  if (resolveAuthorizationHeader()) {
    return true;
  }

  if (
    process.env.SYNOPTIC_ALLOW_CLIENT_ID_ONLY_MCP === "true" &&
    process.env.KITE_MCP_CLIENT_ID
  ) {
    return true;
  }

  return false;
}

export function getMcpStatus(): { available: boolean; instructions: string } {
  const available = checkMcpAvailable();
  return {
    available,
    instructions: available ? "" : KITE_MCP_SETUP_INSTRUCTIONS
  };
}

export interface KiteMcpClient {
  getPayerAddr(): Promise<string>;
  approvePayment(params: {
    payerAddr: string;
    payeeAddr: string;
    amount: string;
    tokenType: string;
    merchantName?: string;
  }): Promise<{ paymentToken: string }>;
}

let _sdkClient: Client | null = null;

function normalizeMcpError(error: unknown): Error {
  const fallback = error instanceof Error ? error : new Error(String(error));
  const message = fallback.message ?? String(error);
  const isAuthFailure =
    message.includes("invalid_token") || message.includes("Missing or invalid authorization header");
  if (!isAuthFailure) {
    return fallback;
  }

  return new Error(
    "Kite MCP rejected standalone CLI auth (invalid_token). This process cannot reuse Cursor MCP login. Set KITE_MCP_BEARER_TOKEN (or KITE_MCP_AUTHORIZATION) and retry."
  );
}

async function getSdkClient(): Promise<Client> {
  if (_sdkClient) return _sdkClient;

  const clientId = process.env.KITE_MCP_CLIENT_ID?.trim();
  const authorization = resolveAuthorizationHeader();
  const mcpUrl = process.env.KITE_MCP_URL ?? KITE_MCP_URL;
  const allowClientIdOnly = process.env.SYNOPTIC_ALLOW_CLIENT_ID_ONLY_MCP === "true";

  if (!authorization && !(allowClientIdOnly && clientId)) {
    throw new Error(`Kite MCP not configured. ${KITE_MCP_SETUP_INSTRUCTIONS}`);
  }

  logger.info("Connecting to Kite MCP", { url: mcpUrl });

  const headers: Record<string, string> = {};
  if (clientId) {
    headers["CLIENT_ID"] = clientId;
  }
  if (authorization) {
    headers.Authorization = authorization;
  }

  const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), {
    requestInit: {
      headers
    }
  });

  const client = new Client(
    { name: "synoptic-agent", version: "0.1.0" },
    { capabilities: {} }
  );

  await client.connect(transport);
  _sdkClient = client;

  logger.info("Connected to Kite MCP");
  return client;
}

function extractTextFromToolResult(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const content = result.content as Array<{ type: string; text?: string }> | undefined;
  if (!content || !Array.isArray(content)) return "";
  const textPart = content.find((c) => c.type === "text");
  return textPart?.text ?? "";
}

async function callKiteTool(
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  try {
    const client = await getSdkClient();
    const result = await client.callTool({ name, arguments: args });
    return extractTextFromToolResult(result);
  } catch (error) {
    throw normalizeMcpError(error);
  }
}

export function createMcpClient(): KiteMcpClient | null {
  if (!checkMcpAvailable()) {
    return null;
  }

  return {
    async getPayerAddr(): Promise<string> {
      const text = await callKiteTool("get_payer_addr", {});

      // Response may be JSON like { address: "0x..." } or a plain address
      try {
        const parsed = JSON.parse(text) as Record<string, unknown>;
        if (typeof parsed.address === "string") return parsed.address;
        if (typeof parsed.payer_addr === "string") return parsed.payer_addr;
      } catch {
        // Not JSON — try as plain text
      }

      if (text.startsWith("0x")) return text.trim();
      throw new Error(`Unexpected get_payer_addr response: ${text}`);
    },

    async approvePayment(params): Promise<{ paymentToken: string }> {
      const text = await callKiteTool("approve_payment", {
        payer_addr: params.payerAddr,
        payee_addr: params.payeeAddr,
        amount: params.amount,
        token_type: params.tokenType,
        merchant_name: params.merchantName ?? "Synoptic Oracle"
      });

      try {
        const parsed = JSON.parse(text) as Record<string, unknown>;
        const token =
          (typeof parsed.paymentToken === "string" ? parsed.paymentToken : null) ??
          (typeof parsed.payment_token === "string" ? parsed.payment_token : null) ??
          (typeof parsed.token === "string" ? parsed.token : null) ??
          (typeof parsed.x_payment === "string" ? parsed.x_payment : null);
        if (token) return { paymentToken: token };
      } catch {
        // Not JSON — use raw text
      }

      if (text.length > 0) return { paymentToken: text.trim() };
      throw new Error(`Unexpected approve_payment response: ${text}`);
    }
  };
}

export function formatMcpInstructions(): string {
  return KITE_MCP_SETUP_INSTRUCTIONS;
}
