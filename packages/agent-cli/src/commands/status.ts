import chalk from "chalk";
import ora from "ora";
import { JsonRpcProvider, formatEther } from "ethers";
import { loadWallet, getWalletPath, getLogsDir } from "../wallet.js";
import { resolveConfig } from "../config.js";
import { createApiClient } from "../api-client.js";
import { loadSession } from "../session.js";
import { printHeader, printError, formatAddress } from "../utils/formatting.js";

export async function statusCommand(): Promise<void> {
  printHeader("Synoptic Agent Status");

  const spinner = ora("Loading wallet...").start();

  const wallet = loadWallet();
  if (!wallet) {
    spinner.fail("No wallet found");
    console.log("");
    printError("Run `npx @synoptic/agent init` first");
    process.exit(1);
  }

  spinner.succeed("Wallet loaded");
  console.log("");

  console.log(`  ${chalk.dim("Address:")} ${chalk.green(wallet.address)}`);
  console.log(`  ${chalk.dim("Created:")} ${wallet.createdAt}`);
  console.log(`  ${chalk.dim("Storage:")} ${getWalletPath()}`);
  console.log("");

  console.log(chalk.bold("  Balances:"));
  console.log("");

  const kiteSpinner = ora("Checking Kite balance...").start();
  try {
    const kiteProvider = new JsonRpcProvider(wallet.chains.kite.rpc);
    const kiteBalance = await kiteProvider.getBalance(wallet.address);
    kiteSpinner.succeed(`  Kite:   ${chalk.cyan(formatEther(kiteBalance))} KITE`);
  } catch {
    kiteSpinner.fail("  Kite:   Unable to fetch");
  }

  const monadSpinner = ora("Checking Monad balance...").start();
  try {
    const monadProvider = new JsonRpcProvider(wallet.chains.monad.rpc);
    const monadBalance = await monadProvider.getBalance(wallet.address);
    monadSpinner.succeed(`  Monad:  ${chalk.cyan(formatEther(monadBalance))} MON`);
  } catch {
    monadSpinner.fail("  Monad:  Unable to fetch");
  }

  console.log("");

  const config = resolveConfig();
  const apiClient = createApiClient(config);

  console.log(chalk.bold("  API Status:"));
  console.log("");

  const healthSpinner = ora("Checking API health...").start();
  try {
    const health = await apiClient.getHealth() as {
      status: string;
      service: string;
      timestamp: string;
      dependencies: Record<string, string>;
      payment?: {
        mode: string;
        verifyReachable: string;
        settleReachable: string;
        lastCheckedAt?: string;
      };
    };
    healthSpinner.succeed(`  Status: ${chalk.green(health.status)}`);
    console.log(`  ${chalk.dim("Service:")} ${health.service}`);
    console.log(`  ${chalk.dim("URL:")} ${config.apiUrl}`);
    if (health.payment) {
      console.log(
        `  ${chalk.dim("Payment:")} ${health.payment.mode} | verify=${health.payment.verifyReachable} settle=${health.payment.settleReachable}`
      );
    }
  } catch {
    healthSpinner.fail("  API: Unable to connect");
  }

  console.log("");
  const session = loadSession();
  if (session) {
    console.log(chalk.bold("  Setup Readiness:"));
    console.log("");
    console.log(`  ${chalk.dim("Agent:")} ${session.agentId}`);
    console.log(`  ${chalk.dim("Owner:")} ${formatAddress(session.ownerAddress)}`);
    console.log(
      `  ${chalk.dim("Identity:")} ${session.linkedPayerAddress ? chalk.green("linked") : chalk.yellow("warning")}`
    );
    if (session.linkedPayerAddress) {
      console.log(`  ${chalk.dim("Payer:")} ${formatAddress(session.linkedPayerAddress)}`);
    }
    if (session.readiness?.lastError) {
      console.log(`  ${chalk.dim("Last warning:")} ${session.readiness.lastError}`);
    }
    console.log("");
  }

  console.log("");

  console.log(chalk.bold("  Recent Trades:"));
  console.log("");

  const tradesSpinner = ora("Fetching trades...").start();
  try {
    const { trades } = await apiClient.getTrades();
    tradesSpinner.succeed(`  Found ${trades.length} trades`);

    if (trades.length > 0) {
      console.log("");
      for (const trade of trades.slice(0, 5)) {
        const status = trade.status === "confirmed" ? chalk.green("✓") : chalk.yellow("○");
        console.log(
          `    ${status} ${trade.tokenIn} → ${trade.tokenOut} | ${trade.amountIn} | ${trade.createdAt}`
        );
        if (trade.executionTxHash) {
          console.log(`      ${chalk.dim("Tx:")} ${formatAddress(trade.executionTxHash)}`);
        }
      }
    }
  } catch {
    tradesSpinner.fail("  Unable to fetch trades");
  }

  console.log("");

  console.log(chalk.bold("  Logs:"));
  console.log("");
  console.log(`  ${chalk.dim("Directory:")} ${getLogsDir()}`);
  console.log("");
}
