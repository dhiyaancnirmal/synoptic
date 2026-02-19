import type { Command } from "commander";
import { createAgent, listAgents, monitorAgent } from "../api.js";

export function registerOperatorCommands(program: Command): void {
  const operator = program.command("operator").description("Operator command group");

  operator.command("init").description("Initialize operator workspace").action(() => {
    console.log("operator init: configuration loaded");
  });

  const operatorAgent = operator.command("agent").description("Operator agent management commands");

  operatorAgent
    .command("create")
    .description("Create an agent")
    .requiredOption("--owner <address>", "Owner address")
    .action(async (opts: { owner: string }) => {
      const response = await createAgent(opts.owner);
      console.log(JSON.stringify(response, null, 2));
    });

  operatorAgent
    .command("list")
    .description("List agents")
    .action(async () => {
      const response = await listAgents();
      console.log(JSON.stringify(response, null, 2));
    });

  operator
    .command("monitor")
    .description("Monitor an agent")
    .requiredOption("--agent <id>", "Agent ID")
    .action(async (opts: { agent: string }) => {
      const response = await monitorAgent(opts.agent);
      console.log(JSON.stringify(response, null, 2));
    });
}
