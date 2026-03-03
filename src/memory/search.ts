import { getDb } from "../db/connection.js";
import { getEmbeddingProvider } from "../embedding/factory.js";
import { hydrateRow } from "./helpers.js";
import {
  SEARCH_LAYERS,
  RRF_K,
  type MemoryLayer,
  type SearchResult,
  type SearchOptions,
  type AnyMemory,
} from "./types.js";

function bumpHitCount(layer: MemoryLayer, ids: string[]): void {
  if (ids.length === 0) return;
  const db = getDb();
  const placeholders = ids.map(() => "?").join(",");
  db.prepare(
    `UPDATE ${layer}
     SET hit_count = hit_count + 1, last_hit_at = datetime('now')
     WHERE id IN (${placeholders})`,
  ).run(...ids);
}

import { getCurrentRound } from "../db/rounds.js";

function shortTermFilter(layer: MemoryLayer): string {
  return layer === "short_term" ? ` AND ${layer}.expires_at_round > ${getCurrentRound()}` : "";
}

const FTS_OPERATORS = new Set(["AND", "OR", "NOT"]);

export function prepareFtsQuery(query: string): string | null {
  const terms = query
    .split(/[\s\-_.,;:!?]+/)
    .filter((t) => t.length >= 3 && !FTS_OPERATORS.has(t.toUpperCase()));
  if (terms.length === 0) return null;
  return terms.join(" AND ");
}

export function searchBM25(
  layer: MemoryLayer,
  query: string,
  limit: number,
): { id: string; rank: number }[] {
  const ftsQuery = prepareFtsQuery(query);
  if (!ftsQuery) return [];
  const ftsTable = `${layer}_fts`;
  return getDb()
    .prepare(
      `SELECT ${layer}.id, bm25(${ftsTable}) as rank
       FROM ${ftsTable} JOIN ${layer} ON ${ftsTable}.rowid = ${layer}.rowid
       WHERE ${ftsTable} MATCH ?${shortTermFilter(layer)}
       ORDER BY rank LIMIT ?`,
    )
    .all(ftsQuery, limit) as { id: string; rank: number }[];
}

export function searchVec(
  layer: MemoryLayer,
  embeddingBuf: Buffer,
  limit: number,
): { id: string; distance: number }[] {
  return getDb()
    .prepare(
      `SELECT memory_id as id, distance
       FROM ${layer}_vec WHERE embedding MATCH ?
       ORDER BY distance LIMIT ?`,
    )
    .all(embeddingBuf, limit) as { id: string; distance: number }[];
}

export function mergeRRF(
  bm25Results: { id: string }[],
  vecResults: { id: string }[],
): Map<string, number> {
  const scores = new Map<string, number>();
  bm25Results.forEach(({ id }, i) => {
    scores.set(id, (scores.get(id) ?? 0) + 1 / (RRF_K + i + 1));
  });
  vecResults.forEach(({ id }, i) => {
    scores.set(id, (scores.get(id) ?? 0) + 1 / (RRF_K + i + 1));
  });
  return scores;
}

export function fetchRows(
  layer: MemoryLayer,
  ids: string[],
): Map<string, AnyMemory> {
  if (ids.length === 0) return new Map();
  const placeholders = ids.map(() => "?").join(",");
  const rows = getDb()
    .prepare(`SELECT * FROM ${layer} WHERE id IN (${placeholders})${shortTermFilter(layer)}`)
    .all(...ids) as Record<string, unknown>[];
  const map = new Map<string, AnyMemory>();
  for (const row of rows) {
    map.set(row.id as string, hydrateRow(layer, row));
  }
  return map;
}

function searchLayer(
  layer: MemoryLayer,
  query: string,
  mode: "bm25" | "vector" | "hybrid",
  limit: number,
  embeddingBuf: Buffer | null,
): SearchResult[] {
  let scoredIds: Map<string, number>;

  if (mode === "bm25") {
    const bm25 = searchBM25(layer, query, limit);
    scoredIds = new Map(bm25.map(({ id }, i) => [id, 1 / (RRF_K + i + 1)]));
  } else if (mode === "vector") {
    if (!embeddingBuf) return [];
    const vec = searchVec(layer, embeddingBuf, limit);
    scoredIds = new Map(vec.map(({ id }, i) => [id, 1 / (RRF_K + i + 1)]));
  } else {
    const bm25 = searchBM25(layer, query, limit * 2);
    const vec = embeddingBuf ? searchVec(layer, embeddingBuf, limit * 2) : [];
    scoredIds = mergeRRF(bm25, vec);
  }

  const allIds = [...scoredIds.keys()];
  bumpHitCount(layer, allIds);

  const rows = fetchRows(layer, allIds);
  const results: SearchResult[] = [];
  for (const [id, score] of scoredIds) {
    const data = rows.get(id);
    if (data) results.push({ id, layer, score, data });
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

export async function search(
  query: string,
  options: SearchOptions = {},
): Promise<SearchResult[]> {
  const { layer, mode = "hybrid", limit = 10, graphExpand, graphDepth, graphBoost } = options;
  const layers = layer ? [layer] : SEARCH_LAYERS;

  let embeddingBuf: Buffer | null = null;
  if (mode !== "bm25") {
    try {
      const embedding = await getEmbeddingProvider().embed(query);
      embeddingBuf = Buffer.from(embedding.buffer);
    } catch { /* embedding API unavailable, BM25 fallback */ }
  }

  const allResults: SearchResult[] = [];
  for (const l of layers) {
    try {
      allResults.push(...searchLayer(l, query, mode, limit, embeddingBuf));
    } catch {
      // BM25 may fail if query has no matches
    }
  }

  allResults.sort((a, b) => b.score - a.score);
  let results = allResults.slice(0, limit);

  if (graphExpand) {
    const { graphEnhanceResults } = await import("../graph/enhance.js");
    results = graphEnhanceResults(results, {
      depth: graphDepth,
      boost: graphBoost,
      limit,
    });
  }

  return results;
}
