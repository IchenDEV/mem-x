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
import { addEpisodic } from "../../src/memory/layers/episodic.js";
import { addSemantic } from "../../src/memory/layers/semantic.js";
import { addRule } from "../../src/memory/layers/rules.js";
import { addShortTerm } from "../../src/memory/layers/short-term.js";
import { addTask } from "../../src/memory/layers/tasks.js";
import { getStats, getTimeline, inspectMemory, listLayerMemories, getHealth } from "../../src/debug/handlers.js";
import { debugSearch } from "../../src/debug/search-debug.js";

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), "mem-x-dh-"));
  state.dataDir = testDir;
  createSchema(getDb(), 4);
});

afterEach(() => {
  closeDb();
  rmSync(testDir, { recursive: true, force: true });
});

describe("getStats", () => {
  it("returns stats for empty db", () => {
    const stats = getStats();
    expect(stats.short_term.total).toBe(0);
    expect(stats.episodic.total).toBe(0);
    expect(stats.semantic.total).toBe(0);
    expect(stats.rules.total).toBe(0);
    expect(stats.tasks.total).toBe(0);
    expect(stats.sessions.total).toBe(0);
    expect(stats.vectors).toBeTruthy();
  });

  it("returns correct counts with data", async () => {
    await addEpisodic({ event: "test" });
    await addSemantic({ topic: "t", content: "c" });
    await addRule({ trigger_condition: "t", constraint_text: "c" });
    await addShortTerm({ content: "temp" });
    addTask({ title: "task" });

    const stats = getStats();
    expect(stats.episodic.total).toBe(1);
    expect(stats.semantic.total).toBe(1);
    expect(stats.semantic.active).toBe(1);
    expect(stats.rules.total).toBe(1);
    expect(stats.short_term.total).toBe(1);
    expect(stats.tasks.total).toBe(1);
    expect(stats.tasks.pending).toBe(1);
  });
});

describe("getTimeline", () => {
  it("returns entries from all layers", async () => {
    await addEpisodic({ event: "ep1" });
    await addSemantic({ topic: "sm1", content: "c" });
    const timeline = getTimeline(10);
    expect(timeline.length).toBe(2);
  });

  it("respects limit", async () => {
    await addEpisodic({ event: "a" });
    await addEpisodic({ event: "b" });
    expect(getTimeline(1).length).toBe(1);
  });
});

describe("inspectMemory", () => {
  it("returns memory with vector status", async () => {
    const ep = await addEpisodic({ event: "test inspect" });
    const result = inspectMemory("episodic", ep.id);
    expect(result).toBeTruthy();
    expect(result!.memory).toBeTruthy();
    expect(result!.has_vector).toBe(true);
  });

  it("returns null for missing id", () => {
    expect(inspectMemory("episodic", "nonexistent")).toBeNull();
  });
});

describe("listLayerMemories", () => {
  it("returns memories for layer", async () => {
    await addEpisodic({ event: "list test" });
    const list = listLayerMemories("episodic", 10);
    expect(list.length).toBe(1);
  });

  it("uses correct order column per layer", async () => {
    await addSemantic({ topic: "t", content: "c" });
    const list = listLayerMemories("semantic", 10);
    expect(list.length).toBe(1);
  });
});

describe("getHealth", () => {
  it("returns ok for healthy db", () => {
    const h = getHealth();
    expect(h.ok).toBe(true);
    expect(h.checks.length).toBeGreaterThan(0);
  });

  it("detects missing vectors", async () => {
    const db = getDb();
    db.prepare("INSERT INTO episodic (id, timestamp, event) VALUES (?, datetime('now'), ?)").run("no-vec", "orphan");
    const h = getHealth();
    const missingCheck = h.checks.find((c) => c.name === "episodic: missing vectors");
    expect(missingCheck?.status).toBe("warn");
    expect(missingCheck?.count).toBeGreaterThan(0);
  });

  it("detects expired short_term", () => {
    const db = getDb();
    db.prepare("INSERT INTO short_term (id, content, created_at_round, expires_at_round) VALUES (?, ?, 0, 0)").run("exp-h", "old");
    const h = getHealth();
    const expCheck = h.checks.find((c) => c.name === "short_term: expired not purged");
    expect(expCheck?.status).toBe("warn");
  });
});

describe("debugSearch", () => {
  beforeEach(async () => {
    await addEpisodic({ event: "learned TypeScript basics", tags: ["typescript"] });
    await addSemantic({ topic: "TypeScript", content: "typed JavaScript superset" });
  });

  it("hybrid mode returns results with score breakdown", async () => {
    const result = await debugSearch("TypeScript", { mode: "hybrid" });
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.bm25_raw).toBeDefined();
    expect(result.vector_raw).toBeDefined();
    if (result.results.length > 0) {
      expect(result.results[0]).toHaveProperty("rrf_score");
      expect(result.results[0]).toHaveProperty("layer");
    }
  });

  it("bm25 mode returns bm25 data only", async () => {
    const result = await debugSearch("TypeScript", { mode: "bm25" });
    expect(result.vector_raw.length).toBe(0);
  });

  it("vector mode returns vector data only", async () => {
    const result = await debugSearch("TypeScript", { mode: "vector" });
    expect(result.bm25_raw.length).toBe(0);
  });

  it("layer filter restricts search", async () => {
    const result = await debugSearch("TypeScript", { layer: "episodic", mode: "bm25" });
    expect(result.results.every((r) => r.layer === "episodic")).toBe(true);
  });
});
