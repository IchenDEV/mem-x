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
import { addShortTerm, getShortTerm, listShortTerm, deleteShortTerm, markPromoted, purgeExpired } from "../../src/memory/layers/short-term.js";
import { addTask, getTask, listTasks, updateTaskStatus } from "../../src/memory/layers/tasks.js";
import { addEpisodic } from "../../src/memory/layers/episodic.js";
import { addSemantic } from "../../src/memory/layers/semantic.js";
import { addRule } from "../../src/memory/layers/rules.js";
import { getMemory, deleteMemory } from "../../src/memory/store.js";

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), "mem-x-ms-"));
  state.dataDir = testDir;
  createSchema(getDb(), 4);
});

afterEach(() => {
  closeDb();
  rmSync(testDir, { recursive: true, force: true });
});

describe("short-term", () => {
  it("add + get + list + delete", async () => {
    const st = await addShortTerm({ content: "temporary note", tags: ["temp"], confidence: 0.7, ttl_rounds: 3 });
    expect(st.content).toBe("temporary note");
    expect(st.promoted).toBe(false);
    expect(st.created_at_round).toBe(0);
    expect(st.expires_at_round).toBe(3);

    expect(getShortTerm(st.id)!.content).toBe("temporary note");
    expect(getShortTerm("nonexistent")).toBeNull();

    const list = listShortTerm({ limit: 10 });
    expect(list.length).toBe(1);

    expect(await deleteShortTerm(st.id)).toBe(true);
    expect(await deleteShortTerm("nonexistent")).toBe(false);
  });

  it("markPromoted", async () => {
    const st = await addShortTerm({ content: "promote me" });
    expect(markPromoted(st.id)).toBe(true);
    expect(getShortTerm(st.id)!.promoted).toBe(true);
    expect(markPromoted("nonexistent")).toBe(false);
  });

  it("excludes expired by default", async () => {
    await addShortTerm({ content: "active" });
    const db = getDb();
    db.prepare("INSERT INTO short_term (id, content, created_at_round, expires_at_round) VALUES (?, ?, 0, 0)").run("expired-1", "old");

    const active = listShortTerm();
    expect(active.every((m) => m.id !== "expired-1")).toBe(true);

    const all = listShortTerm({ include_expired: true });
    expect(all.some((m) => m.id === "expired-1")).toBe(true);
  });

  it("excludes promoted", async () => {
    const st = await addShortTerm({ content: "will be promoted" });
    markPromoted(st.id);
    const list = listShortTerm();
    expect(list.every((m) => m.id !== st.id)).toBe(true);
  });

  it("purgeExpired removes expired unpromoted entries", async () => {
    const db = getDb();
    db.prepare("INSERT INTO short_term (id, content, created_at_round, expires_at_round) VALUES (?, ?, 0, 0)").run("exp-1", "old");
    const embed = async (t: string) => {
      const a = new Float32Array(4);
      for (let i = 0; i < 4; i++) a[i] = Math.sin(t.charCodeAt(i % t.length) + i);
      return a;
    };
    const buf = Buffer.from((await embed("old")).buffer);
    db.prepare("INSERT INTO short_term_vec (memory_id, embedding) VALUES (?, ?)").run("exp-1", buf);

    const purged = purgeExpired();
    expect(purged).toBe(1);
    expect(getShortTerm("exp-1")).toBeNull();
  });
});

describe("tasks", () => {
  it("add + get + list + updateStatus", () => {
    const t = addTask({ title: "Fix bug", description: "urgent fix", priority: "high", tags: ["bug"] });
    expect(t.title).toBe("Fix bug");
    expect(t.status).toBe("pending");
    expect(t.priority).toBe("high");

    expect(getTask(t.id)!.title).toBe("Fix bug");
    expect(getTask("nonexistent")).toBeNull();

    const list = listTasks({ limit: 10 });
    expect(list.length).toBe(1);

    expect(updateTaskStatus(t.id, "done")).toBe(true);
    expect(getTask(t.id)!.status).toBe("done");
    expect(updateTaskStatus("nonexistent", "done")).toBe(false);
  });

  it("listTasks with status filter", () => {
    addTask({ title: "a" });
    const t2 = addTask({ title: "b" });
    updateTaskStatus(t2.id, "in_progress");

    expect(listTasks({ status: "pending" }).length).toBe(1);
    expect(listTasks({ status: "in_progress" }).length).toBe(1);
  });

  it("defaults priority/description", () => {
    const t = addTask({ title: "simple" });
    expect(t.priority).toBe("medium");
    expect(t.description).toBeNull();
  });
});

describe("store dispatch", () => {
  it("getMemory dispatches to correct layer", async () => {
    const ep = await addEpisodic({ event: "test" });
    expect(getMemory("episodic", ep.id)).toBeTruthy();

    const sm = await addSemantic({ topic: "t", content: "c" });
    expect(getMemory("semantic", sm.id)).toBeTruthy();

    const r = await addRule({ trigger_condition: "t", constraint_text: "c" });
    expect(getMemory("rules", r.id)).toBeTruthy();

    const st = await addShortTerm({ content: "temp" });
    expect(getMemory("short_term", st.id)).toBeTruthy();
  });

  it("deleteMemory dispatches to correct layer", async () => {
    const ep = await addEpisodic({ event: "test" });
    expect(await deleteMemory("episodic", ep.id)).toBe(true);
    expect(getMemory("episodic", ep.id)).toBeNull();

    const sm = await addSemantic({ topic: "t", content: "c" });
    expect(await deleteMemory("semantic", sm.id)).toBe(true);

    const r = await addRule({ trigger_condition: "t", constraint_text: "c" });
    expect(await deleteMemory("rules", r.id)).toBe(true);

    const st = await addShortTerm({ content: "temp" });
    expect(await deleteMemory("short_term", st.id)).toBe(true);
  });
});
