import { getDb } from "./connection.js";
import { createSchema } from "./schema/index.js";
import { loadConfig } from "../utils/config.js";
import { MODEL_DIMENSIONS, DEFAULT_DIMENSIONS } from "../embedding/provider.js";

export function getDimensions(): number {
  const config = loadConfig();
  return MODEL_DIMENSIONS[config.embedding.model] ?? DEFAULT_DIMENSIONS;
}

export function initializeDatabase(): void {
  const db = getDb();
  const dimensions = getDimensions();
  createSchema(db, dimensions);
  console.log(`Database initialized (embedding dimensions: ${dimensions})`);
}
