import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { state } = vi.hoisted(() => ({ state: { dataDir: "" } }));

vi.mock("../../src/utils/bucket.js", () => ({
  getBucket: () => "test",
  setBucket: vi.fn(),
  getBucketDataDir: () => state.dataDir,
}));

vi.mock("../../src/embedding/factory.js", () => {
  const embed = async (t: string) => {
    const a = new Float32Array(4);
    for (let i = 0; i < 4; i++) a[i] = Math.sin(t.charCodeAt(i % t.length) + i);
    return a;
  };
  return {
    getEmbeddingProvider: () => ({ dimensions: 4, embed, embedBatch: async (ts: string[]) => Promise.all(ts.map(embed)) }),
    resetEmbeddingProvider: vi.fn(),
  };
});

import { getDb, closeDb } from "../../src/db/connection.js";
import { createSchema } from "../../src/db/schema/index.js";
import { addEdge, getEdge, deleteEdge, listEdges, getEdgesForNode, getEdgesBetween, deleteEdgesForNode, edgeExists } from "../../src/graph/edges.js";

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), "mem-x-ge-"));
  state.dataDir = testDir;
  createSchema(getDb(), 4);
});

afterEach(() => {
  closeDb();
  rmSync(testDir, { recursive: true, force: true });
});

describe("edges CRUD", () => {
  it("addEdge + getEdge", () => {
    const edge = addEdge({
      source_id: "src-1",
      source_layer: "short_term",
      target_id: "tgt-1",
      target_layer: "semantic",
      relation: "promoted_from",
      weight: 0.9,
    });
    expect(edge.id).toBeTruthy();
    expect(edge.source_id).toBe("src-1");
    expect(edge.target_layer).toBe("semantic");
    expect(edge.relation).toBe("promoted_from");
    expect(edge.weight).toBe(0.9);

    const fetched = getEdge(edge.id);
    expect(fetched).toEqual(edge);
  });

  it("getEdge returns null for unknown id", () => {
    expect(getEdge("nonexistent")).toBeNull();
  });

  it("deleteEdge", () => {
    const edge = addEdge({
      source_id: "a",
      source_layer: "episodic",
      target_id: "b",
      target_layer: "rules",
      relation: "caused_by",
    });
    expect(deleteEdge(edge.id)).toBe(true);
    expect(getEdge(edge.id)).toBeNull();
    expect(deleteEdge("nonexistent")).toBe(false);
  });

  it("addEdge with metadata", () => {
    const edge = addEdge({
      source_id: "a",
      source_layer: "semantic",
      target_id: "b",
      target_layer: "semantic",
      relation: "related_to",
      metadata: { note: "topic overlap" },
    });
    expect(edge.metadata).toEqual({ note: "topic overlap" });
  });

  it("addEdge defaults weight to 1.0", () => {
    const edge = addEdge({
      source_id: "a",
      source_layer: "episodic",
      target_id: "b",
      target_layer: "episodic",
      relation: "leads_to",
    });
    expect(edge.weight).toBe(1.0);
  });
});

describe("listEdges", () => {
  it("list all and filter by relation", () => {
    addEdge({ source_id: "a", source_layer: "semantic", target_id: "b", target_layer: "semantic", relation: "related_to" });
    addEdge({ source_id: "c", source_layer: "episodic", target_id: "d", target_layer: "rules", relation: "caused_by" });

    expect(listEdges().length).toBe(2);
    expect(listEdges({ relation: "related_to" }).length).toBe(1);
    expect(listEdges({ relation: "caused_by" }).length).toBe(1);
    expect(listEdges({ relation: "contradicts" }).length).toBe(0);
  });

  it("filter by layer", () => {
    addEdge({ source_id: "a", source_layer: "semantic", target_id: "b", target_layer: "episodic", relation: "derived_from" });
    addEdge({ source_id: "c", source_layer: "rules", target_id: "d", target_layer: "rules", relation: "contradicts" });

    expect(listEdges({ layer: "semantic" }).length).toBe(1);
    expect(listEdges({ layer: "rules" }).length).toBe(1);
    expect(listEdges({ layer: "short_term" }).length).toBe(0);
  });

  it("respects limit", () => {
    for (let i = 0; i < 5; i++) {
      addEdge({ source_id: `a${i}`, source_layer: "semantic", target_id: `b${i}`, target_layer: "semantic", relation: "related_to" });
    }
    expect(listEdges({ limit: 3 }).length).toBe(3);
  });
});

describe("getEdgesForNode", () => {
  it("returns all edges for a node", () => {
    addEdge({ source_id: "x", source_layer: "semantic", target_id: "y", target_layer: "episodic", relation: "related_to" });
    addEdge({ source_id: "z", source_layer: "rules", target_id: "x", target_layer: "semantic", relation: "caused_by" });
    addEdge({ source_id: "w", source_layer: "episodic", target_id: "v", target_layer: "episodic", relation: "leads_to" });

    expect(getEdgesForNode("x").length).toBe(2);
    expect(getEdgesForNode("x", { direction: "outgoing" }).length).toBe(1);
    expect(getEdgesForNode("x", { direction: "incoming" }).length).toBe(1);
  });

  it("filters by relation", () => {
    addEdge({ source_id: "x", source_layer: "semantic", target_id: "y", target_layer: "episodic", relation: "related_to" });
    addEdge({ source_id: "x", source_layer: "semantic", target_id: "z", target_layer: "rules", relation: "caused_by" });

    expect(getEdgesForNode("x", { relation: "related_to" }).length).toBe(1);
  });
});

describe("getEdgesBetween", () => {
  it("returns edges between two nodes in either direction", () => {
    addEdge({ source_id: "a", source_layer: "semantic", target_id: "b", target_layer: "episodic", relation: "related_to" });
    addEdge({ source_id: "b", source_layer: "episodic", target_id: "a", target_layer: "semantic", relation: "contradicts" });

    expect(getEdgesBetween("a", "b").length).toBe(2);
    expect(getEdgesBetween("b", "a").length).toBe(2);
    expect(getEdgesBetween("a", "c").length).toBe(0);
  });
});

describe("deleteEdgesForNode", () => {
  it("deletes all edges connected to a node", () => {
    addEdge({ source_id: "x", source_layer: "semantic", target_id: "y", target_layer: "episodic", relation: "related_to" });
    addEdge({ source_id: "z", source_layer: "rules", target_id: "x", target_layer: "semantic", relation: "caused_by" });
    addEdge({ source_id: "w", source_layer: "episodic", target_id: "v", target_layer: "episodic", relation: "leads_to" });

    expect(deleteEdgesForNode("x")).toBe(2);
    expect(listEdges().length).toBe(1);
  });
});

describe("edgeExists", () => {
  it("detects existing directed edge", () => {
    addEdge({ source_id: "a", source_layer: "semantic", target_id: "b", target_layer: "episodic", relation: "promoted_from" });

    expect(edgeExists("a", "b", "promoted_from")).toBe(true);
    expect(edgeExists("b", "a", "promoted_from")).toBe(false);
  });

  it("detects bidirectional edge in either direction", () => {
    addEdge({ source_id: "a", source_layer: "semantic", target_id: "b", target_layer: "semantic", relation: "related_to" });

    expect(edgeExists("a", "b", "related_to")).toBe(true);
    expect(edgeExists("b", "a", "related_to")).toBe(true);
  });
});
