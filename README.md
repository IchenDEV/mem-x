# mem-x

[中文文档](./README_ZH.md)

Self-evolving AI memory system with three-tier architecture: **session → short-term → long-term**. Dual-path search (BM25 + vector) and an evolution engine that continuously accumulates, distills, and corrects knowledge — delivered as an Agent Skill compatible with any AI assistant.

## Features

- **Three-Tier Memory** — Session (conversation buffer) → Short-term (round-based TTL, auto-decay) → Long-term (episodic / semantic / rules)
- **Dual-Path Search** — BM25 keyword + vector similarity, fused via Reciprocal Rank Fusion (RRF)
- **Evolution Engine** — 8-step workflow promoting short-term observations into long-term knowledge
- **Context Bootstrap** — `mem-x recall` aggregates rules, tasks, and recent memories for cold-start
- **Multi-Bucket Isolation** — Each agent gets an isolated data directory under `~/.mem-x/<bucket>/`
- **Debug Dashboard** — Browser-based UI for inspecting memory stats, timeline, health, and search
- **Pluggable Embedding** — OpenAI API, Ollama, or any OpenAI-compatible endpoint (e.g. LM Studio)
- **Universal Agent Skill** — A single `SKILL.md` grants any AI assistant self-evolving memory
- **SQLite All-in-One** — Data, FTS5 full-text index, and sqlite-vec vector index in a single file

## Quick Start

```bash
bun install
bun run build

# Initialize database (creates ~/.mem-x/default/mem-x.db)
npx mem-x init

# Configure embedding (stored in ~/.mem-x/config.json)
npx mem-x config set embedding.apiKey sk-xxx
npx mem-x config set embedding.baseUrl http://localhost:1234/v1
npx mem-x config set embedding.model text-embedding-bge-m3
```

## CLI Reference

```bash
# Database
mem-x init                                       # Initialize database

# Context Bootstrap
mem-x recall [--limit N]                         # Aggregate rules + tasks + recent memories

# Session Memory (Tier 1 — conversation buffer)
mem-x session start                              # Start a new session
mem-x session add <id> --content "..." [--tags]  # Add entry to session
mem-x session end <id> [--ttl <rounds>]          # End session → commit to short-term
mem-x session show <id>                          # Show session details
mem-x session list                               # List recent sessions

# Memory CRUD (Tier 2 & 3)
mem-x memory add short_term --content "..." [--tags "a,b"] [--ttl <rounds>]
mem-x memory add episodic   --event "..." [--context "..."] [--result "..."] [--tags "a,b"]
mem-x memory add semantic   --topic "..." --content "..." [--tags "a,b"]
mem-x memory add rules      --trigger "..." --constraint "..." [--reason "..."]
mem-x memory list <layer> [--since YYYY-MM-DD] [--limit N]
mem-x memory get <id> [--layer <layer>]
mem-x memory delete <id> [--layer <layer>]
mem-x memory purge                               # Remove expired short-term memories

# Search (dual-path: BM25 + vector, priority: rules > short_term > semantic > episodic)
mem-x search "<query>" [--layer short_term|episodic|semantic|rules] [--mode bm25|vector|hybrid] [--limit N]

# Tasks
mem-x task add --title "..." [--deadline "..."] [--priority low|medium|high|urgent]
mem-x task list [--status pending|in_progress|done|cancelled]
mem-x task update <id> --status <status>

# Debug Dashboard
mem-x debug [--port 3030]                        # Launch browser-based debug UI

# Config
mem-x config show
mem-x config set <key> <value>

# Multi-Bucket (agent isolation)
mem-x --bucket my-agent <command>                # Use isolated data directory under ~/.mem-x/
MEM_X_BUCKET=my-agent mem-x <command>            # Or via environment variable
```

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                      Agent Skill                         │
│                 (skills/mem-x/SKILL.md)                  │
├──────────────────────────────────────────────────────────┤
│                       CLI Layer                          │
│  init │ session │ memory │ search │ task │ recall │ debug│
├──────────────────────────────────────────────────────────┤
│ Session (JSON)  │ Short-term + Long-term (SQLite)        │
│ ~/.mem-x/       │ Memory Store │ Dual-Path Search        │
│  <bucket>/      │ CRUD + embed │ BM25 + Vector → RRF     │
├──────────────────────────────────────────────────────────┤
│ Embedding Providers           │ SQLite Database           │
│ OpenAI / Ollama / Custom      │ FTS5 + sqlite-vec         │
└──────────────────────────────────────────────────────────┘
```

### Memory Tiers

| Tier | Layer | TTL | Storage | Search |
|------|-------|-----|---------|--------|
| 1 | **Session** | Conversation | JSON files | N/A |
| 2 | **Short-term** | 7 rounds (configurable) | SQLite + FTS5 + vec0 | BM25 + Vector |
| 3 | **Rules** (highest priority) | Permanent | SQLite + FTS5 + vec0 | BM25 + Vector |
| 3 | **Semantic** | Permanent | SQLite + FTS5 + vec0 | BM25 + Vector |
| 3 | **Episodic** | Permanent | SQLite + FTS5 + vec0 | BM25 + Vector |

### Memory Lifecycle

```
Session entries ──[session end]──▶ Short-term ──[evolution]──▶ Episodic
                                                           ──▶ Semantic
                                                           ──▶ Rules
                                                           ──▶ (discard)
