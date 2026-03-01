import { getDb } from "../db/connection.js";
import { getCurrentRound } from "../db/rounds.js";
import { listSessions } from "../memory/session.js";
import { hydrateRow } from "../memory/helpers.js";
import { ALL_LAYERS, type MemoryLayer } from "../memory/types.js";

function count(sql: string, ...params: unknown[]): number {
  return (getDb().prepare(sql).get(...params) as { c: number }).c;
}

function safeCount(sql: string, ...params: unknown[]): number {
  try {
    return count(sql, ...params);
  } catch {
    return 0;
  }
}

export function getStats() {
  return {
    short_term: {
      total: safeCount("SELECT COUNT(*) as c FROM short_term"),
      active: safeCount("SELECT COUNT(*) as c FROM short_term WHERE promoted = 0 AND expires_at_round > ?", getCurrentRound()),
      expired: safeCount("SELECT COUNT(*) as c FROM short_term WHERE expires_at_round <= ?", getCurrentRound()),
      promoted: safeCount("SELECT COUNT(*) as c FROM short_term WHERE promoted = 1"),
    },
    episodic: {
      total: safeCount("SELECT COUNT(*) as c FROM episodic"),
      avg_confidence: (() => {
        try {
          const val = (getDb().prepare("SELECT COALESCE(AVG(confidence),0) as c FROM episodic").get() as { c: number })?.c ?? 0;
          return Math.round(val * 100) / 100;
        } catch { return 0; }
      })(),
    },
    semantic: {
      total: safeCount("SELECT COUNT(*) as c FROM semantic"),
      active: safeCount("SELECT COUNT(*) as c FROM semantic WHERE status = 'active'"),
      stale: safeCount("SELECT COUNT(*) as c FROM semantic WHERE status = 'stale'"),
      deprecated: safeCount("SELECT COUNT(*) as c FROM semantic WHERE status = 'deprecated'"),
    },
    rules: {
      total: safeCount("SELECT COUNT(*) as c FROM rules"),
      verified: safeCount("SELECT COUNT(*) as c FROM rules WHERE verified = 1"),
      unverified: safeCount("SELECT COUNT(*) as c FROM rules WHERE verified = 0"),
    },
    tasks: {
      total: safeCount("SELECT COUNT(*) as c FROM tasks"),
      pending: safeCount("SELECT COUNT(*) as c FROM tasks WHERE status = 'pending'"),
      in_progress: safeCount("SELECT COUNT(*) as c FROM tasks WHERE status = 'in_progress'"),
      done: safeCount("SELECT COUNT(*) as c FROM tasks WHERE status = 'done'"),
    },
    sessions: (() => {
      const all = listSessions();
      return { total: all.length, active: all.filter((s) => !s.ended_at).length };
    })(),
    vectors: Object.fromEntries(
      ALL_LAYERS.map((l) => [l, safeCount(`SELECT COUNT(*) as c FROM ${l}_vec`)]),
    ),
  };
}

export function getTimeline(limit = 50) {
  return getDb()
    .prepare(
      `SELECT 'short_term' as layer, id, content as summary, created_at FROM short_term
       UNION ALL
       SELECT 'episodic', id, event, created_at FROM episodic
       UNION ALL
       SELECT 'semantic', id, topic, created_at FROM semantic
       UNION ALL
       SELECT 'rules', id, trigger_condition, created_at FROM rules
       ORDER BY created_at DESC LIMIT ?`,
    )
    .all(limit);
}

export function inspectMemory(layer: MemoryLayer, id: string) {
  const row = getDb()
    .prepare(`SELECT * FROM ${layer} WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  if (!row) return null;

  let hasVector = false;
  try {
    hasVector = count(`SELECT COUNT(*) as c FROM ${layer}_vec WHERE memory_id = ?`, id) > 0;
  } catch { /* vec table may not exist */ }

  return { memory: hydrateRow(layer, row), has_vector: hasVector };
}

export function listLayerMemories(layer: MemoryLayer, limit = 20) {
  const orderCol = layer === "episodic" ? "timestamp" : "created_at";
  const rows = getDb()
    .prepare(`SELECT * FROM ${layer} ORDER BY ${orderCol} DESC LIMIT ?`)
    .all(limit) as Record<string, unknown>[];
  return rows.map((r) => hydrateRow(layer, r));
}

export function getHealth() {
  const checks: { name: string; status: "ok" | "warn"; count: number; details: string }[] = [];

  for (const layer of ALL_LAYERS) {
    const orphaned = safeCount(
      `SELECT COUNT(*) as c FROM ${layer}_vec WHERE memory_id NOT IN (SELECT id FROM ${layer})`,
    );
    checks.push({
      name: `${layer}: orphaned vectors`,
      status: orphaned > 0 ? "warn" : "ok",
      count: orphaned,
      details: `${orphaned} vectors without corresponding memory`,
    });

    const missing = safeCount(
      `SELECT COUNT(*) as c FROM ${layer} WHERE id NOT IN (SELECT memory_id FROM ${layer}_vec)`,
    );
    checks.push({
      name: `${layer}: missing vectors`,
      status: missing > 0 ? "warn" : "ok",
      count: missing,
      details: `${missing} memories without vector embeddings`,
    });
  }

  const expired = safeCount(
    "SELECT COUNT(*) as c FROM short_term WHERE expires_at_round <= ? AND promoted = 0",
    getCurrentRound(),
  );
  checks.push({
    name: "short_term: expired not purged",
    status: expired > 0 ? "warn" : "ok",
    count: expired,
    details: `${expired} expired entries awaiting cleanup`,
  });

  return { ok: checks.every((c) => c.status === "ok"), checks };
}
