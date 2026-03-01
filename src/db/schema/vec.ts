import type Database from "better-sqlite3";

export function createVecTables(db: Database.Database, dimensions: number): void {
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS short_term_vec USING vec0(
      memory_id TEXT PRIMARY KEY,
      embedding float[${dimensions}]
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS episodic_vec USING vec0(
      memory_id TEXT PRIMARY KEY,
      embedding float[${dimensions}]
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS semantic_vec USING vec0(
      memory_id TEXT PRIMARY KEY,
      embedding float[${dimensions}]
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS rules_vec USING vec0(
      memory_id TEXT PRIMARY KEY,
      embedding float[${dimensions}]
    );
  `);
}
