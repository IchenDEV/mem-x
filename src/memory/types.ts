export type MemoryLayer = "episodic" | "semantic" | "rules";

export interface EpisodicMemory {
  id: string;
  timestamp: string;
  context: string | null;
  event: string;
  result: string | null;
  tags: string[];
  confidence: number;
  hit_count: number;
  last_hit_at: string | null;
  promoted: boolean;
  created_at: string;
}

export interface SemanticMemory {
  id: string;
  topic: string;
  content: string;
  sources: string[];
  tags: string[];
  confidence: number;
  hit_count: number;
  last_hit_at: string | null;
  version: number;
  status: "active" | "stale" | "deprecated";
  updated_at: string;
  created_at: string;
}

export interface RuleMemory {
  id: string;
  trigger_condition: string;
  constraint_text: string;
  reason: string | null;
  source: string | null;
  confidence: number;
  hit_count: number;
  last_hit_at: string | null;
  verified: boolean;
  created_at: string;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: "pending" | "in_progress" | "done" | "cancelled";
  priority: "low" | "medium" | "high" | "urgent";
  deadline: string | null;
  tags: string[];
  episodic_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SearchResult {
  id: string;
  layer: MemoryLayer;
  score: number;
  data: EpisodicMemory | SemanticMemory | RuleMemory;
}

export interface SearchOptions {
  layer?: MemoryLayer;
  mode?: "bm25" | "vector" | "hybrid";
  limit?: number;
}
