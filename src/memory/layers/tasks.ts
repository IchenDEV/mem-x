import { getDb } from "../../db/connection.js";
import { generateId } from "../../utils/id.js";
import type { Task } from "../types.js";
import { parseTags, serializeTags } from "../helpers.js";

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
