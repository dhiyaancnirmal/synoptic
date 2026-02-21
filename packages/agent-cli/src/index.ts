#!/usr/bin/env node
import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { fundCommand } from "./commands/fund.js";
import { startCommand } from "./commands/start.js";
import { setupCommand } from "./commands/setup.js";
import { statusCommand } from "./commands/status.js";
import { exportKeyCommand } from "./commands/export-key.js";
import { deployKeyCommand } from "./commands/deploy-key.js";
import { deployContractCommand } from "./commands/deploy-contract.js";
import { resolveConfig } from "./config.js";
import chalk from "chalk";

const VERSION = "0.1.0";

const program = new Command();

program
  .name("synoptic-agent")
  .description("Autonomous agent CLI for Synoptic - x402 payments and trading")
  .version(VERSION);

program
  .command("init")
  .description("Initialize a new agent wallet")
  .option("-f, --force", "Overwrite existing wallet (warning: will lose existing key)")
  .action(async (options) => {
    await initCommand({ force: options.force });
  });

program
  .command("fund")
  .description("Check wallet funding status and show faucet links")
  .option("-w, --watch", "Watch for incoming funds")
  .action(async (options) => {
    await fundCommand({ watch: options.watch });
  });

program
  .command("start")
  .description("Start autonomous trading loop")
  .option("-d, --dry-run", "Run without executing actual trades")
  .option("-a, --amount <amount>", "Trade amount (default: 0.01)")
  .option("-t, --tick-interval <ms>", "Tick interval in milliseconds (default: 30000)", parseInt)
  .action(async (options) => {
    await startCommand({
      dryRun: options.dryRun,
      amount: options.amount,
      tickInterval: options.tickInterval
    });
  });

program
  .command("setup")
  .description("Run wallet auth + session bootstrap and optional payer linking")
  .action(async () => {
    await setupCommand();
  });

program
  .command("status")
  .description("Show wallet and trading status")
  .action(async () => {
    await statusCommand();
  });

program
  .command("export-key")
  .description("Export wallet private key (requires confirmation)")
  .option("-y, --yes", "Skip confirmation prompt")
  .action(async (options) => {
    await exportKeyCommand({ yes: options.yes });
  });

program
  .command("deploy-key")
  .description("Push wallet private key to Railway as AGENT_PRIVATE_KEY")
  .option("-s, --service <name>", "Target a specific Railway service")
  .option("-y, --yes", "Skip confirmation")
  .action(async (options) => {
    await deployKeyCommand({ service: options.service, yes: options.yes });
  });

program
  .command("deploy-contract")
  .description("Deploy ServiceRegistry contract to Kite testnet")
  .option("--railway", "Push SERVICE_REGISTRY_ADDRESS to Railway after deploy")
  .option("-s, --service <name>", "Target a specific Railway service (with --railway)")
  .action(async (options) => {
    await deployContractCommand({ railway: options.railway, service: options.service });
  });

program
  .command("config")
  .description("Show current configuration")
  .action(() => {
    const config = resolveConfig();
    console.log("");
    console.log(chalk.bold("Current Configuration:"));
    console.log("");
    for (const [key, value] of Object.entries(config)) {
      console.log(`  ${chalk.dim(key)}: ${chalk.white(String(value))}`);
    }
    console.log("");
    console.log(
      chalk.dim("Precedence: CLI flags > Environment variables > Config file > Defaults")
    );
    console.log("");
  });

program.parse();
