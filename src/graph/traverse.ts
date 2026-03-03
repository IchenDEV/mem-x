import { getEdgesForNode } from "./edges.js";
import type { Edge, EdgeRelation, NeighborResult } from "./types.js";
import type { MemoryLayer } from "../memory/types.js";

export function getNeighbors(
  nodeId: string,
  opts?: { relation?: EdgeRelation; depth?: number },
): NeighborResult[] {
  const edges = getEdgesForNode(nodeId, { relation: opts?.relation });
  return edges.map((edge) => ({
    edge,
    direction: resolveDirection(edge, nodeId),
  }));
}

function resolveDirection(edge: Edge, nodeId: string): "outgoing" | "incoming" {
  if (edge.source_id === nodeId) return "outgoing";
  return "incoming";
}

function getNeighborId(edge: Edge, nodeId: string): string {
  return edge.source_id === nodeId ? edge.target_id : edge.source_id;
}

function getNeighborLayer(edge: Edge, nodeId: string): MemoryLayer {
  return edge.source_id === nodeId ? edge.target_layer : edge.source_layer;
}

export interface ExpandedNode {
  id: string;
  layer: MemoryLayer;
  hop: number;
  via: Edge;
}

/**
 * BFS expansion from a set of seed node IDs up to `depth` hops.
 * Returns all discovered neighbor nodes (excluding seeds themselves).
 */
export function expandNeighborhood(
  seedIds: string[],
  opts?: { depth?: number; relation?: EdgeRelation; maxNodes?: number },
): ExpandedNode[] {
  const depth = opts?.depth ?? 1;
  const maxNodes = opts?.maxNodes ?? 50;
  const visited = new Set<string>(seedIds);
  const result: ExpandedNode[] = [];

  let frontier = [...seedIds];

  for (let hop = 1; hop <= depth; hop++) {
    const nextFrontier: string[] = [];
    for (const nodeId of frontier) {
      if (result.length >= maxNodes) return result;

      const edges = getEdgesForNode(nodeId, { relation: opts?.relation });
      for (const edge of edges) {
        if (result.length >= maxNodes) return result;

        const neighborId = getNeighborId(edge, nodeId);
        if (visited.has(neighborId)) continue;

        visited.add(neighborId);
        result.push({
          id: neighborId,
          layer: getNeighborLayer(edge, nodeId),
          hop,
          via: edge,
        });
        nextFrontier.push(neighborId);
      }
    }
    frontier = nextFrontier;
    if (frontier.length === 0) break;
  }

  return result;
}

export function getConnectedComponents(nodeId: string): Map<string, Edge[]> {
  const groups = new Map<string, Edge[]>();
  const edges = getEdgesForNode(nodeId);
  for (const edge of edges) {
    const list = groups.get(edge.relation) ?? [];
    list.push(edge);
    groups.set(edge.relation, list);
  }
  return groups;
}
