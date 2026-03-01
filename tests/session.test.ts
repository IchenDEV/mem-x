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

import { startSession, addEntry, endSession, getSession, listSessions } from "../src/memory/session.js";

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), "mem-x-s-"));
  state.dataDir = testDir;
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("session", () => {
  it("startSession creates a new session", () => {
    const s = startSession();
    expect(s.id).toBeTruthy();
    expect(s.started_at).toBeTruthy();
    expect(s.ended_at).toBeNull();
    expect(s.entries).toEqual([]);
  });

  it("addEntry adds entry to session", () => {
    const s = startSession();
    const entry = addEntry(s.id, "learned something", ["tag1"]);
    expect(entry.content).toBe("learned something");
    expect(entry.tags).toEqual(["tag1"]);

    const loaded = getSession(s.id)!;
    expect(loaded.entries.length).toBe(1);
    expect(loaded.entries[0].content).toBe("learned something");
  });

  it("addEntry defaults tags to empty array", () => {
    const s = startSession();
    const entry = addEntry(s.id, "no tags");
    expect(entry.tags).toEqual([]);
  });

  it("addEntry throws for missing session", () => {
    expect(() => addEntry("nonexistent", "test")).toThrow("Session not found");
  });

  it("addEntry throws for ended session", () => {
    const s = startSession();
    endSession(s.id);
    expect(() => addEntry(s.id, "late entry")).toThrow("Session already ended");
  });

  it("endSession sets ended_at", () => {
    const s = startSession();
    const ended = endSession(s.id);
    expect(ended.ended_at).toBeTruthy();
  });

  it("endSession throws for missing session", () => {
    expect(() => endSession("nonexistent")).toThrow("Session not found");
  });

  it("getSession returns null for missing", () => {
    expect(getSession("nonexistent")).toBeNull();
  });

  it("getSession returns session data", () => {
    const s = startSession();
    const loaded = getSession(s.id);
    expect(loaded).toEqual(s);
  });

  it("listSessions returns sorted by started_at desc", () => {
    startSession();
    startSession();
    const list = listSessions();
    expect(list.length).toBe(2);
    expect(list[0].started_at >= list[1].started_at).toBe(true);
  });

  it("listSessions respects limit", () => {
    startSession();
    startSession();
    startSession();
    expect(listSessions({ limit: 2 }).length).toBe(2);
  });

  it("listSessions returns all when no limit", () => {
    startSession();
    startSession();
    expect(listSessions().length).toBe(2);
  });
});
