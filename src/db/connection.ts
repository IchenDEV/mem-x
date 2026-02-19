import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { resolve } from "node:path";
import { mkdirSync, existsSync } from "node:fs";
import { loadConfig } from "../utils/config.js";

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  const config = loadConfig();
  const dbPath = resolve(process.cwd(), config.db.path);

  const dir = resolve(dbPath, "..");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  _db = new Database(dbPath);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  sqliteVec.load(_db);

  return _db;
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
