import { Command } from "commander";
import { closeDb } from "../db/connection.js";
import { search } from "../memory/search.js";
import type { MemoryLayer, SearchOptions } from "../memory/types.js";

export const searchCommand = new Command("search")
  .description("Search memories (BM25 + vector hybrid)")
  .argument("<query>", "Search query")
  .option("--layer <layer>", "Filter by layer (episodic/semantic/rules)")
  .option("--mode <mode>", "Search mode (bm25/vector/hybrid)", "hybrid")
  .option("--limit <n>", "Max results", parseInt)
  .option("--graph", "Enable graph-enhanced search (expand neighbors + boost)")
  .option("--graph-depth <n>", "Graph expansion depth", parseInt)
  .option("--graph-boost <n>", "Graph boost factor 0~1", parseFloat)
  .action(async (query: string, opts) => {
    const options: SearchOptions = {
      layer: opts.layer as MemoryLayer | undefined,
      mode: opts.mode,
      limit: opts.limit ?? 10,
      graphExpand: opts.graph ?? false,
      graphDepth: opts.graphDepth,
      graphBoost: opts.graphBoost,
    };

    try {
      const results = await search(query, options);
      if (results.length === 0) {
        console.log("No results found.");
        return;
      }
      console.log(JSON.stringify(results, null, 2));
    } finally {
      closeDb();
    }
  });
