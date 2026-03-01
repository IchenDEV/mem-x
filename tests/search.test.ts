import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { state } = vi.hoisted(() => ({ state: { dataDir: "" } }));

vi.mock("../src/utils/bucket.js", () => ({
  getBucket: () => "test",
  setBucket: vi.fn(),
  getBucketDataDir: () => state.dataDir,
}));

vi.mock("../src/embedding/factory.js", () => {
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

import { getDb, closeDb } from "../src/db/connection.js";
import { createSchema } from "../src/db/schema/index.js";
import { addEpisodic } from "../src/memory/layers/episodic.js";
import { addSemantic } from "../src/memory/layers/semantic.js";
import { addRule } from "../src/memory/layers/rules.js";
import { addShortTerm } from "../src/memory/layers/short-term.js";
import { searchBM25, searchVec, mergeRRF, fetchRows, search, prepareFtsQuery } from "../src/memory/search.js";
import { SEARCH_LAYERS, RRF_K } from "../src/memory/types.js";

let testDir: string;

beforeEach(async () => {
  testDir = mkdtempSync(join(tmpdir(), "mem-x-sr-"));
  state.dataDir = testDir;
  createSchema(getDb(), 4);

  await addEpisodic({ event: "learned TypeScript basics", tags: ["typescript", "learning"] });
  await addSemantic({ topic: "TypeScript", content: "A typed superset of JavaScript" });
  await addRule({ trigger_condition: "writing TypeScript", constraint_text: "use strict mode" });
  await addShortTerm({ content: "TypeScript is great for large projects" });
});

afterEach(() => {
  closeDb();
  rmSync(testDir, { recursive: true, force: true });
});

describe("searchBM25", () => {
  it("returns matching results with rank", () => {
    const results = searchBM25("episodic", "TypeScript", 10);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toHaveProperty("id");
    expect(results[0]).toHaveProperty("rank");
  });

  it("returns empty for no match", () => {
    const results = searchBM25("episodic", "zzzznonexistentzzz", 10);
    expect(results.length).toBe(0);
  });

  it("returns empty when all terms are too short", () => {
    const results = searchBM25("episodic", "TS js", 10);
    expect(results.length).toBe(0);
  });
});

describe("prepareFtsQuery", () => {
  it("joins terms with AND", () => {
    expect(prepareFtsQuery("TypeScript basics")).toBe("TypeScript AND basics");
  });

  it("filters terms shorter than 3 chars", () => {
    expect(prepareFtsQuery("TS is great")).toBe("great");
  });

  it("returns null when no valid terms", () => {
    expect(prepareFtsQuery("TS js")).toBeNull();
  });

  it("filters FTS operators", () => {
    expect(prepareFtsQuery("NOT bad AND good")).toBe("bad AND good");
  });

  it("handles Chinese text", () => {
    expect(prepareFtsQuery("函数式编程 TypeScript")).toBe("函数式编程 AND TypeScript");
  });
});

describe("BM25 Chinese support (trigram)", () => {
  beforeEach(async () => {
    await addSemantic({ topic: "函数式编程", content: "使用纯函数和不可变数据结构进行编程" });
    await addEpisodic({ event: "学习了 SQLite 向量搜索的实现方案" });
    await addRule({ trigger_condition: "编写代码时", constraint_text: "保持单文件不超过150行" });
  });

  it("matches Chinese content with BM25", () => {
    const results = searchBM25("semantic", "函数式编程", 10);
    expect(results.length).toBeGreaterThan(0);
  });

  it("matches Chinese substring in episodic", () => {
    const results = searchBM25("episodic", "向量搜索", 10);
    expect(results.length).toBeGreaterThan(0);
  });

  it("matches Chinese in rules", () => {
    const results = searchBM25("rules", "编写代码", 10);
    expect(results.length).toBeGreaterThan(0);
  });

  it("hybrid search works with Chinese queries", async () => {
    const results = await search("函数式编程", { mode: "hybrid" });
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.layer === "semantic")).toBe(true);
  });

  it("bm25-only search works with Chinese", async () => {
    const results = await search("向量搜索", { mode: "bm25" });
    expect(results.length).toBeGreaterThan(0);
  });
});

describe("searchVec", () => {
  it("returns matching results with distance", () => {
    const embedding = new Float32Array(4).fill(0.5);
    const buf = Buffer.from(embedding.buffer);
    const results = searchVec("episodic", buf, 10);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toHaveProperty("distance");
  });
});

describe("mergeRRF", () => {
  it("combines BM25 and vec results", () => {
    const scores = mergeRRF([{ id: "a" }, { id: "b" }], [{ id: "b" }, { id: "c" }]);
    expect(scores.get("b")!).toBeGreaterThan(scores.get("a")!);
    expect(scores.get("b")!).toBeGreaterThan(scores.get("c")!);
  });

  it("handles empty inputs", () => {
    expect(mergeRRF([], []).size).toBe(0);
    expect(mergeRRF([{ id: "a" }], []).get("a")).toBeCloseTo(1 / (RRF_K + 1));
  });
});

describe("fetchRows", () => {
  it("fetches rows by ids", async () => {
    const ep = await addEpisodic({ event: "fetch test" });
    const rows = fetchRows("episodic", [ep.id]);
    expect(rows.size).toBe(1);
    expect(rows.get(ep.id)).toBeTruthy();
  });

  it("returns empty map for empty ids", () => {
    expect(fetchRows("episodic", []).size).toBe(0);
  });

  it("filters expired short_term entries", () => {
    const db = getDb();
    db.prepare("INSERT INTO short_term (id, content, created_at_round, expires_at_round) VALUES (?, ?, 0, 0)").run("exp-x", "old");
    const rows = fetchRows("short_term", ["exp-x"]);
    expect(rows.size).toBe(0);
  });
});

describe("search (integration)", () => {
  it("hybrid mode returns results from multiple layers", async () => {
    const results = await search("TypeScript");
    expect(results.length).toBeGreaterThan(0);
  });

  it("bm25 mode returns results", async () => {
    const results = await search("TypeScript", { mode: "bm25" });
    expect(results.length).toBeGreaterThan(0);
  });

  it("vector mode returns results", async () => {
    const results = await search("TypeScript", { mode: "vector" });
    expect(results.length).toBeGreaterThan(0);
  });

  it("layer filter restricts results", async () => {
    const results = await search("TypeScript", { layer: "episodic" });
    expect(results.every((r) => r.layer === "episodic")).toBe(true);
  });

  it("respects limit", async () => {
    const results = await search("TypeScript", { limit: 1 });
    expect(results.length).toBeLessThanOrEqual(1);
  });

  it("results are sorted by score desc", async () => {
    const results = await search("TypeScript");
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });
});

describe("constants", () => {
  it("SEARCH_LAYERS has correct order", () => {
    expect(SEARCH_LAYERS).toEqual(["rules", "short_term", "semantic", "episodic"]);
  });

  it("RRF_K is 60", () => {
    expect(RRF_K).toBe(60);
  });
});
