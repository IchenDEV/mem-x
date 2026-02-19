import { Command } from "commander";
import { initializeDatabase } from "../db/migrate.js";
import { closeDb } from "../db/connection.js";

export const initCommand = new Command("init")
  .description("Initialize database and directories")
  .action(() => {
    initializeDatabase();
    closeDb();
    console.log("mem-x initialized successfully.");
  });
