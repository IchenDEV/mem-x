# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**mem-x** is a self-evolving AI memory system with a three-layer priority-based architecture (rules > semantic > episodic), hybrid search (BM25 + vector), and an 8-step evolution engine for distilling experience into knowledge.

## Commands

```bash
# Build
npm run build           # Compile TypeScript to dist/
npm run dev             # Watch mode

# Run CLI directly (without building)
npm run mem-x -- <command>

# Run compiled CLI
node dist/cli.js <command>
```

No test runner or linter is configured.

## CLI Command Structure

```bash
mem-x init                          # Initialize database
mem-x memory add <layer> <content>  # Add memory (episodic|semantic|rules)
mem-x memory list <layer>           # List memories
mem-x memory get <layer> <id>       # Get specific memory
mem-x memory delete <layer> <id>    # Delete memory
mem-x search <query>                # Hybrid search across layers
mem-x task add <title>              # Add task
mem-x task list                     # List tasks
mem-x task update <id> <status>     # Update task status
mem-x config get <key>              # Get config value
mem-x config set <key> <value>      # Set config value (e.g., embedding.apiKey)
```

## Architecture

### Memory Layers (Priority Order)
1. **Rules** — behavioral constraints, trigger conditions, verified patterns
2. **Semantic** — distilled knowledge, long-term patterns, topics (with version/status lifecycle: active/stale/deprecated)
3. **Episodic** — raw interaction records, specific events (can be `promoted` to semantic)

### Database (`src/db/`)
- SQLite with WAL mode, FTS5 full-text search, and `sqlite-vec` for vector similarity
- Schema creates four tables: `episodic_memory`, `semantic_memory`, `rules`, `tasks`
- FTS5 indexes are maintained via triggers for automatic BM25 indexing
- Vector dimensions auto-detected per embedding model (384–3072)
- `src/db/migrate.ts` handles dimension changes when switching models

### Search (`src/memory/search.ts`)
- Three modes: `bm25` | `vector` | `hybrid` (default)
- Hybrid uses Reciprocal Rank Fusion (k=60) to merge BM25 and vector scores
- Hit count tracking updates on each search for relevance feedback
- Layer filtering is optional; cross-layer search is default

### Embedding Providers (`src/embedding/`)
- Factory pattern in `factory.ts`, interface in `provider.ts`
- **OpenAI**: text-embedding-3-small (1536D), text-embedding-3-large (3072D), ada-002
- **Ollama**: nomic-embed-text (768D), all-minilm (384D), mxbai-embed-large (1024D)
- Configured via `mem-x.config.json` (`embedding.provider`, `embedding.model`, `embedding.apiKey`)

### Configuration
- `mem-x.config.json` at project root — JSON format
- Access nested keys with dot notation: `embedding.apiKey`, `database.path`
- `src/utils/config.ts` handles loading/saving with nested key support

## Evolution Engine (SKILL.md)

The `skills/mem-x/SKILL.md` file defines the 8-step evolution workflow for AI assistants using this system:
1. **Commit** → Record session as episodic
2. **Review** → Search for patterns
3. **Why** → Analyze underlying principles
4. **Solution** → Design improvements
5. **Update** → Execute via CLI
6. **Check** → Verify against existing high-confidence memories
7. **Log** → Document evolution cycle
8. **Distill** → Extract meta-patterns

Triggers: end of every session (minimal: step 1), user requests reflection, memory conflicts, or after 5+ sessions without evolution.

## Key File Paths
- `src/cli.ts` — CLI entry point (Commander.js)
- `src/memory/store.ts` — All CRUD operations for all three layers (~380 lines)
- `src/memory/search.ts` — Hybrid search implementation
- `src/db/schema.ts` — Table definitions, FTS5, vector tables
- `src/db/connection.ts` — Singleton DB connection
- `skills/mem-x/SKILL.md` — Full skill spec and evolution engine documentation
- `data/mem-x.db` — SQLite database (not committed to source control)
