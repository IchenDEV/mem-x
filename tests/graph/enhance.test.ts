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
import { addSemantic } from "../../src/memory/layers/semantic.js";
import { addEpisodic } from "../../src/memory/layers/episodic.js";
import { addEdge } from "../../src/graph/edges.js";
import { addRule } from "../../src/memory/layers/rules.js";
import { graphEnhanceResults } from "../../src/graph/enhance.js";
import type { SearchResult } from "../../src/memory/types.js";

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), "mem-x-gn-"));
  state.dataDir = testDir;
  createSchema(getDb(), 4);
});

afterEach(() => {
  closeDb();
  rmSync(testDir, { recursive: true, force: true });
});

describe("graphEnhanceResults", () => {
  it("returns empty for empty input", () => {
    expect(graphEnhanceResults([])).toEqual([]);
  });

  it("returns original results when no edges exist", async () => {
    const sem = await addSemantic({ topic: "TS", content: "typed JS" });
    const initial: SearchResult[] = [
      { id: sem.id, layer: "semantic", score: 0.5, data: sem },
    ];

    const enhanced = graphEnhanceResults(initial, { useImplicit: false });
    expect(enhanced.length).toBe(1);
    expect(enhanced[0].id).toBe(sem.id);
  });

  it("expands neighbors via explicit edges and boosts scores", async () => {
    const sem = await addSemantic({ topic: "TS", content: "typed JS" });
    const ep = await addEpisodic({ event: "learned TS" });

    addEdge({
      source_id: sem.id,
      source_layer: "semantic",
      target_id: ep.id,
      target_layer: "episodic",
      relation: "related_to",
      weight: 0.8,
    });

    const initial: SearchResult[] = [
      { id: sem.id, layer: "semantic", score: 0.5, data: sem },
    ];

    const enhanced = graphEnhanceResults(initial, { useImplicit: false, limit: 10 });

    expect(enhanced.length).toBe(2);

    const epResult = enhanced.find((r) => r.id === ep.id);
    expect(epResult).toBeTruthy();
    expect(epResult!.score).toBeGreaterThan(0);
  });

  it("respects boost factor", async () => {
    const sem = await addSemantic({ topic: "a", content: "content a" });
    const ep = await addEpisodic({ event: "event b" });

    addEdge({
      source_id: sem.id,
      source_layer: "semantic",
      target_id: ep.id,
      target_layer: "episodic",
      relation: "related_to",
      weight: 1.0,
    });

    const initial: SearchResult[] = [
      { id: sem.id, layer: "semantic", score: 1.0, data: sem },
    ];

    const low = graphEnhanceResults(initial, { boost: 0.1, useImplicit: false, limit: 10 });
    const high = graphEnhanceResults(initial, { boost: 0.9, useImplicit: false, limit: 10 });

    const lowScore = low.find((r) => r.id === ep.id)?.score ?? 0;
    const highScore = high.find((r) => r.id === ep.id)?.score ?? 0;
    expect(highScore).toBeGreaterThan(lowScore);
  });

  it("respects limit", async () => {
    const sem = await addSemantic({ topic: "root", content: "root node" });

    for (let i = 0; i < 5; i++) {
      const ep = await addEpisodic({ event: `event ${i}` });
      addEdge({
        source_id: sem.id,
        source_layer: "semantic",
        target_id: ep.id,
        target_layer: "episodic",
        relation: "related_to",
      });
    }

    const initial: SearchResult[] = [
      { id: sem.id, layer: "semantic", score: 1.0, data: sem },
    ];

    const limited = graphEnhanceResults(initial, { limit: 3, useImplicit: false });
    expect(limited.length).toBe(3);
  });

  it("2-hop expansion finds deeper neighbors", async () => {
    const a = await addSemantic({ topic: "A", content: "root" });
    const b = await addEpisodic({ event: "B" });
    const c = await addEpisodic({ event: "C" });

    addEdge({ source_id: a.id, source_layer: "semantic", target_id: b.id, target_layer: "episodic", relation: "related_to" });
    addEdge({ source_id: b.id, source_layer: "episodic", target_id: c.id, target_layer: "episodic", relation: "leads_to" });

    const initial: SearchResult[] = [
      { id: a.id, layer: "semantic", score: 1.0, data: a },
    ];

    const d1 = graphEnhanceResults(initial, { depth: 1, useImplicit: false, limit: 10 });
    const d2 = graphEnhanceResults(initial, { depth: 2, useImplicit: false, limit: 10 });

    expect(d1.find((r) => r.id === c.id)).toBeUndefined();
    expect(d2.find((r) => r.id === c.id)).toBeTruthy();
  });

  it("implicit boost discovers similar memories via vector KNN", async () => {
    const sem = await addSemantic({ topic: "TypeScript", content: "typed JS language" });
    await addSemantic({ topic: "TypeScript basics", content: "typed JS language intro" });
    await addEpisodic({ event: "learned TypeScript language basics" });

    const initial: SearchResult[] = [
      { id: sem.id, layer: "semantic", score: 1.0, data: sem },
    ];

    const enhanced = graphEnhanceResults(initial, {
      useImplicit: true,
      limit: 10,
    });

    expect(enhanced.length).toBeGreaterThanOrEqual(1);
    expect(enhanced[0].id).toBe(sem.id);
  });

  it("implicit boost handles missing embeddings gracefully", async () => {
    const sem = await addSemantic({ topic: "X", content: "content" });

    getDb().prepare("DELETE FROM semantic_vec WHERE memory_id = ?").run(sem.id);

    const initial: SearchResult[] = [
      { id: sem.id, layer: "semantic", score: 1.0, data: sem },
    ];

    const enhanced = graphEnhanceResults(initial, { useImplicit: true, limit: 10 });
    expect(enhanced.length).toBe(1);
    expect(enhanced[0].id).toBe(sem.id);
  });

  it("defaults to useImplicit=true when options not specified", async () => {
    const sem = await addSemantic({ topic: "Test", content: "test content" });
    const initial: SearchResult[] = [
      { id: sem.id, layer: "semantic", score: 0.5, data: sem },
    ];

    const enhanced = graphEnhanceResults(initial);
    expect(enhanced.length).toBeGreaterThanOrEqual(1);
  });

  it("explicit + implicit combined", async () => {
    const sem = await addSemantic({ topic: "root", content: "root content" });
    const ep = await addEpisodic({ event: "linked event" });
    await addRule({ trigger_condition: "root trigger", constraint_text: "do X" });

    addEdge({
      source_id: sem.id,
      source_layer: "semantic",
      target_id: ep.id,
      target_layer: "episodic",
      relation: "related_to",
      weight: 0.9,
    });

    const initial: SearchResult[] = [
      { id: sem.id, layer: "semantic", score: 1.0, data: sem },
    ];

    const enhanced = graphEnhanceResults(initial, { useImplicit: true, limit: 20 });
    expect(enhanced.length).toBeGreaterThanOrEqual(2);
    expect(enhanced.find((r) => r.id === ep.id)).toBeTruthy();
  });

  it("filters by relation type", async () => {
    const sem = await addSemantic({ topic: "a", content: "content" });
    const ep1 = await addEpisodic({ event: "related" });
    const ep2 = await addEpisodic({ event: "caused" });

    addEdge({ source_id: sem.id, source_layer: "semantic", target_id: ep1.id, target_layer: "episodic", relation: "related_to" });
    addEdge({ source_id: sem.id, source_layer: "semantic", target_id: ep2.id, target_layer: "episodic", relation: "caused_by" });

    const initial: SearchResult[] = [
      { id: sem.id, layer: "semantic", score: 1.0, data: sem },
    ];

    const filtered = graphEnhanceResults(initial, {
      relation: "related_to",
      useImplicit: false,
      limit: 10,
    });

    expect(filtered.find((r) => r.id === ep1.id)).toBeTruthy();
    expect(filtered.find((r) => r.id === ep2.id)).toBeUndefined();
  });
});
