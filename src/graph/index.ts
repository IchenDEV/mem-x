export type { Edge, EdgeRelation, AddEdgeInput, NeighborResult } from "./types.js";
export { EDGE_RELATIONS, BIDIRECTIONAL_RELATIONS } from "./types.js";

export { addEdge, getEdge, deleteEdge, listEdges, getEdgesForNode, getEdgesBetween, deleteEdgesForNode, edgeExists } from "./edges.js";

export { getNeighbors, expandNeighborhood, getConnectedComponents } from "./traverse.js";
export type { ExpandedNode } from "./traverse.js";

export { findSimilarByEmbedding, findSimilarById, autoLink } from "./auto-link.js";
export type { SimilarCandidate } from "./auto-link.js";

export { graphEnhanceResults } from "./enhance.js";
export type { GraphEnhanceOptions } from "./enhance.js";
