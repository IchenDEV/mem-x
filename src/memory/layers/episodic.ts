import { getDb } from "../../db/connection.js";
import { generateId } from "../../utils/id.js";
import type { EpisodicMemory } from "../types.js";
import { parseTags, serializeTags, toEmbeddingText, insertVec, deleteVec } from "../helpers.js";

export interface AddEpisodicInput {
  event: string;
  context?: string;
  result?: string;
  tags?: string[];
  confidence?: number;
  timestamp?: string;
}

export async function addEpisodic(input: AddEpisodicInput): Promise<EpisodicMemory> {
  const db = getDb();
  const id = generateId();
  const timestamp = input.timestamp ?? new Date().toISOString();
  const tags = input.tags ?? [];

  db.prepare(
    `INSERT INTO episodic (id, timestamp, context, event, result, tags, confidence)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    timestamp,
    input.context ?? null,
    input.event,
    input.result ?? null,
    serializeTags(tags),
    input.confidence ?? 1.0,
  );

  await insertVec("episodic", id, toEmbeddingText("episodic", { ...input }));
  return getEpisodic(id)!;
}

export function getEpisodic(id: string): EpisodicMemory | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM episodic WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  if (!row) return null;
  return {
    ...row,
    tags: parseTags(row.tags as string),
    promoted: row.promoted === 1,
  } as unknown as EpisodicMemory;
}

export function listEpisodic(opts?: {
  since?: string;
  limit?: number;
}): EpisodicMemory[] {
  const db = getDb();
  let sql = "SELECT * FROM episodic";
  const params: unknown[] = [];
  if (opts?.since) {
    sql += " WHERE timestamp >= ?";
    params.push(opts.since);
  }
  sql += " ORDER BY timestamp DESC";
  if (opts?.limit) {
    sql += " LIMIT ?";
    params.push(opts.limit);
  }
  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
  return rows.map((r) => ({
    ...r,
    tags: parseTags(r.tags as string),
    promoted: r.promoted === 1,
  })) as unknown as EpisodicMemory[];
}

export async function deleteEpisodic(id: string): Promise<boolean> {
  const db = getDb();
  const result = db.prepare("DELETE FROM episodic WHERE id = ?").run(id);
  if (result.changes > 0) {
    await deleteVec("episodic", id);
    return true;
  }
  return false;
}