```

### Project Structure

```
src/
├── cli.ts                  # Entry point + global --bucket option
├── cli/                    # CLI commands
│   ├── session.ts          #   session start/add/end/show/list
│   ├── memory.ts           #   memory list/get/delete/purge
│   ├── memory-add.ts       #   memory add (extracted subcommand)
│   ├── memory-utils.ts     #   Shared CLI helpers
│   ├── search.ts           #   search (BM25/vector/hybrid)
│   ├── task.ts             #   task add/list/update
│   ├── recall.ts           #   recall (context bootstrap)
│   ├── config.ts           #   config show/set
│   ├── init.ts             #   init
│   └── debug.ts            #   debug (dashboard server)
├── db/
│   ├── connection.ts       # SQLite singleton + sqlite-vec extension
│   ├── schema/             # Schema definitions (split for clarity)
│   │   ├── tables.ts       #   Data tables + metadata
│   │   ├── fts.ts          #   FTS5 virtual tables + triggers
│   │   ├── vec.ts          #   vec0 vector tables
│   │   └── index.ts        #   Schema orchestrator
│   ├── migrate.ts          # Database initialization
│   └── rounds.ts           # Round counter for short-term TTL
├── debug/
│   ├── handlers.ts         # Stats, timeline, health, inspect
│   ├── search-debug.ts     # Debug-mode search with score breakdown
│   └── server.ts           # HTTP server + dashboard HTML
├── embedding/
│   ├── provider.ts         # EmbeddingProvider interface
│   ├── openai.ts           # OpenAI-compatible provider
│   ├── ollama.ts           # Ollama provider
│   └── factory.ts          # Provider factory
├── memory/
│   ├── types.ts            # TypeScript interfaces
│   ├── session.ts          # Session memory (JSON file I/O)
│   ├── layers/             # Memory layer CRUD (one file per layer)
│   │   ├── episodic.ts
│   │   ├── semantic.ts
│   │   ├── rules.ts
│   │   ├── short-term.ts
│   │   └── tasks.ts
│   ├── helpers.ts          # Tags, embedding, row hydration
│   ├── store.ts            # Barrel re-exports
│   ├── search.ts           # BM25 + vector + RRF fusion
│   └── recall.ts           # Context bootstrap aggregation
└── utils/
    ├── config.ts           # Configuration management (~/.mem-x/config.json)
    ├── bucket.ts           # Multi-bucket path resolution (~/.mem-x/<bucket>/)
    └── id.ts               # UUID generation
```

## Agent Skill

The `skills/mem-x/SKILL.md` file is the complete AI skill definition. Point any AI assistant (Cursor, Claude Code, Windsurf, etc.) to this file and it will gain self-evolving memory capabilities — no code integration needed.

A Chinese version is available at `skills/mem-x/SKILL_ZH.md`.

## Tech Stack

- **Runtime**: Node.js >= 20
- **Package Manager**: Bun
- **Language**: TypeScript (ESM)
- **Database**: SQLite (better-sqlite3) + FTS5 + sqlite-vec
- **Embedding**: OpenAI SDK (compatible with LM Studio, Ollama, etc.)
- **Testing**: Vitest (137 tests, 90%+ coverage)
- **Linting**: ESLint + typescript-eslint

## License

MIT
