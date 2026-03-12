import { getDb } from "./connection.js";

export function getCurrentRound(): number {
  const db = getDb();
  const row = db
    .prepare("SELECT value FROM metadata WHERE key = 'round_counter'")
    .get() as { value: string } | undefined;
  return row ? parseInt(row.value, 10) : 0;
}

/**
 * Increment round counter atomically.
 * Uses UPDATE instead of read-then-write to avoid race conditions.
 */
export function incrementRound(): number {
  const db = getDb();
  // Use atomic UPDATE to avoid race conditions
  db.prepare(
    "UPDATE metadata SET value = CAST(value AS INTEGER) + 1 WHERE key = 'round_counter'"
  ).run();

  // Then fetch the new value
  const row = db
    .prepare("SELECT value FROM metadata WHERE key = 'round_counter'")
    .get() as { value: string } | undefined;
  return row ? parseInt(row.value, 10) : 1;
}
