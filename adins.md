# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**mem-x** is a self-evolving AI memory system with three-tier architecture: session → short-term → long-term (rules > semantic > episodic). Hybrid search (BM25 + vector) and an 8-step evolution engine for promoting short-term observations into long-term knowledge.

## Commands

```bash
# Build
bun run build

# Run CLI (without building)
npm run mem-x -- <command>

# Run compiled CLI
node dist/cli.js <command>

# Test
bun run test

# Lint
bun run lint
```

## Data & Config Location

All data and configuration live under `~/.mem-x/`:

```
~/.mem-x/
├── config.json              # Global config (embedding provider, model, API key)
├── default/                 # Default bucket
│   ├── mem-x.db             # SQLite database
│   └── sessions/            # Session JSON files
└── <custom-bucket>/         # Per-agent isolated data
    ├── mem-x.db
    └── sessions/
```

## Three-Tier Memory

### Tier 1: Session Memory
- JSON files in `~/.mem-x/<bucket>/sessions/`
- `src/memory/session.ts` — start, add entries, end, list
- On session end, entries auto-commit to short-term memory

### Tier 2: Short-term Memory
- SQLite `short_term` table with FTS5 + vec0
- `src/memory/layers/short-term.ts` — CRUD + `markPromoted()` + `purgeExpired()`
- Default TTL: 7 rounds. Expired items cleaned by `mem-x memory purge`
- During evolution, promoted to long-term or discarded

### Tier 3: Long-term Memory (Priority Order)
1. **Rules** — behavioral constraints, trigger conditions, verified patterns
2. **Semantic** — distilled knowledge, long-term patterns (version/status lifecycle: active/stale/deprecated)
3. **Episodic** — raw interaction records, specific events (can be `promoted` to semantic)

Each long-term layer has its own file under `src/memory/layers/`: `episodic.ts`, `semantic.ts`, `rules.ts`

## Database (`src/db/`)

- SQLite with WAL mode, FTS5 full-text search, and `sqlite-vec` for vector similarity
- Tables: `short_term`, `episodic`, `semantic`, `rules`, `tasks`, `evolution_log`
- Each searchable table has `_fts` (FTS5) and `_vec` (vec0) companion tables
- FTS5 indexes maintained via triggers for automatic BM25 indexing
- Vector dimensions auto-detected per embedding model (384–3072)

## Search (`src/memory/search.ts`)

- Three modes: `bm25` | `vector` | `hybrid` (default)
- Cross-layer priority: rules → short_term → semantic → episodic
- Hybrid uses Reciprocal Rank Fusion (k=60) to merge BM25 and vector scores
- Hit count tracking updates on each search for relevance feedback

## Debug Dashboard (`src/debug/`)

- `mem-x debug` launches a local web UI at `http://localhost:3210`
- Tabs: Overview (stats), Timeline (cross-layer), Browser (per-layer), Search (score breakdown), Health (integrity checks)
- API: `/api/stats`, `/api/timeline`, `/api/memories/:layer`, `/api/inspect/:layer/:id`, `/api/search`, `/api/health`

## Key File Paths

- `src/cli.ts` — CLI entry point (Commander.js)
- `src/cli/session.ts` — Session commands (start/add/end/show/list)
- `src/memory/store.ts` — Barrel re-exports for all memory CRUD
- `src/memory/helpers.ts` — Shared utilities (tags, embedding, hydration)
- `src/memory/search.ts` — Hybrid search implementation
- `src/db/schema/` — Table definitions, FTS5, vector tables
- `src/utils/config.ts` — Configuration management (`~/.mem-x/config.json`)
- `src/utils/bucket.ts` — Multi-bucket path resolution (`~/.mem-x/<bucket>/`)
- `skills/mem-x/SKILL.md` — Full skill spec and evolution engine documentation
