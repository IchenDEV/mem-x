import { getDb } from "../db/connection.js";
import { generateId } from "../utils/id.js";
import type { MemoryLayer } from "../memory/types.js";
import type { Edge, EdgeRelation, AddEdgeInput } from "./types.js";
import { BIDIRECTIONAL_RELATIONS } from "./types.js";

function hydrateEdge(row: Record<string, unknown>): Edge {
  return {
    ...row,
    metadata: row.metadata ? JSON.parse(row.metadata as string) : null,
  } as unknown as Edge;
}

export function addEdge(input: AddEdgeInput): Edge {
  const db = getDb();
  const id = generateId();
  db.prepare(
    `INSERT INTO edges (id, source_id, source_layer, target_id, target_layer, relation, weight, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.source_id,
    input.source_layer,
    input.target_id,
    input.target_layer,
    input.relation,
    input.weight ?? 1.0,
    input.metadata ? JSON.stringify(input.metadata) : null,
  );
  return getEdge(id)!;
}

export function getEdge(id: string): Edge | null {
  const row = getDb()
    .prepare("SELECT * FROM edges WHERE id = ?")
    .get(id) as Record<string, unknown> | undefined;
  return row ? hydrateEdge(row) : null;
}

export function deleteEdge(id: string): boolean {
  return getDb().prepare("DELETE FROM edges WHERE id = ?").run(id).changes > 0;
}

export function listEdges(opts?: {
  relation?: EdgeRelation;
  layer?: MemoryLayer;
  limit?: number;
}): Edge[] {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (opts?.relation) {
    conditions.push("relation = ?");
    params.push(opts.relation);
  }
  if (opts?.layer) {
    conditions.push("(source_layer = ? OR target_layer = ?)");
    params.push(opts.layer, opts.layer);
  }

  let sql = "SELECT * FROM edges";
  if (conditions.length > 0) sql += ` WHERE ${conditions.join(" AND ")}`;
  sql += " ORDER BY created_at DESC";
  if (opts?.limit) {
    sql += " LIMIT ?";
    params.push(opts.limit);
  }

  const rows = getDb().prepare(sql).all(...params) as Record<string, unknown>[];
  return rows.map(hydrateEdge);
}

export function getEdgesForNode(
  nodeId: string,
  opts?: { relation?: EdgeRelation; direction?: "outgoing" | "incoming" | "both" },
): Edge[] {
  const direction = opts?.direction ?? "both";
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (direction === "outgoing") {
    conditions.push("source_id = ?");
    params.push(nodeId);
  } else if (direction === "incoming") {
    conditions.push("target_id = ?");
    params.push(nodeId);
  } else {
    conditions.push("(source_id = ? OR target_id = ?)");
    params.push(nodeId, nodeId);
  }

  if (opts?.relation) {
    conditions.push("relation = ?");
    params.push(opts.relation);
  }

  const sql = `SELECT * FROM edges WHERE ${conditions.join(" AND ")} ORDER BY weight DESC`;
  const rows = getDb().prepare(sql).all(...params) as Record<string, unknown>[];
  return rows.map(hydrateEdge);
}

export function getEdgesBetween(idA: string, idB: string): Edge[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM edges
       WHERE (source_id = ? AND target_id = ?) OR (source_id = ? AND target_id = ?)`,
    )
    .all(idA, idB, idB, idA) as Record<string, unknown>[];
  return rows.map(hydrateEdge);
}

export function deleteEdgesForNode(nodeId: string): number {
  return getDb()
    .prepare("DELETE FROM edges WHERE source_id = ? OR target_id = ?")
    .run(nodeId, nodeId).changes;
}

export function edgeExists(
  sourceId: string,
  targetId: string,
  relation: EdgeRelation,
): boolean {
  const isBidi = BIDIRECTIONAL_RELATIONS.includes(relation);
  const sql = isBidi
    ? `SELECT 1 FROM edges WHERE relation = ? AND
       ((source_id = ? AND target_id = ?) OR (source_id = ? AND target_id = ?)) LIMIT 1`
    : `SELECT 1 FROM edges WHERE relation = ? AND source_id = ? AND target_id = ? LIMIT 1`;

  const params = isBidi
    ? [relation, sourceId, targetId, targetId, sourceId]
    : [relation, sourceId, targetId];

  return getDb().prepare(sql).get(...params) !== undefined;
}
