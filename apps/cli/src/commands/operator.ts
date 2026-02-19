import type { Command } from "commander";

export function registerOperatorCommands(program: Command): void {
  const operator = program.command("operator").description("Operator command group");

  operator.command("init").description("Initialize operator workspace").action(() => {
    console.log("operator init: scaffold placeholder");
  });

  const operatorAgent = operator.command("agent").description("Operator agent management commands");

  operatorAgent.command("create").description("Create an agent").action(() => {
    console.log("operator agent create: scaffold placeholder");
  });

  operatorAgent.command("list").description("List agents").action(() => {
    console.log("operator agent list: scaffold placeholder");
  });

  operator
    .command("monitor")
    .description("Monitor an agent")
    .requiredOption("--agent <id>", "Agent ID")
    .action((opts: { agent: string }) => {
      console.log(`operator monitor --agent ${opts.agent}: scaffold placeholder`);
    });
}
