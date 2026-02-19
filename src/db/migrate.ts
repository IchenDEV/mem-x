import { getDb } from "./connection.js";
import { createSchema } from "./schema.js";
import { loadConfig } from "../utils/config.js";

const DIMENSIONS_BY_MODEL: Record<string, number> = {
  "text-embedding-3-small": 1536,
  "text-embedding-3-large": 3072,
  "text-embedding-ada-002": 1536,
  "nomic-embed-text": 768,
  "bge-m3": 1024,
  "BAAI/bge-m3": 1024,
  "text-embedding-bge-m3": 1024,
};

const DEFAULT_DIMENSIONS = 1536;

export function getDimensions(): number {
  const config = loadConfig();
  return DIMENSIONS_BY_MODEL[config.embedding.model] ?? DEFAULT_DIMENSIONS;
}

export function initializeDatabase(): void {
  const db = getDb();
  const dimensions = getDimensions();
  createSchema(db, dimensions);
  console.log(`Database initialized (embedding dimensions: ${dimensions})`);
}
