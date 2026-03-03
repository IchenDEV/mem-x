import { getCurrentRound } from "../db/rounds.js";
import { listRules } from "./layers/rules.js";
import { listTasks } from "./layers/tasks.js";
import { listShortTerm } from "./layers/short-term.js";
import { listSemantic } from "./layers/semantic.js";
import { listEpisodic } from "./layers/episodic.js";
import { listEdges } from "../graph/edges.js";
import type { RuleMemory, Task, ShortTermMemory, SemanticMemory, EpisodicMemory } from "./types.js";
import type { Edge } from "../graph/types.js";

export interface RecallContext {
  rules: RuleMemory[];
  tasks: Task[];
  short_term: ShortTermMemory[];
  semantic: SemanticMemory[];
  episodic: EpisodicMemory[];
  edges: Edge[];
}

export function recall(limit = 10): RecallContext {
  return {
    rules: listRules({ limit }),
    tasks: listTasks({ status: "pending", limit }),
    short_term: listShortTerm({ limit }),
    semantic: listSemantic({ limit }),
    episodic: listEpisodic({ limit }),
    edges: listEdges({ limit: limit * 3 }),
  };
}

function relTime(raw: string): string {
  const ts = new Date(raw.includes("T") ? raw : raw.replace(" ", "T") + "Z");
  const ms = Date.now() - ts.getTime();
  if (ms < 0) return "just now";
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function formatRecall(ctx: RecallContext): string {
  const sections: string[] = [];
  const round = getCurrentRound();

  if (ctx.rules.length > 0) {
    const lines = [`## Rules (${ctx.rules.length})`, ""];
    for (const r of ctx.rules) {
      lines.push(`- **${r.trigger_condition}** → ${r.constraint_text} (confidence: ${r.confidence})`);
    }
    sections.push(lines.join("\n"));
  }

  if (ctx.tasks.length > 0) {
    const lines = [`## Pending Tasks (${ctx.tasks.length})`, ""];
    for (const t of ctx.tasks) {
      const dl = t.deadline ? `, deadline: ${t.deadline}` : "";
      lines.push(`- **${t.title}** — ${t.priority}${dl}`);
    }
    sections.push(lines.join("\n"));
  }

  if (ctx.short_term.length > 0) {
    const lines = [`## Recent (Short-term) (${ctx.short_term.length})`, ""];
    for (const m of ctx.short_term) {
      const remaining = m.expires_at_round - round;
      lines.push(`- ${m.content} (${remaining} rounds left)`);
    }
    sections.push(lines.join("\n"));
  }

  if (ctx.semantic.length > 0) {
    const lines = [`## Knowledge (Semantic) (${ctx.semantic.length})`, ""];
    for (const m of ctx.semantic) {
      lines.push(`- **${m.topic}**: ${m.content}`);
    }
    sections.push(lines.join("\n"));
  }

  if (ctx.episodic.length > 0) {
    const lines = [`## Events (Episodic) (${ctx.episodic.length})`, ""];
    for (const m of ctx.episodic) {
      const result = m.result ? ` → ${m.result}` : "";
      lines.push(`- **${m.event}**${result} (${relTime(m.timestamp)})`);
    }
    sections.push(lines.join("\n"));
  }

  if (ctx.edges.length > 0) {
    const lines = [`## Graph (${ctx.edges.length} edges)`, ""];
    for (const e of ctx.edges) {
      lines.push(`- ${e.source_id.slice(0, 8)}(${e.source_layer}) --[${e.relation}]--> ${e.target_id.slice(0, 8)}(${e.target_layer}) w=${e.weight}`);
    }
    sections.push(lines.join("\n"));
  }

  return sections.length > 0
    ? sections.join("\n\n")
    : "No memories found. This is a fresh start.";
}
