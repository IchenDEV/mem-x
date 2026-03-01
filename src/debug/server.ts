import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { getDb, closeDb } from "../db/connection.js";
import { getStats, getTimeline, inspectMemory, listLayerMemories, getHealth } from "./handlers.js";
import { debugSearch } from "./search-debug.js";
import { listSessions, getSession } from "../memory/session.js";
import { deleteMemory } from "../memory/store.js";
import { listTasks } from "../memory/layers/tasks.js";
import { ALL_LAYERS, type MemoryLayer } from "../memory/types.js";

function isValidLayer(s: string): s is MemoryLayer {
  return (ALL_LAYERS as readonly string[]).includes(s);
}

const thisDir = dirname(fileURLToPath(import.meta.url));
let cachedHtml: string | null = null;

function getDashboard(): string {
  if (!cachedHtml) cachedHtml = readFileSync(resolve(thisDir, "dashboard.html"), "utf-8");
  return cachedHtml;
}

function json(res: ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,DELETE,OPTIONS",
  });
  res.end(JSON.stringify(data));
}

async function route(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const p = url.pathname;
  const m = req.method ?? "GET";
  const param = (k: string, def: string) => url.searchParams.get(k) ?? def;

  if (m === "OPTIONS") {
    res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,DELETE,OPTIONS" });
    return res.end();
  }

  if (p === "/" && m === "GET") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(getDashboard());
  }

  if (p === "/api/stats") return json(res, getStats());
  if (p === "/api/timeline") return json(res, getTimeline(+param("limit", "50")));
  if (p === "/api/health") return json(res, getHealth());
  if (p === "/api/sessions") return json(res, listSessions({ limit: +param("limit", "20") }));
  if (p === "/api/tasks") return json(res, listTasks({ limit: +param("limit", "50") }));

  let match: RegExpMatchArray | null;

  if ((match = p.match(/^\/api\/sessions\/(.+)$/)) && m === "GET") {
    const s = getSession(match[1]);
    return s ? json(res, s) : json(res, { error: "Not found" }, 404);
  }

  if ((match = p.match(/^\/api\/memories\/(\w+)$/)) && m === "GET") {
    if (!isValidLayer(match[1])) return json(res, { error: "Invalid layer" }, 400);
    return json(res, listLayerMemories(match[1], +param("limit", "50")));
  }

  if ((match = p.match(/^\/api\/inspect\/(\w+)\/(.+)$/)) && m === "GET") {
    if (!isValidLayer(match[1])) return json(res, { error: "Invalid layer" }, 400);
    const r = inspectMemory(match[1], match[2]);
    return r ? json(res, r) : json(res, { error: "Not found" }, 404);
  }

  if ((match = p.match(/^\/api\/memories\/(\w+)\/(.+)$/)) && m === "DELETE") {
    if (!isValidLayer(match[1])) return json(res, { error: "Invalid layer" }, 400);
    return json(res, { ok: await deleteMemory(match[1], match[2]) });
  }

  if (p === "/api/search") {
    const q = param("q", "");
    const layer = url.searchParams.get("layer") as MemoryLayer | undefined;
    const mode = param("mode", "hybrid") as "bm25" | "vector" | "hybrid";
    return json(res, await debugSearch(q, { layer: layer || undefined, mode, limit: +param("limit", "10") }));
  }

  json(res, { error: "Not found" }, 404);
}

export function startDebugServer(port = 3210) {
  getDb();

  const server = createServer((req, res) => {
    route(req, res).catch((err) => json(res, { error: (err as Error).message }, 500));
  });

  server.listen(port, () => {
    console.log(`\n  mem-x Debug Dashboard`);
    console.log(`  http://localhost:${port}\n`);
  });

  process.on("SIGINT", () => {
    server.close();
    closeDb();
    process.exit(0);
  });

  return server;
}
