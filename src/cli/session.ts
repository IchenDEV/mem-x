import { Command } from "commander";
import { startSession, addEntry, endSession, getSession, listSessions } from "../memory/session.js";
import { addShortTerm } from "../memory/store.js";
import { closeDb } from "../db/connection.js";
import { incrementRound } from "../db/rounds.js";

const startCmd = new Command("start")
  .description("Start a new session")
  .action(() => {
    const session = startSession();
    console.log(`Session started: ${session.id}`);
  });

const addCmd = new Command("add")
  .description("Add an entry to an active session")
  .argument("<session-id>", "Session ID")
  .requiredOption("--content <text>", "Entry content")
  .option("--tags <tags>", "Comma-separated tags")
  .action((sessionId: string, opts) => {
    const tags = opts.tags
      ? opts.tags.split(",").map((t: string) => t.trim()).filter(Boolean)
      : [];
    const entry = addEntry(sessionId, opts.content, tags);
    console.log(JSON.stringify(entry, null, 2));
  });

const endCmd = new Command("end")
  .description("End a session and commit entries to short-term memory")
  .argument("<session-id>", "Session ID")
  .option("--ttl <rounds>", "TTL in conversation rounds for short-term memories", parseInt)
  .action(async (sessionId: string, opts) => {
    const session = endSession(sessionId);
    let committed = 0;

    try {
      const round = incrementRound();
      for (const entry of session.entries) {
        await addShortTerm({
          content: entry.content,
          source_session: session.id,
          tags: entry.tags,
          ttl_rounds: opts.ttl,
        });
        committed++;
      }
      console.log(`Session ${sessionId} ended. ${committed} entries committed to short-term memory. (round: ${round})`);
    } finally {
      closeDb();
    }
  });

const showCmd = new Command("show")
  .description("Show a session's details")
  .argument("<session-id>", "Session ID")
  .action((sessionId: string) => {
    const session = getSession(sessionId);
    if (!session) {
      console.error(`Session not found: ${sessionId}`);
      process.exitCode = 1;
      return;
    }
    console.log(JSON.stringify(session, null, 2));
  });

const listCmd = new Command("list")
  .description("List recent sessions")
  .option("--limit <n>", "Max results", parseInt)
  .action((opts) => {
    const sessions = listSessions({ limit: opts.limit ?? 10 });
    const summary = sessions.map((s) => ({
      id: s.id,
      started_at: s.started_at,
      ended_at: s.ended_at,
      entries: s.entries.length,
    }));
    console.log(JSON.stringify(summary, null, 2));
  });

export const sessionCommand = new Command("session")
  .description("Manage session memory")
  .addCommand(startCmd)
  .addCommand(addCmd)
  .addCommand(endCmd)
  .addCommand(showCmd)
  .addCommand(listCmd);
