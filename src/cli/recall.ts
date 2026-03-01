import { Command } from "commander";

export const recallCommand = new Command("recall")
  .description("Bootstrap context: aggregate all rules, tasks, and recent memories")
  .option("--limit <n>", "Max items per category", "10")
  .action(async (opts) => {
    const { initializeDatabase } = await import("../db/migrate.js");
    initializeDatabase();
    const { recall, formatRecall } = await import("../memory/recall.js");
    const ctx = recall(parseInt(opts.limit, 10));
    console.log(formatRecall(ctx));
  });
