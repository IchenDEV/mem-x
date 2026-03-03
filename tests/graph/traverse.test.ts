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
import { addEdge } from "../../src/graph/edges.js";
import { getNeighbors, expandNeighborhood, getConnectedComponents } from "../../src/graph/traverse.js";

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), "mem-x-gt-"));
  state.dataDir = testDir;
  createSchema(getDb(), 4);
});

afterEach(() => {
  closeDb();
  rmSync(testDir, { recursive: true, force: true });
});

describe("getNeighbors", () => {
  it("returns outgoing and incoming neighbors", () => {
    addEdge({ source_id: "a", source_layer: "semantic", target_id: "b", target_layer: "episodic", relation: "related_to" });
    addEdge({ source_id: "c", source_layer: "rules", target_id: "a", target_layer: "semantic", relation: "caused_by" });

    const neighbors = getNeighbors("a");
    expect(neighbors.length).toBe(2);

    const outgoing = neighbors.find((n) => n.direction === "outgoing");
    const incoming = neighbors.find((n) => n.direction === "incoming");
    expect(outgoing?.edge.target_id).toBe("b");
    expect(incoming?.edge.source_id).toBe("c");
  });

  it("filters by relation", () => {
    addEdge({ source_id: "a", source_layer: "semantic", target_id: "b", target_layer: "episodic", relation: "related_to" });
    addEdge({ source_id: "a", source_layer: "semantic", target_id: "c", target_layer: "rules", relation: "caused_by" });

    expect(getNeighbors("a", { relation: "related_to" }).length).toBe(1);
  });

  it("returns empty for isolated node", () => {
    expect(getNeighbors("orphan").length).toBe(0);
  });
});

describe("expandNeighborhood", () => {
  it("1-hop expansion from seed", () => {
    addEdge({ source_id: "a", source_layer: "semantic", target_id: "b", target_layer: "episodic", relation: "related_to" });
    addEdge({ source_id: "a", source_layer: "semantic", target_id: "c", target_layer: "rules", relation: "caused_by" });
    addEdge({ source_id: "d", source_layer: "episodic", target_id: "e", target_layer: "episodic", relation: "leads_to" });

    const expanded = expandNeighborhood(["a"]);
    expect(expanded.length).toBe(2);
    expect(expanded.every((n) => n.hop === 1)).toBe(true);
    expect(expanded.map((n) => n.id).sort()).toEqual(["b", "c"]);
  });

  it("2-hop expansion", () => {
    addEdge({ source_id: "a", source_layer: "semantic", target_id: "b", target_layer: "episodic", relation: "related_to" });
    addEdge({ source_id: "b", source_layer: "episodic", target_id: "c", target_layer: "rules", relation: "leads_to" });

    const expanded = expandNeighborhood(["a"], { depth: 2 });
    expect(expanded.length).toBe(2);
    expect(expanded.find((n) => n.id === "b")?.hop).toBe(1);
    expect(expanded.find((n) => n.id === "c")?.hop).toBe(2);
  });

  it("does not revisit seed nodes", () => {
    addEdge({ source_id: "a", source_layer: "semantic", target_id: "b", target_layer: "episodic", relation: "related_to" });
    addEdge({ source_id: "b", source_layer: "episodic", target_id: "a", target_layer: "semantic", relation: "related_to" });

    const expanded = expandNeighborhood(["a"]);
    expect(expanded.length).toBe(1);
    expect(expanded[0].id).toBe("b");
  });

  it("respects maxNodes limit", () => {
    for (let i = 0; i < 10; i++) {
      addEdge({ source_id: "a", source_layer: "semantic", target_id: `n${i}`, target_layer: "semantic", relation: "related_to" });
    }

    const expanded = expandNeighborhood(["a"], { maxNodes: 3 });
    expect(expanded.length).toBe(3);
  });

  it("multiple seeds", () => {
    addEdge({ source_id: "a", source_layer: "semantic", target_id: "c", target_layer: "rules", relation: "related_to" });
    addEdge({ source_id: "b", source_layer: "episodic", target_id: "d", target_layer: "episodic", relation: "leads_to" });

    const expanded = expandNeighborhood(["a", "b"]);
    expect(expanded.length).toBe(2);
    expect(expanded.map((n) => n.id).sort()).toEqual(["c", "d"]);
  });
});

describe("getConnectedComponents", () => {
  it("groups edges by relation type", () => {
    addEdge({ source_id: "a", source_layer: "semantic", target_id: "b", target_layer: "episodic", relation: "related_to" });
    addEdge({ source_id: "a", source_layer: "semantic", target_id: "c", target_layer: "semantic", relation: "related_to" });
    addEdge({ source_id: "a", source_layer: "semantic", target_id: "d", target_layer: "rules", relation: "contradicts" });

    const groups = getConnectedComponents("a");
    expect(groups.get("related_to")?.length).toBe(2);
    expect(groups.get("contradicts")?.length).toBe(1);
    expect(groups.has("caused_by")).toBe(false);
  });
});
