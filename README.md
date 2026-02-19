# mem-x

Self-evolving AI long-term memory system.

Three-layer memory (episodic / semantic / rules) + evolution engine (8-step iteration) that continuously accumulates, distills, and corrects knowledge. SQLite dual-path search (vector + BM25), delivered as an Agent Skill compatible with any AI assistant.

## Quick Start

```bash
npm install
npm run build

# Initialize database
npx mem-x init

# Configure embedding API key
npx mem-x config set embedding.apiKey sk-xxx
```

## CLI Commands

```bash
mem-x init                                    # Initialize database and directories
mem-x memory add <layer> --event "..."        # Add a memory
mem-x memory list <layer> [--since DATE]      # List memories
mem-x memory get <id>                         # Get a single memory
mem-x memory delete <id>                      # Delete a memory
mem-x search <query> [--layer L] [--mode M]   # Search (bm25/vector/hybrid)
mem-x task add --title "..."                  # Add a task
mem-x task list [--status S]                  # List tasks
mem-x task update <id> --status done          # Update task status
mem-x config set <key> <value>                # Update configuration
```

## Architecture

- **Episodic Memory**: Raw interaction records, short-term accumulation
- **Semantic Memory**: Distilled knowledge/patterns, long-term knowledge base
- **Rules**: Behavioral constraints, highest priority
- **Evolution Engine**: 8-step workflow (Commit → Review → Why → Solution → Update → Check → Log → Distill)

## Agent Skill

The `skills/mem-x/SKILL.md` file contains the complete AI skill definition. Any AI assistant that can read skill files will gain self-evolving memory capabilities.
