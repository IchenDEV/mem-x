#!/usr/bin/env node

import { Command } from "commander";
import { initCommand } from "./cli/init.js";
import { memoryCommand } from "./cli/memory.js";
import { searchCommand } from "./cli/search.js";
import { taskCommand } from "./cli/task.js";
import { configCommand } from "./cli/config.js";

const program = new Command()
  .name("mem-x")
  .description("Self-evolving AI long-term memory system")
  .version("0.1.0");

program.addCommand(initCommand);
program.addCommand(memoryCommand);
program.addCommand(searchCommand);
program.addCommand(taskCommand);
program.addCommand(configCommand);

program.parseAsync(process.argv).catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
