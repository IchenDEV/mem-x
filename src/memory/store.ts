import { getDb } from "../db/connection.js";
import { getEmbeddingProvider } from "../embedding/factory.js";
import { generateId } from "../utils/id.js";
import type {
  EpisodicMemory,
  SemanticMemory,
  RuleMemory,
  Task,
  MemoryLayer,
} from "./types.js";

function parseTags(tags: string | null): string[] {
  if (!tags) return [];
  try {
    return JSON.parse(tags);
  } catch {
    return [];
  }
}

function serializeTags(tags: string[]): string {
  return JSON.stringify(tags);
}

function toEmbeddingText(layer: MemoryLayer, row: Record<string, unknown>): string {
  switch (layer) {
    case "episodic":
      return [row.event, row.result, row.context].filter(Boolean).join(" ");
    case "semantic":
      return [row.topic, row.content].filter(Boolean).join(" ");
    case "rules":
      return [row.trigger_condition, row.constraint_text, row.reason]
        .filter(Boolean)
        .join(" ");
  }
}

async function insertVec(
  layer: MemoryLayer,
  memoryId: string,
  text: string,
): Promise<void> {
  const provider = getEmbeddingProvider();
  const embedding = await provider.embed(text);
  const db = getDb();
  db.prepare(
    `INSERT INTO ${layer}_vec (memory_id, embedding) VALUES (?, ?)`,
  ).run(memoryId, Buffer.from(embedding.buffer));
}

async function deleteVec(layer: MemoryLayer, memoryId: string): Promise<void> {
  const db = getDb();
  db.prepare(`DELETE FROM ${layer}_vec WHERE memory_id = ?`).run(memoryId);
}

// --- Episodic Memory ---

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

// --- Semantic Memory ---

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

// --- Rules ---

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

// --- Tasks ---

export interface AddTaskInput {
  title: string;
  description?: string;
  priority?: Task["priority"];
  deadline?: string;
  tags?: string[];
  episodic_id?: string;
}

export function addTask(input: AddTaskInput): Task {
  const db = getDb();
  const id = generateId();

  db.prepare(
    `INSERT INTO tasks (id, title, description, priority, deadline, tags, episodic_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.title,
    input.description ?? null,
    input.priority ?? "medium",
    input.deadline ?? null,
    serializeTags(input.tags ?? []),
    input.episodic_id ?? null,
  );

  return getTask(id)!;
}

export function getTask(id: string): Task | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  if (!row) return null;
  return { ...row, tags: parseTags(row.tags as string) } as unknown as Task;
}

export function listTasks(opts?: {
  status?: Task["status"];
  limit?: number;
}): Task[] {
  const db = getDb();
  let sql = "SELECT * FROM tasks";
  const params: unknown[] = [];
  if (opts?.status) {
    sql += " WHERE status = ?";
    params.push(opts.status);
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
  })) as unknown as Task[];
}

export function updateTaskStatus(id: string, status: Task["status"]): boolean {
  const db = getDb();
  const result = db
    .prepare(
      "UPDATE tasks SET status = ?, updated_at = datetime('now') WHERE id = ?",
    )
    .run(status, id);
  return result.changes > 0;
}

// --- Generic getter by layer ---

export function getMemory(
  layer: MemoryLayer,
  id: string,
): EpisodicMemory | SemanticMemory | RuleMemory | null {
  switch (layer) {
    case "episodic":
      return getEpisodic(id);
    case "semantic":
      return getSemantic(id);
    case "rules":
      return getRule(id);
  }
}

export async function deleteMemory(
  layer: MemoryLayer,
  id: string,
): Promise<boolean> {
  switch (layer) {
    case "episodic":
      return deleteEpisodic(id);
    case "semantic":
      return deleteSemantic(id);
    case "rules":
      return deleteRule(id);
  }
}
