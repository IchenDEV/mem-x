import { Command } from "commander";

export const debugCommand = new Command("debug")
  .description("Launch debug dashboard web UI")
  .option("-p, --port <port>", "Server port", "3210")
  .action(async (opts) => {
    const { startDebugServer } = await import("../debug/server.js");
    startDebugServer(parseInt(opts.port, 10));
  });
