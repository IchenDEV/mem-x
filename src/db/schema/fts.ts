import type Database from "better-sqlite3";

const LAYERS = ["short_term", "episodic", "semantic", "rules"] as const;

const FTS_COLUMNS: Record<string, string> = {
  short_term: "content, tags",
  episodic: "event, context, result, tags",
  semantic: "topic, content, tags",
  rules: "trigger_condition, constraint_text, reason",
};

function buildCreateFts(): string {
  return LAYERS.map(
    (l) =>
      `CREATE VIRTUAL TABLE IF NOT EXISTS ${l}_fts USING fts5(
  ${FTS_COLUMNS[l]},
  content=${l}, content_rowid=rowid,
  tokenize='trigram'
);`,
  ).join("\n\n");
}

function buildTriggers(): string {
  return LAYERS.map((l) => {
    const cols = FTS_COLUMNS[l];
    const newVals = cols
      .split(",")
      .map((c) => `NEW.${c.trim()}`)
      .join(", ");
    const oldVals = cols
      .split(",")
      .map((c) => `OLD.${c.trim()}`)
      .join(", ");

    return `
CREATE TRIGGER IF NOT EXISTS ${l}_ai AFTER INSERT ON ${l} BEGIN
  INSERT INTO ${l}_fts(rowid, ${cols}) VALUES (NEW.rowid, ${newVals});
END;
CREATE TRIGGER IF NOT EXISTS ${l}_ad AFTER DELETE ON ${l} BEGIN
  INSERT INTO ${l}_fts(${l}_fts, rowid, ${cols}) VALUES ('delete', OLD.rowid, ${oldVals});
END;
CREATE TRIGGER IF NOT EXISTS ${l}_au AFTER UPDATE ON ${l} BEGIN
  INSERT INTO ${l}_fts(${l}_fts, rowid, ${cols}) VALUES ('delete', OLD.rowid, ${oldVals});
  INSERT INTO ${l}_fts(rowid, ${cols}) VALUES (NEW.rowid, ${newVals});
END;`;
  }).join("\n");
}

function dropFtsAndTriggers(db: Database.Database): void {
  for (const l of LAYERS) {
    db.exec(`DROP TRIGGER IF EXISTS ${l}_ai;`);
    db.exec(`DROP TRIGGER IF EXISTS ${l}_ad;`);
    db.exec(`DROP TRIGGER IF EXISTS ${l}_au;`);
    db.exec(`DROP TABLE IF EXISTS ${l}_fts;`);
  }
}

function rebuildFtsIndexes(db: Database.Database): void {
  for (const l of LAYERS) {
    db.exec(`INSERT INTO ${l}_fts(${l}_fts) VALUES('rebuild');`);
  }
}

export function createFtsTables(db: Database.Database): void {
  dropFtsAndTriggers(db);
  db.exec(buildCreateFts());
  db.exec(buildTriggers());
  rebuildFtsIndexes(db);
}
