import type Database from "better-sqlite3";

const DATA_TABLES = `
CREATE TABLE IF NOT EXISTS metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS short_term (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  source_session TEXT,
  tags TEXT,
  confidence REAL DEFAULT 1.0,
  hit_count INTEGER DEFAULT 0,
  last_hit_at TEXT,
  created_at_round INTEGER NOT NULL DEFAULT 0,
  expires_at_round INTEGER NOT NULL DEFAULT 7,
  promoted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS episodic (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  context TEXT,
  event TEXT NOT NULL,
  result TEXT,
  tags TEXT,
  confidence REAL DEFAULT 1.0,
  hit_count INTEGER DEFAULT 0,
  last_hit_at TEXT,
  promoted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS semantic (
  id TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  content TEXT NOT NULL,
  sources TEXT,
  tags TEXT,
  confidence REAL DEFAULT 1.0,
  hit_count INTEGER DEFAULT 0,
  last_hit_at TEXT,
  version INTEGER DEFAULT 1,
  status TEXT DEFAULT 'active',
  updated_at TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rules (
  id TEXT PRIMARY KEY,
  trigger_condition TEXT NOT NULL,
  constraint_text TEXT NOT NULL,
  reason TEXT,
  source TEXT,
  confidence REAL DEFAULT 1.0,
  hit_count INTEGER DEFAULT 0,
  last_hit_at TEXT,
  verified INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending',
  priority TEXT DEFAULT 'medium',
  deadline TEXT,
  tags TEXT,
  episodic_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS evolution_log (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  step TEXT NOT NULL,
  content TEXT NOT NULL,
  changes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS edges (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  source_layer TEXT NOT NULL,
  target_id TEXT NOT NULL,
  target_layer TEXT NOT NULL,
  relation TEXT NOT NULL,
  weight REAL DEFAULT 1.0,
  metadata TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id);
CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id);
CREATE INDEX IF NOT EXISTS idx_edges_relation ON edges(relation);
`;

export function createDataTables(db: Database.Database): void {
  db.exec(DATA_TABLES);
}
