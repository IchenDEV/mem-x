import { getDb } from "../db/connection.js";
import { getEmbeddingProvider } from "../embedding/factory.js";
import type { MemoryLayer, AnyMemory } from "./types.js";

export function parseTags(tags: string | null): string[] {
  if (!tags) return [];
  try {
    return JSON.parse(tags);
  } catch {
    return [];
  }
}

export function serializeTags(tags: string[]): string {
  return JSON.stringify(tags);
}

export function toEmbeddingText(layer: MemoryLayer, row: Record<string, unknown>): string {
  switch (layer) {
    case "short_term":
      return String(row.content ?? "");
    case "episodic":
      return [row.event, row.result, row.context].filter(Boolean).join(" ");
    case "semantic":
      return [row.topic, row.content].filter(Boolean).join(" ");
    case "rules":
      return [row.trigger_condition, row.constraint_text, row.reason]
        .filter(Boolean)
        .join(" ");
  }
}

export async function insertVec(
  layer: MemoryLayer,
  memoryId: string,
  text: string,
): Promise<void> {
  const provider = getEmbeddingProvider();
  const embedding = await provider.embed(text);
  const db = getDb();
  db.prepare(
    `INSERT INTO ${layer}_vec (memory_id, embedding) VALUES (?, ?)`,
  ).run(memoryId, Buffer.from(embedding.buffer));
}

export async function deleteVec(layer: MemoryLayer, memoryId: string): Promise<void> {
  const db = getDb();
  db.prepare(`DELETE FROM ${layer}_vec WHERE memory_id = ?`).run(memoryId);
}

export function hydrateRow(
  layer: MemoryLayer,
  row: Record<string, unknown>,
): AnyMemory {
  const base = { ...row };
  if ("tags" in base) base.tags = parseTags(base.tags as string);
  if ("sources" in base) base.sources = parseTags(base.sources as string);
  if ("promoted" in base) base.promoted = base.promoted === 1;
  if ("verified" in base) base.verified = base.verified === 1;
  return base as unknown as AnyMemory;
}
