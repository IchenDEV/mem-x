import type Database from "better-sqlite3";

const DATA_TABLES = `
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
`;

const FTS_TABLES = `
CREATE VIRTUAL TABLE IF NOT EXISTS episodic_fts USING fts5(
  event, result, tags,
  content=episodic, content_rowid=rowid
);

CREATE VIRTUAL TABLE IF NOT EXISTS semantic_fts USING fts5(
  topic, content, tags,
  content=semantic, content_rowid=rowid
);

CREATE VIRTUAL TABLE IF NOT EXISTS rules_fts USING fts5(
  trigger_condition, constraint_text, reason,
  content=rules, content_rowid=rowid
);
`;

const FTS_TRIGGERS = `
CREATE TRIGGER IF NOT EXISTS episodic_ai AFTER INSERT ON episodic BEGIN
  INSERT INTO episodic_fts(rowid, event, result, tags)
  VALUES (NEW.rowid, NEW.event, NEW.result, NEW.tags);
END;
CREATE TRIGGER IF NOT EXISTS episodic_ad AFTER DELETE ON episodic BEGIN
  INSERT INTO episodic_fts(episodic_fts, rowid, event, result, tags)
  VALUES ('delete', OLD.rowid, OLD.event, OLD.result, OLD.tags);
END;
CREATE TRIGGER IF NOT EXISTS episodic_au AFTER UPDATE ON episodic BEGIN
  INSERT INTO episodic_fts(episodic_fts, rowid, event, result, tags)
  VALUES ('delete', OLD.rowid, OLD.event, OLD.result, OLD.tags);
  INSERT INTO episodic_fts(rowid, event, result, tags)
  VALUES (NEW.rowid, NEW.event, NEW.result, NEW.tags);
END;

CREATE TRIGGER IF NOT EXISTS semantic_ai AFTER INSERT ON semantic BEGIN
  INSERT INTO semantic_fts(rowid, topic, content, tags)
  VALUES (NEW.rowid, NEW.topic, NEW.content, NEW.tags);
END;
CREATE TRIGGER IF NOT EXISTS semantic_ad AFTER DELETE ON semantic BEGIN
  INSERT INTO semantic_fts(semantic_fts, rowid, topic, content, tags)
  VALUES ('delete', OLD.rowid, OLD.topic, OLD.content, OLD.tags);
END;
CREATE TRIGGER IF NOT EXISTS semantic_au AFTER UPDATE ON semantic BEGIN
  INSERT INTO semantic_fts(semantic_fts, rowid, topic, content, tags)
  VALUES ('delete', OLD.rowid, OLD.topic, OLD.content, OLD.tags);
  INSERT INTO semantic_fts(rowid, topic, content, tags)
  VALUES (NEW.rowid, NEW.topic, NEW.content, NEW.tags);
END;

CREATE TRIGGER IF NOT EXISTS rules_ai AFTER INSERT ON rules BEGIN
  INSERT INTO rules_fts(rowid, trigger_condition, constraint_text, reason)
  VALUES (NEW.rowid, NEW.trigger_condition, NEW.constraint_text, NEW.reason);
END;
CREATE TRIGGER IF NOT EXISTS rules_ad AFTER DELETE ON rules BEGIN
  INSERT INTO rules_fts(rules_fts, rowid, trigger_condition, constraint_text, reason)
  VALUES ('delete', OLD.rowid, OLD.trigger_condition, OLD.constraint_text, OLD.reason);
END;
CREATE TRIGGER IF NOT EXISTS rules_au AFTER UPDATE ON rules BEGIN
  INSERT INTO rules_fts(rules_fts, rowid, trigger_condition, constraint_text, reason)
  VALUES ('delete', OLD.rowid, OLD.trigger_condition, OLD.constraint_text, OLD.reason);
  INSERT INTO rules_fts(rowid, trigger_condition, constraint_text, reason)
  VALUES (NEW.rowid, NEW.trigger_condition, NEW.constraint_text, NEW.reason);
END;
`;

export function createVecTables(db: Database.Database, dimensions: number): void {
  db.exec(`
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

export function createSchema(db: Database.Database, dimensions: number): void {
  db.exec(DATA_TABLES);
  db.exec(FTS_TABLES);
  db.exec(FTS_TRIGGERS);
  createVecTables(db, dimensions);
}
