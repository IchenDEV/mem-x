import { getDb } from "./connection.js";

export function getCurrentRound(): number {
  const db = getDb();
  const row = db
    .prepare("SELECT value FROM metadata WHERE key = 'round_counter'")
    .get() as { value: string } | undefined;
  return row ? parseInt(row.value, 10) : 0;
}

export function incrementRound(): number {
  const db = getDb();
  const next = getCurrentRound() + 1;
  db.prepare(
    "INSERT OR REPLACE INTO metadata (key, value) VALUES ('round_counter', ?)",
  ).run(String(next));
  return next;
}
