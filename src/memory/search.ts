import { getDb } from "../db/connection.js";
import { getEmbeddingProvider } from "../embedding/factory.js";
import type {
  MemoryLayer,
  SearchResult,
  SearchOptions,
  EpisodicMemory,
  SemanticMemory,
  RuleMemory,
} from "./types.js";

const LAYERS: MemoryLayer[] = ["rules", "semantic", "episodic"];

const RRF_K = 60;

function parseTags(tags: string | null): string[] {
  if (!tags) return [];
  try {
    return JSON.parse(tags);
  } catch {
    return [];
  }
}

function hydrateRow(
  layer: MemoryLayer,
  row: Record<string, unknown>,
): EpisodicMemory | SemanticMemory | RuleMemory {
  const base = { ...row };
  if ("tags" in base) base.tags = parseTags(base.tags as string);
  if ("sources" in base) base.sources = parseTags(base.sources as string);
  if ("promoted" in base) base.promoted = base.promoted === 1;
  if ("verified" in base) base.verified = base.verified === 1;
  return base as unknown as EpisodicMemory | SemanticMemory | RuleMemory;
}

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

function searchBM25(
  layer: MemoryLayer,
  query: string,
  limit: number,
): { id: string; rank: number }[] {
  const db = getDb();
  const ftsTable = `${layer}_fts`;
  const stmt = db.prepare(`
    SELECT ${layer}.id, bm25(${ftsTable}) as rank
    FROM ${ftsTable}
    JOIN ${layer} ON ${ftsTable}.rowid = ${layer}.rowid
    WHERE ${ftsTable} MATCH ?
    ORDER BY rank
    LIMIT ?
  `);
  return stmt.all(query, limit) as { id: string; rank: number }[];
}

async function searchVector(
  layer: MemoryLayer,
  query: string,
  limit: number,
): Promise<{ id: string; distance: number }[]> {
  const provider = getEmbeddingProvider();
  const embedding = await provider.embed(query);
  const db = getDb();
  const vecTable = `${layer}_vec`;
  const stmt = db.prepare(`
    SELECT memory_id as id, distance
    FROM ${vecTable}
    WHERE embedding MATCH ?
    ORDER BY distance
    LIMIT ?
  `);
  return stmt.all(Buffer.from(embedding.buffer), limit) as {
    id: string;
    distance: number;
  }[];
}

function mergeRRF(
  bm25Results: { id: string }[],
  vecResults: { id: string }[],
): Map<string, number> {
  const scores = new Map<string, number>();

  bm25Results.forEach(({ id }, i) => {
    const rank = i + 1;
    scores.set(id, (scores.get(id) ?? 0) + 1 / (RRF_K + rank));
  });

  vecResults.forEach(({ id }, i) => {
    const rank = i + 1;
    scores.set(id, (scores.get(id) ?? 0) + 1 / (RRF_K + rank));
  });

  return scores;
}

function fetchRows(
  layer: MemoryLayer,
  ids: string[],
): Map<string, EpisodicMemory | SemanticMemory | RuleMemory> {
  if (ids.length === 0) return new Map();
  const db = getDb();
  const placeholders = ids.map(() => "?").join(",");
  const rows = db
    .prepare(`SELECT * FROM ${layer} WHERE id IN (${placeholders})`)
    .all(...ids) as Record<string, unknown>[];
  const map = new Map<string, EpisodicMemory | SemanticMemory | RuleMemory>();
  for (const row of rows) {
    map.set(row.id as string, hydrateRow(layer, row));
  }
  return map;
}

async function searchLayer(
  layer: MemoryLayer,
  query: string,
  mode: "bm25" | "vector" | "hybrid",
  limit: number,
): Promise<SearchResult[]> {
  let scoredIds: Map<string, number>;

  if (mode === "bm25") {
    const bm25 = searchBM25(layer, query, limit);
    scoredIds = new Map(bm25.map(({ id }, i) => [id, 1 / (RRF_K + i + 1)]));
  } else if (mode === "vector") {
    const vec = await searchVector(layer, query, limit);
    scoredIds = new Map(vec.map(({ id }, i) => [id, 1 / (RRF_K + i + 1)]));
  } else {
    const bm25 = searchBM25(layer, query, limit * 2);
    const vec = await searchVector(layer, query, limit * 2);
    scoredIds = mergeRRF(bm25, vec);
  }

  const allIds = [...scoredIds.keys()];
  bumpHitCount(layer, allIds);

  const rows = fetchRows(layer, allIds);
  const results: SearchResult[] = [];
  for (const [id, score] of scoredIds) {
    const data = rows.get(id);
    if (data) {
      results.push({ id, layer, score, data });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

export async function search(
  query: string,
  options: SearchOptions = {},
): Promise<SearchResult[]> {
  const { layer, mode = "hybrid", limit = 10 } = options;
  const layers = layer ? [layer] : LAYERS;

  const allResults: SearchResult[] = [];
  for (const l of layers) {
    try {
      const results = await searchLayer(l, query, mode, limit);
      allResults.push(...results);
    } catch {
      // BM25 may fail if query has no matches; vector may fail without embeddings
    }
  }

  allResults.sort((a, b) => b.score - a.score);
  return allResults.slice(0, limit);
}
