import { expandNeighborhood, type ExpandedNode } from "./traverse.js";
import { findSimilarByEmbedding } from "./auto-link.js";
import { fetchRows } from "../memory/search.js";
import { getDb } from "../db/connection.js";
import type { SearchResult, MemoryLayer } from "../memory/types.js";
import type { EdgeRelation } from "./types.js";

const DEFAULT_GRAPH_BOOST = 0.3;
const IMPLICIT_NEIGHBOR_LIMIT = 10;
const SIMILARITY_THRESHOLD = 0.75;

export interface GraphEnhanceOptions {
  depth?: number;
  boost?: number;
  limit?: number;
  relation?: EdgeRelation;
  useImplicit?: boolean;
}

/**
 * Enhance search results by expanding the graph neighborhood
 * and boosting scores of connected memories.
 *
 * 1. Explicit edge expansion via edges table
 * 2. Implicit expansion via cross-layer KNN (optional)
 * 3. Score boosting for neighbors of high-scoring hits
 */
export function graphEnhanceResults(
  initialResults: SearchResult[],
  options: GraphEnhanceOptions = {},
): SearchResult[] {
  const { depth = 1, boost = DEFAULT_GRAPH_BOOST, limit = 10, useImplicit = true } = options;

  if (initialResults.length === 0) return [];

  const seedIds = initialResults.map((r) => r.id);
  const scoreMap = new Map<string, number>(
    initialResults.map((r) => [r.id, r.score]),
  );
  const layerMap = new Map<string, MemoryLayer>(
    initialResults.map((r) => [r.id, r.layer]),
  );

  const explicitNeighbors = expandNeighborhood(seedIds, {
    depth,
    relation: options.relation,
    maxNodes: limit * 3,
  });

  applyExplicitBoost(explicitNeighbors, scoreMap, layerMap, boost);

  if (useImplicit) {
    applyImplicitBoost(initialResults, scoreMap, layerMap, boost);
  }

  return buildFinalResults(scoreMap, layerMap, initialResults, limit);
}

function applyExplicitBoost(
  neighbors: ExpandedNode[],
  scoreMap: Map<string, number>,
  layerMap: Map<string, MemoryLayer>,
  boost: number,
): void {
  for (const neighbor of neighbors) {
    const sourceId =
      neighbor.via.source_id === neighbor.id
        ? neighbor.via.target_id
        : neighbor.via.source_id;
    const sourceScore = scoreMap.get(sourceId) ?? 0;
    const graphScore = boost * neighbor.via.weight * sourceScore;

    const existing = scoreMap.get(neighbor.id) ?? 0;
    scoreMap.set(neighbor.id, existing + graphScore);
    if (!layerMap.has(neighbor.id)) {
      layerMap.set(neighbor.id, neighbor.layer);
    }
  }
}

function applyImplicitBoost(
  initialResults: SearchResult[],
  scoreMap: Map<string, number>,
  layerMap: Map<string, MemoryLayer>,
  boost: number,
): void {
  for (const result of initialResults.slice(0, 5)) {
    const embRow = readEmbedding(result.id, result.layer);
    if (!embRow) continue;

    const similar = findSimilarByEmbedding(embRow, {
      excludeIds: new Set(scoreMap.keys()),
      threshold: SIMILARITY_THRESHOLD,
      limit: IMPLICIT_NEIGHBOR_LIMIT,
    });

    for (const candidate of similar) {
      const graphScore = boost * candidate.similarity * result.score;
      const existing = scoreMap.get(candidate.id) ?? 0;
      scoreMap.set(candidate.id, existing + graphScore);
      if (!layerMap.has(candidate.id)) {
        layerMap.set(candidate.id, candidate.layer);
      }
    }
  }
}

function readEmbedding(id: string, layer: MemoryLayer): Buffer | null {
  const row = getDb()
    .prepare(`SELECT embedding FROM ${layer}_vec WHERE memory_id = ?`)
    .get(id) as { embedding: Buffer } | undefined;
  return row?.embedding ?? null;
}

function buildFinalResults(
  scoreMap: Map<string, number>,
  layerMap: Map<string, MemoryLayer>,
  initialResults: SearchResult[],
  limit: number,
): SearchResult[] {
  const initialDataMap = new Map(initialResults.map((r) => [r.id, r.data]));
  const newIds = [...scoreMap.keys()].filter((id) => !initialDataMap.has(id));

  const fetchedByLayer = new Map<MemoryLayer, Map<string, unknown>>();
  for (const id of newIds) {
    const layer = layerMap.get(id)!;
    if (!fetchedByLayer.has(layer)) {
      const idsForLayer = newIds.filter((nid) => layerMap.get(nid) === layer);
      fetchedByLayer.set(layer, fetchRows(layer, idsForLayer) as unknown as Map<string, unknown>);
    }
  }

  const results: SearchResult[] = [];
  for (const [id, score] of scoreMap) {
    const layer = layerMap.get(id)!;
    const data = initialDataMap.get(id) ?? fetchedByLayer.get(layer)?.get(id);
    if (!data) continue;
    results.push({ id, layer, score, data: data as SearchResult["data"] });
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}
