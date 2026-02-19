import { Command } from "commander";
import { closeDb } from "../db/connection.js";
import { addTask, listTasks, updateTaskStatus } from "../memory/store.js";
import type { Task } from "../memory/types.js";

const addCmd = new Command("add")
  .requiredOption("--title <text>", "Task title")
  .option("--description <text>", "Task description")
  .option("--deadline <date>", "Deadline (ISO format)")
  .option("--priority <p>", "Priority (low/medium/high/urgent)", "medium")
  .option("--tags <tags>", "Comma-separated tags")
  .action((opts) => {
    try {
      const tags = opts.tags
        ? opts.tags.split(",").map((t: string) => t.trim()).filter(Boolean)
        : [];
      const task = addTask({
        title: opts.title,
        description: opts.description,
        priority: opts.priority as Task["priority"],
        deadline: opts.deadline,
        tags,
      });
      console.log(JSON.stringify(task, null, 2));
    } finally {
      closeDb();
    }
  });

const listCmd = new Command("list")
  .option("--status <status>", "Filter by status")
  .option("--limit <n>", "Max results", parseInt)
  .action((opts) => {
    try {
      const tasks = listTasks({
        status: opts.status as Task["status"] | undefined,
        limit: opts.limit,
      });
      console.log(JSON.stringify(tasks, null, 2));
    } finally {
      closeDb();
    }
  });

const updateCmd = new Command("update")
  .argument("<id>", "Task ID")
  .requiredOption("--status <status>", "New status")
  .action((id: string, opts) => {
    try {
      const ok = updateTaskStatus(id, opts.status as Task["status"]);
      console.log(ok ? `Updated ${id}` : `Not found: ${id}`);
    } finally {
      closeDb();
    }
  });

export const taskCommand = new Command("task")
  .description("Manage tasks")
  .addCommand(addCmd)
  .addCommand(listCmd)
  .addCommand(updateCmd);
