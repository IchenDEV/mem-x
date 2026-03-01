import { getEmbeddingProvider } from "../embedding/factory.js";
import { searchBM25, searchVec, fetchRows } from "../memory/search.js";
import { SEARCH_LAYERS, RRF_K, type MemoryLayer, type AnyMemory } from "../memory/types.js";

export interface DebugSearchResult {
  id: string;
  layer: MemoryLayer;
  bm25_rank: number | null;
  vector_distance: number | null;
  rrf_score: number;
  data: AnyMemory;
}

export async function debugSearch(
  query: string,
  opts: { layer?: MemoryLayer; mode?: "bm25" | "vector" | "hybrid"; limit?: number },
): Promise<{ results: DebugSearchResult[]; bm25_raw: unknown[]; vector_raw: unknown[] }> {
  const { layer, mode = "hybrid", limit = 10 } = opts;
  const layers = layer ? [layer] : SEARCH_LAYERS;

  const bm25Raw: { layer: MemoryLayer; id: string; rank: number }[] = [];
  const vecRaw: { layer: MemoryLayer; id: string; distance: number }[] = [];

  if (mode !== "vector") {
    for (const l of layers) {
      try {
        bm25Raw.push(...searchBM25(l, query, limit * 2).map((r) => ({ ...r, layer: l })));
      } catch { /* FTS match may fail */ }
    }
  }

  if (mode !== "bm25") {
    try {
      const embedding = await getEmbeddingProvider().embed(query);
      const buf = Buffer.from(embedding.buffer);
      for (const l of layers) {
        try {
          vecRaw.push(...searchVec(l, buf, limit * 2).map((r) => ({ ...r, layer: l })));
        } catch { /* vec table may not exist */ }
      }
    } catch { /* embedding API unavailable */ }
  }

  const scores = new Map<string, { layer: MemoryLayer; bm25: number | null; vec: number | null; rrf: number }>();

  bm25Raw.forEach(({ id, layer: l, rank }, i) => {
    const rrf = 1 / (RRF_K + i + 1);
    const existing = scores.get(id);
    if (existing) { existing.bm25 = rank; existing.rrf += rrf; }
    else scores.set(id, { layer: l, bm25: rank, vec: null, rrf });
  });

  vecRaw.forEach(({ id, layer: l, distance }, i) => {
    const rrf = 1 / (RRF_K + i + 1);
    const existing = scores.get(id);
    if (existing) { existing.vec = distance; existing.rrf += rrf; }
    else scores.set(id, { layer: l, bm25: null, vec: distance, rrf });
  });

  const results: DebugSearchResult[] = [];
  const byLayer = new Map<MemoryLayer, string[]>();
  for (const [id, s] of scores) {
    const ids = byLayer.get(s.layer) ?? [];
    ids.push(id);
    byLayer.set(s.layer, ids);
  }

  for (const [l, ids] of byLayer) {
    const rows = fetchRows(l, ids);
    for (const id of ids) {
      const data = rows.get(id);
      const s = scores.get(id)!;
      if (data) {
        results.push({ id, layer: l, bm25_rank: s.bm25, vector_distance: s.vec, rrf_score: s.rrf, data });
      }
    }
  }

  results.sort((a, b) => b.rrf_score - a.rrf_score);
  return { results: results.slice(0, limit), bm25_raw: bm25Raw, vector_raw: vecRaw };
}
