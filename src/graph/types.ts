import type { MemoryLayer } from "../memory/types.js";

export type EdgeRelation =
  | "promoted_from"
  | "derived_from"
  | "related_to"
  | "contradicts"
  | "supersedes"
  | "caused_by"
  | "leads_to"
  | "similar_to";

export const EDGE_RELATIONS: EdgeRelation[] = [
  "promoted_from",
  "derived_from",
  "related_to",
  "contradicts",
  "supersedes",
  "caused_by",
  "leads_to",
  "similar_to",
];

export const BIDIRECTIONAL_RELATIONS: EdgeRelation[] = [
  "related_to",
  "contradicts",
  "similar_to",
];

export interface Edge {
  id: string;
  source_id: string;
  source_layer: MemoryLayer;
  target_id: string;
  target_layer: MemoryLayer;
  relation: EdgeRelation;
  weight: number;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface AddEdgeInput {
  source_id: string;
  source_layer: MemoryLayer;
  target_id: string;
  target_layer: MemoryLayer;
  relation: EdgeRelation;
  weight?: number;
  metadata?: Record<string, unknown>;
}

export interface NeighborResult {
  edge: Edge;
  direction: "outgoing" | "incoming";
}
