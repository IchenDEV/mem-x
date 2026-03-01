import type { AnyMemory, MemoryLayer } from "./types.js";
import { getShortTerm, deleteShortTerm } from "./layers/short-term.js";
import { getEpisodic, deleteEpisodic } from "./layers/episodic.js";
import { getSemantic, deleteSemantic } from "./layers/semantic.js";
import { getRule, deleteRule } from "./layers/rules.js";

export { addShortTerm, getShortTerm, listShortTerm, deleteShortTerm, markPromoted, purgeExpired } from "./layers/short-term.js";
export type { AddShortTermInput } from "./layers/short-term.js";

export { addEpisodic, getEpisodic, listEpisodic, deleteEpisodic } from "./layers/episodic.js";
export type { AddEpisodicInput } from "./layers/episodic.js";

export { addSemantic, getSemantic, listSemantic, deleteSemantic } from "./layers/semantic.js";
export type { AddSemanticInput } from "./layers/semantic.js";

export { addRule, getRule, listRules, deleteRule } from "./layers/rules.js";
export type { AddRuleInput } from "./layers/rules.js";

export { addTask, getTask, listTasks, updateTaskStatus } from "./layers/tasks.js";
export type { AddTaskInput } from "./layers/tasks.js";

export function getMemory(layer: MemoryLayer, id: string): AnyMemory | null {
  switch (layer) {
    case "short_term":
      return getShortTerm(id);
    case "episodic":
      return getEpisodic(id);
    case "semantic":
      return getSemantic(id);
    case "rules":
      return getRule(id);
  }
}

export async function deleteMemory(layer: MemoryLayer, id: string): Promise<boolean> {
  switch (layer) {
    case "short_term":
      return deleteShortTerm(id);
    case "episodic":
      return deleteEpisodic(id);
    case "semantic":
      return deleteSemantic(id);
    case "rules":
      return deleteRule(id);
  }
}
