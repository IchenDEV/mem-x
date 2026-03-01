import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { generateId } from "../utils/id.js";
import { getBucketDataDir } from "../utils/bucket.js";
import type { SessionData, SessionEntry } from "./types.js";

function getSessionsDir(): string {
  const dir = resolve(getBucketDataDir(), "sessions");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function sessionPath(sessionId: string): string {
  return resolve(getSessionsDir(), `${sessionId}.json`);
}

function readSession(sessionId: string): SessionData | null {
  const p = sessionPath(sessionId);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf-8")) as SessionData;
}

function writeSession(session: SessionData): void {
  writeFileSync(sessionPath(session.id), JSON.stringify(session, null, 2) + "\n");
}

export function startSession(): SessionData {
  const session: SessionData = {
    id: generateId(),
    started_at: new Date().toISOString(),
    ended_at: null,
    entries: [],
  };
  writeSession(session);
  return session;
}

export function addEntry(sessionId: string, content: string, tags: string[] = []): SessionEntry {
  const session = readSession(sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);
  if (session.ended_at) throw new Error(`Session already ended: ${sessionId}`);

  const entry: SessionEntry = {
    id: generateId(),
    content,
    tags,
    timestamp: new Date().toISOString(),
  };
  session.entries.push(entry);
  writeSession(session);
  return entry;
}

export function endSession(sessionId: string): SessionData {
  const session = readSession(sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);
  session.ended_at = new Date().toISOString();
  writeSession(session);
  return session;
}

export function getSession(sessionId: string): SessionData | null {
  return readSession(sessionId);
}

export function listSessions(opts?: { limit?: number }): SessionData[] {
  const dir = getSessionsDir();
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));

  const sessions = files
    .map((f) => JSON.parse(readFileSync(resolve(dir, f), "utf-8")) as SessionData)
    .sort((a, b) => b.started_at.localeCompare(a.started_at));

  return opts?.limit ? sessions.slice(0, opts.limit) : sessions;
}
