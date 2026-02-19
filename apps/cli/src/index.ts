#!/usr/bin/env node
import { Command } from "commander";

import { registerAgentCommands } from "./commands/agent.js";
import { registerOperatorCommands } from "./commands/operator.js";

const program = new Command();

program.name("synoptic").description("Synoptic CLI scaffold").version("0.1.0");

registerOperatorCommands(program);
registerAgentCommands(program);

program.parseAsync().catch((error) => {
  console.error(error);
  process.exit(1);
});
