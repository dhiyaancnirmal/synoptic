import ora from "ora";
import { Wallet } from "ethers";
import { resolveConfig } from "../config.js";
import { createApiClient } from "../api-client.js";
import { createMcpClient } from "../kite-mcp.js";
import { generateWallet, loadWallet } from "../wallet.js";
import { loadSession, saveSession, type AgentSession } from "../session.js";
import { printHeader, printInfo, printWarning } from "../utils/formatting.js";

function persistSession(input: {
  accessToken: string;
  refreshToken: string;
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
  agentId: string;
  ownerAddress: string;
  linkedPayerAddress?: string;
  lastError?: string;
}): void {
  const now = Date.now();
  const session: AgentSession = {
    accessToken: input.accessToken,
    refreshToken: input.refreshToken,
    accessExpiresAt: new Date(now + input.accessTtlSeconds * 1000).toISOString(),
    refreshExpiresAt: new Date(now + input.refreshTtlSeconds * 1000).toISOString(),
    agentId: input.agentId,
    ownerAddress: input.ownerAddress,
    linkedPayerAddress: input.linkedPayerAddress,
    readiness: {
      wallet: "ok",
      auth: "ok",
      identity: input.linkedPayerAddress ? "linked" : "warning",
      lastError: input.lastError
    }
  };
  saveSession(session);
}

export async function setupCommand(): Promise<void> {
  printHeader("Synoptic Agent Setup");
  const spinner = ora("Loading wallet...").start();
  const wallet = loadWallet() ?? generateWallet();
  spinner.succeed(`Wallet ready: ${wallet.address}`);

  const config = resolveConfig();
  const api = createApiClient(config);
  const challengeSpinner = ora("Requesting wallet challenge...").start();
  const challenge = await api.walletChallenge({ ownerAddress: wallet.address.toLowerCase() });
  challengeSpinner.succeed("Challenge received");

  const signatureSpinner = ora("Signing challenge...").start();
  const signer = new Wallet(wallet.privateKey);
  const signature = await signer.signMessage(challenge.message);
  signatureSpinner.succeed("Challenge signed");

  const verifySpinner = ora("Verifying session...").start();
  const session = await api.walletVerify({
    challengeId: challenge.challengeId,
    message: challenge.message,
    signature
  });
  verifySpinner.succeed("Session issued");

  let linkedPayerAddress: string | undefined;
  let lastError: string | undefined;
  const mcp = createMcpClient();
  if (mcp) {
    const linkSpinner = ora("Linking payer identity...").start();
    try {
      const payer = await mcp.getPayerAddr();
      const linked = await api.linkIdentityPayer(payer);
      linkedPayerAddress = linked.linkedPayerAddress;
      linkSpinner.succeed(`Payer linked: ${linkedPayerAddress}`);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      linkSpinner.warn("Payer link unavailable; continuing with warnings");
    }
  } else {
    lastError = "MCP unavailable";
    printWarning("Kite MCP unavailable; skipping payer link.");
  }

  persistSession({
    ...session,
    linkedPayerAddress,
    lastError
  });

  const existing = loadSession();
  printInfo(
    existing?.readiness?.identity === "linked"
      ? "Setup complete: ready"
      : "Setup complete: ready_with_warnings"
  );
}

