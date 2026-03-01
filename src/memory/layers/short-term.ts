import { getDb } from "../../db/connection.js";
import { getCurrentRound } from "../../db/rounds.js";
import { generateId } from "../../utils/id.js";
import type { ShortTermMemory } from "../types.js";
import { parseTags, serializeTags, toEmbeddingText, insertVec, deleteVec } from "../helpers.js";

const DEFAULT_TTL_ROUNDS = 7;

export interface AddShortTermInput {
  content: string;
  source_session?: string;
  tags?: string[];
  confidence?: number;
  ttl_rounds?: number;
}

export async function addShortTerm(input: AddShortTermInput): Promise<ShortTermMemory> {
  const db = getDb();
  const id = generateId();
  const round = getCurrentRound();
  const expiresAtRound = round + (input.ttl_rounds ?? DEFAULT_TTL_ROUNDS);

  db.prepare(
    `INSERT INTO short_term (id, content, source_session, tags, confidence, created_at_round, expires_at_round)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.content,
    input.source_session ?? null,
    serializeTags(input.tags ?? []),
    input.confidence ?? 1.0,
    round,
    expiresAtRound,
  );

  await insertVec("short_term", id, toEmbeddingText("short_term", { content: input.content }));
  return getShortTerm(id)!;
}

export function getShortTerm(id: string): ShortTermMemory | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM short_term WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  if (!row) return null;
  return {
    ...row,
    tags: parseTags(row.tags as string),
    promoted: row.promoted === 1,
  } as unknown as ShortTermMemory;
}

export function listShortTerm(opts?: {
  include_expired?: boolean;
  limit?: number;
}): ShortTermMemory[] {
  const db = getDb();
  const includeExpired = opts?.include_expired ?? false;
  let sql = "SELECT * FROM short_term";
  const params: unknown[] = [];
  if (!includeExpired) {
    sql += " WHERE promoted = 0 AND expires_at_round > ?";
    params.push(getCurrentRound());
  }
  sql += " ORDER BY created_at DESC";
  if (opts?.limit) {
    sql += " LIMIT ?";
    params.push(opts.limit);
  }
  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
  return rows.map((r) => ({
    ...r,
    tags: parseTags(r.tags as string),
    promoted: r.promoted === 1,
  })) as unknown as ShortTermMemory[];
}

export async function deleteShortTerm(id: string): Promise<boolean> {
  const db = getDb();
  const result = db.prepare("DELETE FROM short_term WHERE id = ?").run(id);
  if (result.changes > 0) {
    await deleteVec("short_term", id);
    return true;
  }
  return false;
}

export function markPromoted(id: string): boolean {
  const db = getDb();
  const result = db
    .prepare("UPDATE short_term SET promoted = 1 WHERE id = ?")
    .run(id);
  return result.changes > 0;
}

export function purgeExpired(): number {
  const db = getDb();
  const round = getCurrentRound();
  const expired = db
    .prepare("SELECT id FROM short_term WHERE expires_at_round <= ? AND promoted = 0")
    .all(round) as { id: string }[];

  for (const { id } of expired) {
    db.prepare("DELETE FROM short_term_vec WHERE memory_id = ?").run(id);
  }

  const result = db
    .prepare("DELETE FROM short_term WHERE expires_at_round <= ? AND promoted = 0")
    .run(round);
  return result.changes;
}
