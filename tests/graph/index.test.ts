import { describe, it, expect } from "vitest";
import {
  EDGE_RELATIONS,
  BIDIRECTIONAL_RELATIONS,
  graphEnhanceResults,
  addEdge,
  getEdge,
  deleteEdge,
  listEdges,
  getEdgesForNode,
  getEdgesBetween,
  deleteEdgesForNode,
  edgeExists,
  getNeighbors,
  expandNeighborhood,
  getConnectedComponents,
  findSimilarByEmbedding,
  findSimilarById,
  autoLink,
} from "../../src/graph/index.js";

describe("graph/index re-exports", () => {
  it("exports all edge relation constants", () => {
    expect(EDGE_RELATIONS).toContain("promoted_from");
    expect(EDGE_RELATIONS).toContain("similar_to");
    expect(EDGE_RELATIONS.length).toBe(8);
  });

  it("exports bidirectional relations", () => {
    expect(BIDIRECTIONAL_RELATIONS).toContain("related_to");
    expect(BIDIRECTIONAL_RELATIONS).toContain("contradicts");
    expect(BIDIRECTIONAL_RELATIONS).toContain("similar_to");
  });

  it("exports all functions", () => {
    expect(typeof graphEnhanceResults).toBe("function");
    expect(typeof addEdge).toBe("function");
    expect(typeof getEdge).toBe("function");
    expect(typeof deleteEdge).toBe("function");
    expect(typeof listEdges).toBe("function");
    expect(typeof getEdgesForNode).toBe("function");
    expect(typeof getEdgesBetween).toBe("function");
    expect(typeof deleteEdgesForNode).toBe("function");
    expect(typeof edgeExists).toBe("function");
    expect(typeof getNeighbors).toBe("function");
    expect(typeof expandNeighborhood).toBe("function");
    expect(typeof getConnectedComponents).toBe("function");
    expect(typeof findSimilarByEmbedding).toBe("function");
    expect(typeof findSimilarById).toBe("function");
    expect(typeof autoLink).toBe("function");
  });
});
