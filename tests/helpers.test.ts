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
import { parseTags, serializeTags, toEmbeddingText, insertVec, deleteVec, hydrateRow } from "../src/memory/helpers.js";

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), "mem-x-h-"));
  state.dataDir = testDir;
  createSchema(getDb(), 4);
});

afterEach(() => {
  closeDb();
  rmSync(testDir, { recursive: true, force: true });
});

describe("parseTags", () => {
  it("returns empty for null", () => expect(parseTags(null)).toEqual([]));
  it("returns empty for invalid JSON", () => expect(parseTags("not-json")).toEqual([]));
  it("parses valid JSON array", () => expect(parseTags('["a","b"]')).toEqual(["a", "b"]));
});

describe("serializeTags", () => {
  it("serializes array to JSON string", () => expect(serializeTags(["x", "y"])).toBe('["x","y"]'));
});

describe("toEmbeddingText", () => {
  it("short_term returns content", () => expect(toEmbeddingText("short_term", { content: "hello" })).toBe("hello"));
  it("episodic joins event+result+context", () => expect(toEmbeddingText("episodic", { event: "a", result: "b", context: "c" })).toBe("a b c"));
  it("semantic joins topic+content", () => expect(toEmbeddingText("semantic", { topic: "t", content: "c" })).toBe("t c"));
  it("rules joins trigger+constraint+reason", () => expect(toEmbeddingText("rules", { trigger_condition: "a", constraint_text: "b", reason: "c" })).toBe("a b c"));
  it("filters out falsy values", () => expect(toEmbeddingText("episodic", { event: "a" })).toBe("a"));
});

describe("insertVec / deleteVec", () => {
  it("inserts and deletes vector", async () => {
    const db = getDb();
    db.prepare("INSERT INTO episodic (id, timestamp, event) VALUES (?, datetime('now'), ?)").run("v1", "test");

    await insertVec("episodic", "v1", "test");
    const c = (db.prepare("SELECT COUNT(*) as c FROM episodic_vec WHERE memory_id = ?").get("v1") as { c: number }).c;
    expect(c).toBe(1);

    await deleteVec("episodic", "v1");
    const c2 = (db.prepare("SELECT COUNT(*) as c FROM episodic_vec WHERE memory_id = ?").get("v1") as { c: number }).c;
    expect(c2).toBe(0);
  });
});

describe("hydrateRow", () => {
  it("converts tags from JSON string to array", () => {
    const r = hydrateRow("episodic", { id: "1", tags: '["a"]' });
    expect((r as any).tags).toEqual(["a"]);
  });

  it("converts promoted 1 to true", () => {
    const r = hydrateRow("short_term", { id: "1", tags: "[]", promoted: 1 });
    expect((r as any).promoted).toBe(true);
  });

  it("converts promoted 0 to false", () => {
    const r = hydrateRow("short_term", { id: "1", tags: "[]", promoted: 0 });
    expect((r as any).promoted).toBe(false);
  });

  it("converts verified 1 to true", () => {
    const r = hydrateRow("rules", { id: "1", verified: 1 });
    expect((r as any).verified).toBe(true);
  });

  it("converts sources from JSON string", () => {
    const r = hydrateRow("semantic", { id: "1", tags: "[]", sources: '["s1"]' });
    expect((r as any).sources).toEqual(["s1"]);
  });
});
