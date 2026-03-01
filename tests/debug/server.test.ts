import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";

process.setMaxListeners(30);

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
import { addTask } from "../../src/memory/layers/tasks.js";
import { startDebugServer } from "../../src/debug/server.js";

let testDir: string;
let server: Server;
let port: number;

beforeEach(async () => {
  testDir = mkdtempSync(join(tmpdir(), "mem-x-ds-"));
  state.dataDir = testDir;
  createSchema(getDb(), 4);

  vi.spyOn(console, "log").mockImplementation(() => {});
  await addEpisodic({ event: "server test event" });
  addTask({ title: "server test task" });

  server = startDebugServer(0);
  await new Promise<void>((resolve) => {
    server.once("listening", resolve);
  });
  const addr = server.address() as { port: number };
  port = addr.port;
});

afterEach(() => {
  closeDb();
  rmSync(testDir, { recursive: true, force: true });
  return new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("debug server HTTP", () => {
  it("GET / returns dashboard HTML", async () => {
    const res = await fetch(`http://localhost:${port}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  it("GET /api/stats returns JSON", async () => {
    const res = await fetch(`http://localhost:${port}/api/stats`);
    const data = await res.json();
    expect(data.episodic).toBeTruthy();
    expect(data.episodic.total).toBe(1);
  });

  it("GET /api/timeline returns entries", async () => {
    const res = await fetch(`http://localhost:${port}/api/timeline?limit=5`);
    const data = await res.json();
    expect(data.length).toBeGreaterThan(0);
  });

  it("GET /api/health returns checks", async () => {
    const data = await (await fetch(`http://localhost:${port}/api/health`)).json();
    expect(data.checks).toBeTruthy();
  });

  it("GET /api/sessions returns sessions list", async () => {
    const data = await (await fetch(`http://localhost:${port}/api/sessions`)).json();
    expect(Array.isArray(data)).toBe(true);
  });

  it("GET /api/tasks returns tasks list", async () => {
    const data = await (await fetch(`http://localhost:${port}/api/tasks`)).json();
    expect(data.length).toBe(1);
  });

  it("GET /api/sessions/:id returns 404 for missing", async () => {
    const res = await fetch(`http://localhost:${port}/api/sessions/nonexistent`);
    expect(res.status).toBe(404);
  });

  it("GET /api/memories/:layer returns memories", async () => {
    const data = await (await fetch(`http://localhost:${port}/api/memories/episodic`)).json();
    expect(data.length).toBe(1);
  });

  it("GET /api/memories/:layer returns 400 for invalid layer", async () => {
    const res = await fetch(`http://localhost:${port}/api/memories/invalid`);
    expect(res.status).toBe(400);
  });

  it("GET /api/inspect/:layer/:id returns memory", async () => {
    const memories = await (await fetch(`http://localhost:${port}/api/memories/episodic`)).json();
    const id = memories[0].id;
    const data = await (await fetch(`http://localhost:${port}/api/inspect/episodic/${id}`)).json();
    expect(data.memory).toBeTruthy();
    expect(data.has_vector).toBe(true);
  });

  it("GET /api/inspect/:layer/:id returns 400 for invalid layer", async () => {
    const res = await fetch(`http://localhost:${port}/api/inspect/badlayer/someid`);
    expect(res.status).toBe(400);
  });

  it("GET /api/inspect/:layer/:id returns 404 for missing", async () => {
    const res = await fetch(`http://localhost:${port}/api/inspect/episodic/nonexistent`);
    expect(res.status).toBe(404);
  });

  it("DELETE /api/memories/:layer/:id deletes memory", async () => {
    const memories = await (await fetch(`http://localhost:${port}/api/memories/episodic`)).json();
    const id = memories[0].id;
    const res = await fetch(`http://localhost:${port}/api/memories/episodic/${id}`, { method: "DELETE" });
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  it("DELETE /api/memories/:layer/:id returns 400 for invalid layer", async () => {
    const res = await fetch(`http://localhost:${port}/api/memories/invalid/someid`, { method: "DELETE" });
    expect(res.status).toBe(400);
  });

  it("GET /api/search returns search results", async () => {
    const data = await (await fetch(`http://localhost:${port}/api/search?q=test&mode=bm25`)).json();
    expect(data.results).toBeDefined();
  });

  it("OPTIONS returns 204", async () => {
    const res = await fetch(`http://localhost:${port}/api/stats`, { method: "OPTIONS" });
    expect(res.status).toBe(204);
  });

  it("unknown route returns 404", async () => {
    const res = await fetch(`http://localhost:${port}/api/nonexistent`);
    expect(res.status).toBe(404);
  });
});
