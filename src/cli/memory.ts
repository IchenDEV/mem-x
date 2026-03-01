import { Command } from "commander";
import { closeDb } from "../db/connection.js";
import {
  listShortTerm,
  listEpisodic,
  listSemantic,
  listRules,
  getMemory,
  deleteMemory,
  purgeExpired,
} from "../memory/store.js";
import { addCmd } from "./memory-add.js";
import { parseLayerArg } from "./memory-utils.js";

const listCmd = new Command("list")
  .argument("<layer>", "Memory layer (short_term/episodic/semantic/rules)")
  .option("--since <date>", "Filter by date (ISO format)")
  .option("--limit <n>", "Max results", parseInt)
  .option("--include-expired", "Include expired short_term memories")
  .action((layerStr: string, opts) => {
    const layer = parseLayerArg(layerStr);
    const limit = opts.limit ?? 20;

    try {
      let results;
      switch (layer) {
        case "short_term":
          results = listShortTerm({ include_expired: opts.includeExpired, limit });
          break;
        case "episodic":
          results = listEpisodic({ since: opts.since, limit });
          break;
        case "semantic":
          results = listSemantic({ since: opts.since, limit });
          break;
        case "rules":
          results = listRules({ limit });
          break;
      }
      console.log(JSON.stringify(results, null, 2));
    } finally {
      closeDb();
    }
  });

const getCmd = new Command("get")
  .argument("<id>", "Memory ID")
  .option("--layer <layer>", "Memory layer", "episodic")
  .action((id: string, opts) => {
    const layer = parseLayerArg(opts.layer);
    try {
      const result = getMemory(layer, id);
      if (!result) {
        console.error(`Memory ${id} not found in ${layer}`);
        process.exitCode = 1;
        return;
      }
      console.log(JSON.stringify(result, null, 2));
    } finally {
      closeDb();
    }
  });

const deleteCmd = new Command("delete")
  .argument("<id>", "Memory ID")
  .option("--layer <layer>", "Memory layer", "episodic")
  .action(async (id: string, opts) => {
    const layer = parseLayerArg(opts.layer);
    try {
      const deleted = await deleteMemory(layer, id);
      console.log(deleted ? `Deleted ${id}` : `Not found: ${id}`);
    } finally {
      closeDb();
    }
  });

const purgeCmd = new Command("purge")
  .description("Remove expired short-term memories")
  .action(() => {
    try {
      const count = purgeExpired();
      console.log(`Purged ${count} expired short-term memories.`);
    } finally {
      closeDb();
    }
  });

export const memoryCommand = new Command("memory")
  .description("Manage memory layers")
  .addCommand(addCmd)
  .addCommand(listCmd)
  .addCommand(getCmd)
  .addCommand(deleteCmd)
  .addCommand(purgeCmd);
