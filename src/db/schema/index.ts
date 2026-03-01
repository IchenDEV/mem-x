import type Database from "better-sqlite3";
import { createDataTables } from "./tables.js";
import { createFtsTables } from "./fts.js";
import { createVecTables } from "./vec.js";

export { createVecTables } from "./vec.js";

export function createSchema(db: Database.Database, dimensions: number): void {
  createDataTables(db);
  createFtsTables(db);
  createVecTables(db, dimensions);
}
