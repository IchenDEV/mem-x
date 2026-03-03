#!/usr/bin/env node

import { Command } from "commander";
import { setBucket } from "./utils/bucket.js";
import { initCommand } from "./cli/init.js";
import { memoryCommand } from "./cli/memory.js";
import { searchCommand } from "./cli/search.js";
import { taskCommand } from "./cli/task.js";
import { configCommand } from "./cli/config.js";
import { sessionCommand } from "./cli/session.js";
import { debugCommand } from "./cli/debug.js";
import { recallCommand } from "./cli/recall.js";
import { graphCommand } from "./cli/graph.js";

const program = new Command()
  .name("mem-x")
  .description("Self-evolving AI long-term memory system")
  .version("0.1.0")
  .option(
    "-b, --bucket <name>",
    "Agent bucket for multi-agent isolation (env: MEM_X_BUCKET)",
    process.env.MEM_X_BUCKET || "default",
  )
  .hook("preAction", (thisCommand) => {
    setBucket(thisCommand.opts().bucket);
  });

program.addCommand(initCommand);
program.addCommand(sessionCommand);
program.addCommand(memoryCommand);
program.addCommand(searchCommand);
program.addCommand(taskCommand);
program.addCommand(configCommand);
program.addCommand(debugCommand);
program.addCommand(recallCommand);
program.addCommand(graphCommand);

program.parseAsync(process.argv).catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
