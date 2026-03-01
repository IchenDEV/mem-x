import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { state, mockConfig } = vi.hoisted(() => ({
  state: { dbPath: "", dataDir: "" },
  mockConfig: vi.fn(),
}));

vi.mock("../src/utils/config.js", () => ({
  loadConfig: mockConfig,
  saveConfig: vi.fn(),
  setConfigValue: vi.fn(),
}));

vi.mock("../src/utils/bucket.js", () => ({
  getBucket: () => "test",
  setBucket: vi.fn(),
  getBucketDataDir: () => state.dataDir,
}));

import { getDb, closeDb } from "../src/db/connection.js";
import { createSchema, createVecTables } from "../src/db/schema/index.js";
import { getDimensions, initializeDatabase } from "../src/db/migrate.js";
import { getCurrentRound, incrementRound } from "../src/db/rounds.js";
import { MODEL_DIMENSIONS, DEFAULT_DIMENSIONS } from "../src/embedding/provider.js";

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), "mem-x-db-"));
  state.dataDir = testDir;
  state.dbPath = join(testDir, "mem-x.db");
  mockConfig.mockReturnValue({
    embedding: { provider: "openai" as const, model: "text-embedding-3-small" },
    db: { path: state.dbPath },
  });
});

afterEach(() => {
  closeDb();
  rmSync(testDir, { recursive: true, force: true });
});

describe("connection", () => {
  it("getDb creates and returns a database", () => {
    const db = getDb();
    expect(db).toBeTruthy();
    const r = db.prepare("SELECT 1 as n").get() as { n: number };
    expect(r.n).toBe(1);
  });

  it("getDb returns cached instance", () => {
    expect(getDb()).toBe(getDb());
  });

  it("closeDb resets the cache", () => {
    const db1 = getDb();
    closeDb();
    const db2 = getDb();
    expect(db2).not.toBe(db1);
  });
});

describe("schema", () => {
  it("createSchema creates all required tables", () => {
    const db = getDb();
    createSchema(db, 4);

    const tables = (
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type IN ('table','trigger') ORDER BY name",
        )
        .all() as { name: string }[]
    ).map((t) => t.name);

    for (const t of ["metadata", "short_term", "episodic", "semantic", "rules", "tasks", "evolution_log"]) {
      expect(tables).toContain(t);
    }
    for (const t of ["short_term_fts", "episodic_fts", "semantic_fts", "rules_fts"]) {
      expect(tables).toContain(t);
    }
    expect(tables.filter((n) => n.endsWith("_ai")).length).toBeGreaterThanOrEqual(4);
  });

  it("createVecTables creates vec0 virtual tables", () => {
    const db = getDb();
    db.exec("CREATE TABLE IF NOT EXISTS episodic (id TEXT PRIMARY KEY)");
    createVecTables(db, 4);

    const vt = db
      .prepare("SELECT name FROM sqlite_master WHERE name LIKE '%_vec'")
      .all() as { name: string }[];
    expect(vt.map((r) => r.name)).toEqual(
      expect.arrayContaining(["episodic_vec", "semantic_vec", "rules_vec", "short_term_vec"]),
    );
  });
});

describe("migrate", () => {
  it("getDimensions returns correct value for known model", () => {
    expect(getDimensions()).toBe(1536);
  });

  it("getDimensions returns default for unknown model", () => {
    mockConfig.mockReturnValue({
      embedding: { provider: "openai" as const, model: "unknown-xyz" },
      db: { path: state.dbPath },
    });
    expect(getDimensions()).toBe(DEFAULT_DIMENSIONS);
  });

  it("initializeDatabase creates schema", () => {
    closeDb();
    state.dataDir = join(testDir, "init-sub");
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    initializeDatabase();
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("Database initialized"));
    spy.mockRestore();
    closeDb();
    state.dataDir = testDir;
  });
});

describe("rounds", () => {
  it("getCurrentRound returns 0 when no counter exists", () => {
    const db = getDb();
    createSchema(db, 4);
    expect(getCurrentRound()).toBe(0);
  });

  it("incrementRound increments and returns new value", () => {
    const db = getDb();
    createSchema(db, 4);
    expect(incrementRound()).toBe(1);
    expect(incrementRound()).toBe(2);
    expect(getCurrentRound()).toBe(2);
  });
});

describe("provider constants", () => {
  it("MODEL_DIMENSIONS contains known models", () => {
    expect(MODEL_DIMENSIONS["text-embedding-3-small"]).toBe(1536);
    expect(MODEL_DIMENSIONS["bge-m3"]).toBe(1024);
    expect(MODEL_DIMENSIONS["nomic-embed-text"]).toBe(768);
    expect(MODEL_DIMENSIONS["all-minilm"]).toBe(384);
  });
});
