import { getDb } from "../../db/connection.js";
import { generateId } from "../../utils/id.js";
import type { SemanticMemory } from "../types.js";
import { parseTags, serializeTags, toEmbeddingText, insertVec, deleteVec } from "../helpers.js";

export interface AddSemanticInput {
  topic: string;
  content: string;
  sources?: string[];
  tags?: string[];
  confidence?: number;
}

export async function addSemantic(input: AddSemanticInput): Promise<SemanticMemory> {
  const db = getDb();
  const id = generateId();

  db.prepare(
    `INSERT INTO semantic (id, topic, content, sources, tags, confidence)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.topic,
    input.content,
    JSON.stringify(input.sources ?? []),
    serializeTags(input.tags ?? []),
    input.confidence ?? 1.0,
  );

  await insertVec("semantic", id, toEmbeddingText("semantic", { ...input }));
  return getSemantic(id)!;
}

export function getSemantic(id: string): SemanticMemory | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM semantic WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  if (!row) return null;
  return {
    ...row,
    tags: parseTags(row.tags as string),
    sources: parseTags(row.sources as string),
  } as unknown as SemanticMemory;
}

export function listSemantic(opts?: {
  since?: string;
  limit?: number;
}): SemanticMemory[] {
  const db = getDb();
  let sql = "SELECT * FROM semantic WHERE status = 'active'";
  const params: unknown[] = [];
  if (opts?.since) {
    sql += " AND updated_at >= ?";
    params.push(opts.since);
  }
  sql += " ORDER BY updated_at DESC";
  if (opts?.limit) {
    sql += " LIMIT ?";
    params.push(opts.limit);
  }
  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
  return rows.map((r) => ({
    ...r,
    tags: parseTags(r.tags as string),
    sources: parseTags(r.sources as string),
  })) as unknown as SemanticMemory[];
}

export async function deleteSemantic(id: string): Promise<boolean> {
  const db = getDb();
  const result = db.prepare("DELETE FROM semantic WHERE id = ?").run(id);
  if (result.changes > 0) {
    await deleteVec("semantic", id);
    return true;
  }
  return false;
}
