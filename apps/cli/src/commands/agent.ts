import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Command } from "commander";
import { executeStrategyOnce } from "../api.js";

const RUNTIME_DIR = join(process.cwd(), ".synoptic-runtime");

async function runtimeFile(agentId: string): Promise<string> {
  await mkdir(RUNTIME_DIR, { recursive: true });
  return join(RUNTIME_DIR, `${agentId}.json`);
}

function parseIntervalMs(interval: string): number {
  const pattern = /^(\d+)(ms|s|m|h)$/i;
  const match = interval.match(pattern);
  if (!match) {
    throw new Error("Interval must use format like 500ms, 10s, 5m, 1h");
  }

  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multiplier: Record<string, number> = { ms: 1, s: 1_000, m: 60_000, h: 3_600_000 };
  return value * multiplier[unit];
}

export function registerAgentCommands(program: Command): void {
  const agent = program.command("agent").description("Agent command group");

  agent
    .command("once")
    .requiredOption("--agent <id>", "Agent ID")
    .requiredOption("--strategy <name>", "Strategy name")
    .action(async (opts: { agent: string; strategy: string }) => {
      const result = await executeStrategyOnce({
        agentId: opts.agent,
        strategy: opts.strategy
      });
      console.log(JSON.stringify(result, null, 2));
    });

  agent
    .command("run")
    .requiredOption("--agent <id>", "Agent ID")
    .requiredOption("--interval <duration>", "Execution interval")
    .requiredOption("--strategy <name>", "Strategy name")
    .action(async (opts: { agent: string; interval: string; strategy: string }) => {
      const intervalMs = parseIntervalMs(opts.interval);
      const statePath = await runtimeFile(opts.agent);

      await writeFile(
        statePath,
        JSON.stringify(
          {
            pid: process.pid,
            startedAt: new Date().toISOString(),
            interval: opts.interval,
            strategy: opts.strategy
          },
          null,
          2
        )
      );

      let keepRunning = true;
      const stop = async (): Promise<void> => {
        keepRunning = false;
        await rm(statePath, { force: true });
      };

      process.on("SIGINT", () => {
        void stop().then(() => process.exit(0));
      });
      process.on("SIGTERM", () => {
        void stop().then(() => process.exit(0));
      });

      console.log(`agent run started (agent=${opts.agent}, strategy=${opts.strategy}, interval=${opts.interval})`);

      while (keepRunning) {
        const result = await executeStrategyOnce({
          agentId: opts.agent,
          strategy: opts.strategy
        });
        console.log(JSON.stringify(result, null, 2));
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    });

  agent
    .command("stop")
    .requiredOption("--agent <id>", "Agent ID")
    .action(async (opts: { agent: string }) => {
      const statePath = await runtimeFile(opts.agent);
      const stateRaw = await readFile(statePath, "utf-8").catch(() => null);

      if (!stateRaw) {
        console.log(`No running process found for agent ${opts.agent}`);
        return;
      }

      const state = JSON.parse(stateRaw) as { pid?: number };
      if (state.pid) {
        try {
          process.kill(state.pid, "SIGTERM");
        } catch {
          // process may already be dead
        }
      }

      await rm(statePath, { force: true });
      console.log(`Stopped agent runtime for ${opts.agent}`);
    });
}
