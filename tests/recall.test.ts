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
import { addRule } from "../src/memory/layers/rules.js";
import { addTask } from "../src/memory/layers/tasks.js";
import { addShortTerm } from "../src/memory/layers/short-term.js";
import { addSemantic } from "../src/memory/layers/semantic.js";
import { addEpisodic } from "../src/memory/layers/episodic.js";
import { recall, formatRecall } from "../src/memory/recall.js";
import { addEdge } from "../src/graph/edges.js";

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), "mem-x-recall-"));
  state.dataDir = testDir;
  createSchema(getDb(), 4);
});

afterEach(() => {
  closeDb();
  rmSync(testDir, { recursive: true, force: true });
});

describe("recall", () => {
  it("returns empty context when no data", () => {
    const ctx = recall();
    expect(ctx.rules).toEqual([]);
    expect(ctx.tasks).toEqual([]);
    expect(ctx.short_term).toEqual([]);
    expect(ctx.semantic).toEqual([]);
    expect(ctx.episodic).toEqual([]);
    expect(ctx.edges).toEqual([]);
  });

  it("aggregates all layers", async () => {
    await addRule({ trigger_condition: "When writing TS", constraint_text: "Use functional style" });
    addTask({ title: "Fix bug", priority: "high" });
    await addShortTerm({ content: "User likes dark mode" });
    await addSemantic({ topic: "Tech stack", content: "Node.js + TypeScript" });
    await addEpisodic({ event: "Migrated to bun", context: "tooling" });

    const ctx = recall();
    expect(ctx.rules.length).toBe(1);
    expect(ctx.tasks.length).toBe(1);
    expect(ctx.short_term.length).toBe(1);
    expect(ctx.semantic.length).toBe(1);
    expect(ctx.episodic.length).toBe(1);

    expect(ctx.rules[0].trigger_condition).toBe("When writing TS");
    expect(ctx.tasks[0].title).toBe("Fix bug");
    expect(ctx.short_term[0].content).toBe("User likes dark mode");
    expect(ctx.semantic[0].topic).toBe("Tech stack");
    expect(ctx.episodic[0].event).toBe("Migrated to bun");
  });

  it("respects limit parameter", async () => {
    for (let i = 0; i < 5; i++) {
      await addShortTerm({ content: `item ${i}` });
    }
    const ctx = recall(3);
    expect(ctx.short_term.length).toBe(3);
  });

  it("only returns pending tasks", async () => {
    const task = addTask({ title: "Done task" });
    const { updateTaskStatus } = await import("../src/memory/layers/tasks.js");
    updateTaskStatus(task.id, "done");
    addTask({ title: "Pending task" });

    const ctx = recall();
    expect(ctx.tasks.length).toBe(1);
    expect(ctx.tasks[0].title).toBe("Pending task");
  });
});

describe("formatRecall", () => {
  it("returns empty message when no data", () => {
    const ctx = recall();
    const output = formatRecall(ctx);
    expect(output).toBe("No memories found. This is a fresh start.");
  });

  it("formats all sections", async () => {
    await addRule({ trigger_condition: "When coding", constraint_text: "No classes" });
    addTask({ title: "Review PR", priority: "high" });
    await addShortTerm({ content: "Prefers Tailwind" });
    await addSemantic({ topic: "Auth", content: "Uses JWT" });
    await addEpisodic({ event: "Setup CI", result: "Passed" });

    const ctx = recall();
    const output = formatRecall(ctx);

    expect(output).toContain("## Rules (1)");
    expect(output).toContain("When coding");
    expect(output).toContain("No classes");

    expect(output).toContain("## Pending Tasks (1)");
    expect(output).toContain("Review PR");

    expect(output).toContain("## Recent (Short-term) (1)");
    expect(output).toContain("Prefers Tailwind");
    expect(output).toContain("rounds left");

    expect(output).toContain("## Knowledge (Semantic) (1)");
    expect(output).toContain("**Auth**");
    expect(output).toContain("Uses JWT");

    expect(output).toContain("## Events (Episodic) (1)");
    expect(output).toContain("**Setup CI**");
    expect(output).toContain("Passed");
  });

  it("omits empty sections", async () => {
    await addRule({ trigger_condition: "Test", constraint_text: "Test" });

    const ctx = recall();
    const output = formatRecall(ctx);

    expect(output).toContain("## Rules");
    expect(output).not.toContain("## Pending Tasks");
    expect(output).not.toContain("## Recent");
    expect(output).not.toContain("## Knowledge");
    expect(output).not.toContain("## Events");
    expect(output).not.toContain("## Graph");
  });

  it("formats graph section when edges exist", async () => {
    const sem = await addSemantic({ topic: "TS", content: "typed JS" });
    const ep = await addEpisodic({ event: "learned TS" });
    addEdge({
      source_id: sem.id,
      source_layer: "semantic",
      target_id: ep.id,
      target_layer: "episodic",
      relation: "related_to",
    });

    const ctx = recall();
    const output = formatRecall(ctx);

    expect(output).toContain("## Graph (1 edges)");
    expect(output).toContain("--[related_to]-->");
    expect(output).toContain("(semantic)");
    expect(output).toContain("(episodic)");
  });
});
