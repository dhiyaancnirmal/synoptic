import chalk from "chalk";
import ora from "ora";
import { loadWallet } from "../wallet.js";
import { loadSession } from "../session.js";
import { resolveConfig } from "../config.js";
import { runTradingLoop } from "../trading-loop.js";
import { checkMcpAvailable, createMcpClient, KITE_MCP_SETUP_INSTRUCTIONS } from "../kite-mcp.js";
import { printHeader, printError } from "../utils/formatting.js";

export interface StartOptions {
  dryRun?: boolean;
  amount?: string;
  tickInterval?: number;
}

export async function startCommand(options: StartOptions = {}): Promise<void> {
  printHeader("Synoptic Agent Trading Loop");

  const spinner = ora("Initializing...").start();

  const wallet = loadWallet();
  if (!wallet) {
    spinner.fail("No wallet found");
    console.log("");
    printError("Run `npx @synoptic/agent setup` first");
    process.exit(1);
  }

  const session = loadSession();
  if (!session) {
    spinner.fail("No session found");
    console.log("");
    printError("Run `npx @synoptic/agent setup` first");
    process.exit(1);
  }

  spinner.text = "Checking MCP configuration...";

  if (!checkMcpAvailable()) {
    spinner.fail("Kite MCP not configured");
    console.log("");
    console.log(KITE_MCP_SETUP_INSTRUCTIONS);
    process.exit(1);
  }

  const mcpClient = createMcpClient();
  if (!mcpClient) {
    spinner.fail("Kite MCP not configured");
    console.log("");
    console.log(KITE_MCP_SETUP_INSTRUCTIONS);
    process.exit(1);
  }

  spinner.text = "Loading configuration...";

  const config = resolveConfig({
    defaultAmount: options.amount,
    tickIntervalMs: options.tickInterval
  });

  spinner.succeed("Ready to start");
  console.log("");

  const cleanup = () => {
    console.log("");
    console.log(chalk.dim("Trading loop stopped"));
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  try {
    await runTradingLoop(config, {
      dryRun: options.dryRun,
      amount: options.amount,
      mcpClient
    });
  } catch (error) {
    console.log("");
    printError(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
