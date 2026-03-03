import { Command } from "commander";
import { closeDb } from "../db/connection.js";
import {
  addEdge,
  deleteEdge,
  getNeighbors,
  listEdges,
  autoLink,
  EDGE_RELATIONS,
} from "../graph/index.js";
import type { MemoryLayer } from "../memory/types.js";
import type { EdgeRelation } from "../graph/types.js";

const linkCmd = new Command("link")
  .description("Create an edge between two memories")
  .argument("<source>", "Source memory ID")
  .argument("<target>", "Target memory ID")
  .requiredOption("--relation <type>", `Relation type (${EDGE_RELATIONS.join("/")})`)
  .requiredOption("--source-layer <layer>", "Source layer (short_term/episodic/semantic/rules)")
  .requiredOption("--target-layer <layer>", "Target layer (short_term/episodic/semantic/rules)")
  .option("--weight <n>", "Edge weight 0~1", parseFloat)
  .action((source: string, target: string, opts) => {
    try {
      const edge = addEdge({
        source_id: source,
        source_layer: opts.sourceLayer as MemoryLayer,
        target_id: target,
        target_layer: opts.targetLayer as MemoryLayer,
        relation: opts.relation as EdgeRelation,
        weight: opts.weight,
      });
      console.log(JSON.stringify(edge, null, 2));
    } finally {
      closeDb();
    }
  });

const unlinkCmd = new Command("unlink")
  .description("Delete an edge by ID")
  .argument("<id>", "Edge ID")
  .action((id: string) => {
    try {
      const ok = deleteEdge(id);
      console.log(ok ? `Deleted edge ${id}` : `Edge not found: ${id}`);
    } finally {
      closeDb();
    }
  });

const neighborsCmd = new Command("neighbors")
  .description("List neighbors of a memory node")
  .argument("<id>", "Memory ID")
  .option("--relation <type>", "Filter by relation type")
  .action((id: string, opts) => {
    try {
      const neighbors = getNeighbors(id, {
        relation: opts.relation as EdgeRelation | undefined,
      });
      if (neighbors.length === 0) {
        console.log("No neighbors found.");
        return;
      }
      console.log(JSON.stringify(neighbors, null, 2));
    } finally {
      closeDb();
    }
  });

const listCmd = new Command("list")
  .description("List all edges")
  .option("--relation <type>", "Filter by relation type")
  .option("--layer <layer>", "Filter by layer")
  .option("--limit <n>", "Max results", parseInt)
  .action((opts) => {
    try {
      const edges = listEdges({
        relation: opts.relation as EdgeRelation | undefined,
        layer: opts.layer as MemoryLayer | undefined,
        limit: opts.limit,
      });
      console.log(JSON.stringify(edges, null, 2));
    } finally {
      closeDb();
    }
  });

const autoLinkCmd = new Command("auto-link")
  .description("Auto-discover and persist similar_to edges via vector similarity")
  .option("--threshold <n>", "Similarity threshold 0~1", parseFloat)
  .option("--limit <n>", "Max memories to scan per layer", parseInt)
  .action(async (opts) => {
    try {
      const edges = await autoLink({
        threshold: opts.threshold,
        limit: opts.limit,
      });
      console.log(`Created ${edges.length} similar_to edges.`);
      if (edges.length > 0) {
        console.log(JSON.stringify(edges, null, 2));
      }
    } finally {
      closeDb();
    }
  });

export const graphCommand = new Command("graph")
  .description("Manage memory graph (edges and relationships)")
  .addCommand(linkCmd)
  .addCommand(unlinkCmd)
  .addCommand(neighborsCmd)
  .addCommand(listCmd)
  .addCommand(autoLinkCmd);
