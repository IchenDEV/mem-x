import type { MemoryLayer } from "../memory/types.js";

const VALID_LAYERS = ["short_term", "episodic", "semantic", "rules"];

export function parseLayerArg(layer: string): MemoryLayer {
  if (!VALID_LAYERS.includes(layer)) {
    throw new Error(`Invalid layer: ${layer}. Use: ${VALID_LAYERS.join(", ")}`);
  }
  return layer as MemoryLayer;
}

export function parseCsvTags(val?: string): string[] {
  return val ? val.split(",").map((t) => t.trim()).filter(Boolean) : [];
}
