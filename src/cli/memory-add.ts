import { Command } from "commander";
import { closeDb } from "../db/connection.js";
import {
  addShortTerm,
  addEpisodic,
  addSemantic,
  addRule,
} from "../memory/store.js";
import { parseLayerArg, parseCsvTags } from "./memory-utils.js";

export const addCmd = new Command("add")
  .argument("<layer>", "Memory layer (short_term/episodic/semantic/rules)")
  .option("--content <text>", "Content (short_term / semantic)")
  .option("--event <text>", "Event description (episodic)")
  .option("--context <text>", "Context (episodic)")
  .option("--result <text>", "Result (episodic)")
  .option("--topic <text>", "Topic (semantic)")
  .option("--trigger <text>", "Trigger condition (rules)")
  .option("--constraint <text>", "Constraint (rules)")
  .option("--reason <text>", "Reason (rules)")
  .option("--tags <tags>", "Comma-separated tags")
  .option("--confidence <n>", "Confidence 0~1", parseFloat)
  .option("--ttl <rounds>", "TTL in conversation rounds (short_term)", parseInt)
  .action(async (layerStr: string, opts) => {
    const layer = parseLayerArg(layerStr);
    const tags = parseCsvTags(opts.tags);

    try {
      let result;
      switch (layer) {
        case "short_term":
          if (!opts.content) throw new Error("--content is required for short_term");
          result = await addShortTerm({
            content: opts.content,
            tags,
            confidence: opts.confidence,
            ttl_rounds: opts.ttl,
          });
          break;
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
