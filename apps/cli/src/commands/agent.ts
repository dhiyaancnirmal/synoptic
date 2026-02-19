import type { Command } from "commander";

export function registerAgentCommands(program: Command): void {
  const agent = program.command("agent").description("Agent command group");

  agent
    .command("once")
    .requiredOption("--agent <id>", "Agent ID")
    .requiredOption("--strategy <name>", "Strategy name")
    .action((opts: { agent: string; strategy: string }) => {
      console.log(`agent once --agent ${opts.agent} --strategy ${opts.strategy}: scaffold placeholder`);
    });

  agent
    .command("run")
    .requiredOption("--agent <id>", "Agent ID")
    .requiredOption("--interval <duration>", "Execution interval")
    .requiredOption("--strategy <name>", "Strategy name")
    .action((opts: { agent: string; interval: string; strategy: string }) => {
      console.log(
        `agent run --agent ${opts.agent} --interval ${opts.interval} --strategy ${opts.strategy}: scaffold placeholder`
      );
    });

  agent
    .command("stop")
    .requiredOption("--agent <id>", "Agent ID")
    .action((opts: { agent: string }) => {
      console.log(`agent stop --agent ${opts.agent}: scaffold placeholder`);
    });
}
