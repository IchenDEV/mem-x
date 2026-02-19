import { Command } from "commander";
import { closeDb } from "../db/connection.js";
import {
  addEpisodic,
  addSemantic,
  addRule,
  getMemory,
  deleteMemory,
  listEpisodic,
  listSemantic,
  listRules,
} from "../memory/store.js";
import type { MemoryLayer } from "../memory/types.js";

function parseLayerArg(layer: string): MemoryLayer {
  if (!["episodic", "semantic", "rules"].includes(layer)) {
    throw new Error(`Invalid layer: ${layer}. Use: episodic, semantic, rules`);
  }
  return layer as MemoryLayer;
}

function parseCsvTags(val?: string): string[] {
  return val ? val.split(",").map((t) => t.trim()).filter(Boolean) : [];
}

const addCmd = new Command("add")
  .argument("<layer>", "Memory layer (episodic/semantic/rules)")
  .option("--event <text>", "Event description (episodic)")
  .option("--context <text>", "Context (episodic)")
  .option("--result <text>", "Result (episodic)")
  .option("--topic <text>", "Topic (semantic)")
  .option("--content <text>", "Content (semantic)")
  .option("--trigger <text>", "Trigger condition (rules)")
  .option("--constraint <text>", "Constraint (rules)")
  .option("--reason <text>", "Reason (rules)")
  .option("--tags <tags>", "Comma-separated tags")
  .option("--confidence <n>", "Confidence 0~1", parseFloat)
  .action(async (layerStr: string, opts) => {
    const layer = parseLayerArg(layerStr);
    const tags = parseCsvTags(opts.tags);

    try {
      let result;
      switch (layer) {
        case "episodic":
          if (!opts.event) throw new Error("--event is required for episodic");
          result = await addEpisodic({
            event: opts.event,
            context: opts.context,
            result: opts.result,
            tags,
            confidence: opts.confidence,
          });
          break;
        case "semantic":
          if (!opts.topic || !opts.content)
            throw new Error("--topic and --content are required for semantic");
          result = await addSemantic({
            topic: opts.topic,
            content: opts.content,
            tags,
            confidence: opts.confidence,
          });
          break;
        case "rules":
          if (!opts.trigger || !opts.constraint)
            throw new Error("--trigger and --constraint are required for rules");
          result = await addRule({
            trigger_condition: opts.trigger,
            constraint_text: opts.constraint,
            reason: opts.reason,
            confidence: opts.confidence,
          });
          break;
      }
      console.log(JSON.stringify(result, null, 2));
    } finally {
      closeDb();
    }
  });

const listCmd = new Command("list")
  .argument("<layer>", "Memory layer (episodic/semantic/rules)")
  .option("--since <date>", "Filter by date (ISO format)")
  .option("--limit <n>", "Max results", parseInt)
  .action((layerStr: string, opts) => {
    const layer = parseLayerArg(layerStr);
    const limit = opts.limit ?? 20;

    try {
      let results;
      switch (layer) {
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

export const memoryCommand = new Command("memory")
  .description("Manage three-layer memory")
  .addCommand(addCmd)
  .addCommand(listCmd)
  .addCommand(getCmd)
  .addCommand(deleteCmd);
