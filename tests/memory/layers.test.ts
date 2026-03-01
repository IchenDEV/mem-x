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
import { addEpisodic, getEpisodic, listEpisodic, deleteEpisodic } from "../../src/memory/layers/episodic.js";
import { addSemantic, getSemantic, listSemantic, deleteSemantic } from "../../src/memory/layers/semantic.js";
import { addRule, getRule, listRules, deleteRule } from "../../src/memory/layers/rules.js";

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), "mem-x-ml-"));
  state.dataDir = testDir;
  createSchema(getDb(), 4);
});

afterEach(() => {
  closeDb();
  rmSync(testDir, { recursive: true, force: true });
});

describe("episodic", () => {
  it("add + get + list + delete", async () => {
    const ep = await addEpisodic({ event: "learned vitest", context: "testing", result: "success", tags: ["test"], confidence: 0.9 });
    expect(ep.id).toBeTruthy();
    expect(ep.event).toBe("learned vitest");
    expect(ep.tags).toEqual(["test"]);
    expect(ep.confidence).toBe(0.9);

    expect(getEpisodic(ep.id)).toEqual(ep);
    expect(getEpisodic("nonexistent")).toBeNull();

    const list = listEpisodic({ limit: 10 });
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(ep.id);

    expect(await deleteEpisodic(ep.id)).toBe(true);
    expect(await deleteEpisodic("nonexistent")).toBe(false);
    expect(getEpisodic(ep.id)).toBeNull();
  });

  it("custom timestamp + since filter", async () => {
    await addEpisodic({ event: "old", timestamp: "2020-01-01T00:00:00Z" });
    await addEpisodic({ event: "new", timestamp: "2025-06-01T00:00:00Z" });

    const filtered = listEpisodic({ since: "2024-01-01T00:00:00Z" });
    expect(filtered.length).toBe(1);
    expect(filtered[0].event).toBe("new");
  });

  it("defaults confidence to 1.0", async () => {
    const ep = await addEpisodic({ event: "test" });
    expect(ep.confidence).toBe(1.0);
  });
});

describe("semantic", () => {
  it("add + get + list + delete", async () => {
    const sm = await addSemantic({ topic: "TypeScript", content: "typed JS", sources: ["docs"], tags: ["lang"], confidence: 0.8 });
    expect(sm.topic).toBe("TypeScript");
    expect(sm.sources).toEqual(["docs"]);

    expect(getSemantic(sm.id)).toEqual(sm);
    expect(getSemantic("nonexistent")).toBeNull();

    const list = listSemantic({ limit: 10 });
    expect(list.length).toBe(1);

    expect(await deleteSemantic(sm.id)).toBe(true);
    expect(await deleteSemantic("nonexistent")).toBe(false);
  });

  it("listSemantic with since filter", async () => {
    await addSemantic({ topic: "a", content: "old" });
    const list = listSemantic({ since: "2099-01-01T00:00:00Z" });
    expect(list.length).toBe(0);
  });

  it("defaults sources and tags", async () => {
    const sm = await addSemantic({ topic: "t", content: "c" });
    expect(sm.sources).toEqual([]);
    expect(sm.tags).toEqual([]);
  });
});

describe("rules", () => {
  it("add + get + list + delete", async () => {
    const r = await addRule({ trigger_condition: "writing TS", constraint_text: "use strict", reason: "safety", confidence: 0.95 });
    expect(r.trigger_condition).toBe("writing TS");
    expect(r.verified).toBe(false);

    expect(getRule(r.id)!.constraint_text).toBe("use strict");
    expect(getRule("nonexistent")).toBeNull();

    const list = listRules({ limit: 10 });
    expect(list.length).toBe(1);

    expect(await deleteRule(r.id)).toBe(true);
    expect(await deleteRule("nonexistent")).toBe(false);
  });

  it("defaults reason/source to null", async () => {
    const r = await addRule({ trigger_condition: "t", constraint_text: "c" });
    expect(r.reason).toBeNull();
    expect(r.source).toBeNull();
  });
});
