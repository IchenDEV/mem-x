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
import { findSimilarById, findSimilarByEmbedding, autoLink } from "../../src/graph/auto-link.js";
import { listEdges } from "../../src/graph/edges.js";

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), "mem-x-ga-"));
  state.dataDir = testDir;
  createSchema(getDb(), 4);
});

afterEach(() => {
  closeDb();
  rmSync(testDir, { recursive: true, force: true });
});

describe("findSimilarByEmbedding", () => {
  it("finds similar memories across layers", async () => {
    await addSemantic({ topic: "TypeScript", content: "typed JS language" });
    await addEpisodic({ event: "learned TypeScript basics" });

    const embedding = new Float32Array(4);
    for (let i = 0; i < 4; i++) embedding[i] = Math.sin("TypeScript".charCodeAt(i % 10) + i);

    const candidates = findSimilarByEmbedding(Buffer.from(embedding.buffer), {
      threshold: 0.0,
    });

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].similarity).toBeGreaterThan(0);
    expect(candidates[0].layer).toBeTruthy();
  });

  it("excludes specified IDs", async () => {
    const sem = await addSemantic({ topic: "test", content: "content" });

    const embedding = new Float32Array(4);
    for (let i = 0; i < 4; i++) embedding[i] = Math.sin("test".charCodeAt(i % 4) + i);

    const without = findSimilarByEmbedding(Buffer.from(embedding.buffer), {
      excludeIds: new Set([sem.id]),
      threshold: 0.0,
    });
    expect(without.every((c) => c.id !== sem.id)).toBe(true);
  });

  it("respects threshold", async () => {
    await addSemantic({ topic: "alpha", content: "alpha content" });

    const embedding = new Float32Array(4);
    for (let i = 0; i < 4; i++) embedding[i] = Math.sin("zzzzz".charCodeAt(i % 5) + i);

    const strict = findSimilarByEmbedding(Buffer.from(embedding.buffer), {
      threshold: 0.999,
    });
    expect(strict.length).toBe(0);
  });
});

describe("findSimilarById", () => {
  it("finds similar memories for a given memory", async () => {
    const sem1 = await addSemantic({ topic: "TypeScript", content: "typed JS" });
    await addSemantic({ topic: "TypeScript basics", content: "typed JS intro" });
    await addEpisodic({ event: "learned TypeScript basics" });

    const candidates = await findSimilarById(sem1.id, "semantic", {
      threshold: 0.0,
      limit: 20,
    });

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every((c) => c.id !== sem1.id)).toBe(true);
  });

  it("returns empty if memory has no embedding", async () => {
    const candidates = await findSimilarById("nonexistent", "semantic");
    expect(candidates).toEqual([]);
  });
});

describe("autoLink", () => {
  it("creates similar_to edges for similar memories", async () => {
    await addSemantic({ topic: "TypeScript", content: "typed JS language" });
    await addSemantic({ topic: "TypeScript", content: "typed JS language again" });

    const created = await autoLink({ threshold: 0.0 });

    expect(created.length).toBeGreaterThan(0);
    expect(created[0].relation).toBe("similar_to");

    const edges = listEdges({ relation: "similar_to" });
    expect(edges.length).toBe(created.length);
  });

  it("does not duplicate existing edges", async () => {
    await addSemantic({ topic: "a", content: "same content" });
    await addSemantic({ topic: "b", content: "same content" });

    const first = await autoLink({ threshold: 0.0 });
    const second = await autoLink({ threshold: 0.0 });

    expect(second.length).toBe(0);
    expect(listEdges().length).toBe(first.length);
  });
});
