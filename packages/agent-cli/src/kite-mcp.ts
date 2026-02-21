import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import logger from "./logger.js";

export const KITE_MCP_URL = "https://neo.dev.gokite.ai/v1/mcp";

export const KITE_MCP_SETUP_INSTRUCTIONS = `
╔═══════════════════════════════════════════════════════════════════════════╗
║                       KITE MCP SETUP REQUIRED                             ║
╠═══════════════════════════════════════════════════════════════════════════╣
║                                                                           ║
║  x402 payments require Kite Passport MCP connection.                      ║
║                                                                           ║
║  FOR CURSOR (~/.cursor/mcp.json):                                         ║
║  {                                                                        ║
║    "mcpServers": {                                                        ║
║      "kite-passport": {                                                   ║
║        "url": "${KITE_MCP_URL}"                  ║
║      }                                                                    ║
║    }                                                                      ║
║  }                                                                        ║
║                                                                           ║
║  FOR CLAUDE DESKTOP:                                                      ║
║  ~/Library/Application Support/Claude/claude_desktop_config.json          ║
║  (Same JSON structure as above)                                           ║
║                                                                           ║
║  FOR OPENCODE (~/.config/opencode/mcp.json):                              ║
║  (Same JSON structure as above)                                           ║
║                                                                           ║
║  OR set KITE_MCP_CLIENT_ID env var for headless operation.                ║
║                                                                           ║
║  After configuring, restart your AI agent and try again.                  ║
╚═══════════════════════════════════════════════════════════════════════════╝
`;

export const KITE_FAUCET_URL = "https://faucet.gokite.ai";
export const MONAD_FAUCET_URL = "https://testnet.monad.xyz/faucet";

export function checkMcpAvailable(): boolean {
  if (process.env.SYNOPTIC_SKIP_MCP_CHECK === "true") {
    return true;
  }

  if (process.env.KITE_MCP_CLIENT_ID) {
    return true;
  }

  const mcpHint = process.env.MCP_SERVERS || process.env.CURSOR_MCP || "";
  if (mcpHint.includes("kite") || mcpHint.includes("gokite")) {
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

async function getSdkClient(): Promise<Client> {
  if (_sdkClient) return _sdkClient;

  const clientId =
    process.env.KITE_MCP_CLIENT_ID ?? "client_agent_M8Z7lTUmSNB3JK3ms8JTABOh";

  const mcpUrl = process.env.KITE_MCP_URL ?? KITE_MCP_URL;

  logger.info("Connecting to Kite MCP", { url: mcpUrl });

  const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), {
    requestInit: {
      headers: {
        "CLIENT_ID": clientId
      }
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

export function createMcpClient(): KiteMcpClient | null {
  if (!checkMcpAvailable()) {
    return null;
  }

  return {
    async getPayerAddr(): Promise<string> {
      const client = await getSdkClient();
      const result = await client.callTool({ name: "get_payer_addr", arguments: {} });
      const text = extractTextFromToolResult(result);

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
      const client = await getSdkClient();
      const result = await client.callTool({
        name: "approve_payment",
        arguments: {
          payer_addr: params.payerAddr,
          payee_addr: params.payeeAddr,
          amount: params.amount,
          token_type: params.tokenType,
          merchant_name: params.merchantName ?? "Synoptic Oracle"
        }
      });
      const text = extractTextFromToolResult(result);

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
