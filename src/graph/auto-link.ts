import { getDb } from "../db/connection.js";
import { addEdge, edgeExists } from "./edges.js";
import type { Edge } from "./types.js";
import { ALL_LAYERS, type MemoryLayer } from "../memory/types.js";

const DEFAULT_THRESHOLD = 0.85;
const DEFAULT_LIMIT = 20;

export interface SimilarCandidate {
  id: string;
  layer: MemoryLayer;
  distance: number;
  similarity: number;
}

/**
 * Find memories similar to a given embedding across all layers.
 * Returns candidates sorted by similarity (highest first).
 */
export function findSimilarByEmbedding(
  embeddingBuf: Buffer,
  opts?: { excludeIds?: Set<string>; threshold?: number; limit?: number },
): SimilarCandidate[] {
  const threshold = opts?.threshold ?? DEFAULT_THRESHOLD;
  const limit = opts?.limit ?? DEFAULT_LIMIT;
  const excludeIds = opts?.excludeIds ?? new Set();
  const db = getDb();
  const results: SimilarCandidate[] = [];

  for (const layer of ALL_LAYERS) {
    const rows = db
      .prepare(
        `SELECT memory_id as id, distance FROM ${layer}_vec
         WHERE embedding MATCH ? ORDER BY distance LIMIT ?`,
      )
      .all(embeddingBuf, limit) as { id: string; distance: number }[];

    for (const row of rows) {
      if (excludeIds.has(row.id)) continue;
      const similarity = 1 - row.distance;
      if (similarity >= threshold) {
        results.push({ id: row.id, layer, distance: row.distance, similarity });
      }
    }
  }

  results.sort((a, b) => b.similarity - a.similarity);
  return results.slice(0, limit);
}

/**
 * Find memories similar to a given memory ID.
 * Reads the memory's embedding from its vec table, then does cross-layer KNN.
 */
export async function findSimilarById(
  memoryId: string,
  sourceLayer: MemoryLayer,
  opts?: { threshold?: number; limit?: number },
): Promise<SimilarCandidate[]> {
  const db = getDb();
  const row = db
    .prepare(`SELECT embedding FROM ${sourceLayer}_vec WHERE memory_id = ?`)
    .get(memoryId) as { embedding: Buffer } | undefined;

  if (!row) return [];

  return findSimilarByEmbedding(row.embedding, {
    excludeIds: new Set([memoryId]),
    threshold: opts?.threshold,
    limit: opts?.limit,
  });
}

/**
 * Auto-discover and persist `similar_to` edges for all memories.
 * Scans each layer, finds cross-layer similarities above threshold, and creates edges.
 */
export async function autoLink(opts?: {
  threshold?: number;
  limit?: number;
}): Promise<Edge[]> {
  const threshold = opts?.threshold ?? DEFAULT_THRESHOLD;
  const limit = opts?.limit ?? DEFAULT_LIMIT;
  const db = getDb();
  const created: Edge[] = [];

  for (const layer of ALL_LAYERS) {
    const memories = db
      .prepare(`SELECT id FROM ${layer} LIMIT ?`)
      .all(limit * 10) as { id: string }[];

    for (const { id } of memories) {
      const candidates = await findSimilarById(id, layer, { threshold, limit: 5 });

      for (const candidate of candidates) {
        if (edgeExists(id, candidate.id, "similar_to")) continue;

        created.push(
          addEdge({
            source_id: id,
            source_layer: layer,
            target_id: candidate.id,
            target_layer: candidate.layer,
            relation: "similar_to",
            weight: candidate.similarity,
          }),
        );
      }
    }
  }

  return created;
}
