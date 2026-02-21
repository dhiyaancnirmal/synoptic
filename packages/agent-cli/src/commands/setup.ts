import chalk from "chalk";
import ora from "ora";
import { Wallet } from "ethers";
import { resolveConfig } from "../config.js";
import { createApiClient } from "../api-client.js";
import {
  checkMcpAvailable,
  createMcpClient,
  formatMcpInstructions,
  KITE_MCP_SETUP_INSTRUCTIONS
} from "../kite-mcp.js";
import {
  generateWallet,
  getWalletPath,
  loadWallet
} from "../wallet.js";
import { getSessionPath, saveSession } from "../session.js";
import {
  printError,
  printHeader,
  printInfo,
  printSuccess,
  printWarning
} from "../utils/formatting.js";

function ensureWallet(): { wallet: ReturnType<typeof generateWallet>; created: boolean } {
  const existing = loadWallet();
  if (existing) {
    return { wallet: existing, created: false };
  }
  return { wallet: generateWallet(), created: true };
}

export async function setupCommand(): Promise<void> {
  printHeader("Synoptic Agent Setup");

  const spinner = ora("Preparing local wallet and session...").start();

  try {
    const { wallet, created } = ensureWallet();
    spinner.text = created
      ? "Wallet created. Performing wallet challenge auth..."
      : "Wallet found. Performing wallet challenge auth...";

    const config = resolveConfig();
    const mcpConfigured = checkMcpAvailable();
    const mcpClient = createMcpClient();

    const apiClient = createApiClient(config, mcpClient, { useSession: false });
    const challenge = await apiClient.createWalletChallenge({ ownerAddress: wallet.address });

    const signer = new Wallet(wallet.privateKey);
    const signature = await signer.signMessage(challenge.message);

    const verified = await apiClient.verifyWalletChallenge({
      challengeId: challenge.challengeId,
      message: challenge.message,
      signature,
      ownerAddress: challenge.ownerAddress,
      agentId: challenge.agentId
    });

    const accessToken = verified.accessToken ?? verified.token ?? "";
    if (!accessToken || !verified.refreshToken) {
      throw new Error("wallet verify did not return access and refresh tokens");
    }

    let linkedPayerAddress: string | undefined;
    let identityLinked = false;
    let readinessError: string | undefined;

    const baseReadiness = {
      walletReady: true,
      mcpReady: mcpConfigured,
      identityLinked: false,
      checkedAt: new Date().toISOString(),
      ...(readinessError ? { lastError: readinessError } : {})
    };

    saveSession({
      accessToken,
      refreshToken: verified.refreshToken,
      accessExpiresAt: verified.expiresAt,
      refreshExpiresAt: verified.refreshExpiresAt,
      agentId: verified.agentId,
      ownerAddress: verified.ownerAddress,
      readiness: baseReadiness
    });

    if (mcpClient) {
      try {
        spinner.text = "Linking payer identity using Kite MCP...";
        linkedPayerAddress = await mcpClient.getPayerAddr();

        const authClient = createApiClient(config, mcpClient, { useSession: true });
        await authClient.linkIdentity(linkedPayerAddress);
        identityLinked = true;
      } catch (error) {
        readinessError = error instanceof Error ? error.message : String(error);
      }
    } else {
      readinessError = "Kite MCP unavailable for payer link";
    }

    saveSession({
      accessToken,
      refreshToken: verified.refreshToken,
      accessExpiresAt: verified.expiresAt,
      refreshExpiresAt: verified.refreshExpiresAt,
      agentId: verified.agentId,
      ownerAddress: verified.ownerAddress,
      linkedPayerAddress,
      readiness: {
        walletReady: true,
        mcpReady: mcpConfigured,
        identityLinked,
        checkedAt: new Date().toISOString(),
        ...(readinessError ? { lastError: readinessError } : {})
      }
    });

    spinner.succeed(identityLinked ? "Setup complete" : "Setup complete with warnings");
    console.log("");
    printSuccess("Synoptic agent is configured and session is persisted");
    console.log("");
    console.log(`  ${chalk.dim("Wallet:")} ${chalk.green(wallet.address)}`);
    console.log(`  ${chalk.dim("Wallet file:")} ${chalk.dim(getWalletPath())}`);
    console.log(`  ${chalk.dim("Session file:")} ${chalk.dim(getSessionPath())}`);
    console.log(`  ${chalk.dim("Agent ID:")} ${chalk.green(verified.agentId)}`);
    console.log(`  ${chalk.dim("Owner:")} ${chalk.green(verified.ownerAddress)}`);
    console.log(`  ${chalk.dim("Payer:")} ${chalk.green(linkedPayerAddress ?? "not linked")}`);
    console.log(
      `  ${chalk.dim("Readiness:")} ${identityLinked ? chalk.green("ready") : chalk.yellow("ready_with_warnings")}`
    );
    console.log("");

    if (!mcpConfigured) {
      printWarning("Kite MCP is not configured, so identity link is pending.");
      console.log("");
      console.log(KITE_MCP_SETUP_INSTRUCTIONS);
      console.log("");
    } else if (!identityLinked) {
      printWarning("MCP was detected but identity link did not complete.");
      if (readinessError) {
        printInfo(`link error: ${readinessError}`);
      }
      console.log("");
      printInfo(formatMcpInstructions());
      console.log("");
    }

    printInfo("Next: run `npx @synoptic/agent status` then `npx @synoptic/agent start`.");
    console.log("");
  } catch (error) {
    spinner.fail("Setup failed");
    printError(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
