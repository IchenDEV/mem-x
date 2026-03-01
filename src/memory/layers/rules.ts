import { getDb } from "../../db/connection.js";
import { generateId } from "../../utils/id.js";
import type { RuleMemory } from "../types.js";
import { insertVec, deleteVec, toEmbeddingText } from "../helpers.js";

export interface AddRuleInput {
  trigger_condition: string;
  constraint_text: string;
  reason?: string;
  source?: string;
  confidence?: number;
}

export async function addRule(input: AddRuleInput): Promise<RuleMemory> {
  const db = getDb();
  const id = generateId();

  db.prepare(
    `INSERT INTO rules (id, trigger_condition, constraint_text, reason, source, confidence)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.trigger_condition,
    input.constraint_text,
    input.reason ?? null,
    input.source ?? null,
    input.confidence ?? 1.0,
  );

  await insertVec("rules", id, toEmbeddingText("rules", { ...input }));
  return getRule(id)!;
}

export function getRule(id: string): RuleMemory | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM rules WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  if (!row) return null;
  return { ...row, verified: row.verified === 1 } as unknown as RuleMemory;
}

export function listRules(opts?: { limit?: number }): RuleMemory[] {
  const db = getDb();
  let sql = "SELECT * FROM rules ORDER BY confidence DESC, created_at DESC";
  const params: unknown[] = [];
  if (opts?.limit) {
    sql += " LIMIT ?";
    params.push(opts.limit);
  }
  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
  return rows.map((r) => ({
    ...r,
    verified: r.verified === 1,
  })) as unknown as RuleMemory[];
}

export async function deleteRule(id: string): Promise<boolean> {
  const db = getDb();
  const result = db.prepare("DELETE FROM rules WHERE id = ?").run(id);
  if (result.changes > 0) {
    await deleteVec("rules", id);
    return true;
  }
  return false;
}
