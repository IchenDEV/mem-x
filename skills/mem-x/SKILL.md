# mem-x: Self-Evolving AI Long-Term Memory System

Use this skill when you need to persist knowledge across conversations, recall past interactions, capture tasks, or improve your own behavior over time. This skill turns any AI assistant into a learning system with accurate, evolving long-term memory.

## Prerequisites

- The `mem-x` CLI must be installed and built: `cd <mem-x-root> && npm install && npm run build`
- Database must be initialized: `npx mem-x init`
- Embedding API key must be configured: `npx mem-x config set embedding.apiKey <key>`

---

## 1. System Overview

### Core Concept

mem-x gives you three layers of persistent memory, ordered by priority:

1. **Rules** (highest priority): Explicit behavioral constraints you must follow. Always check rules first.
2. **Semantic Memory**: Distilled knowledge and patterns — your long-term knowledge base.
3. **Episodic Memory**: Raw interaction records — specific events, conversations, task outcomes.

These layers form a lifecycle: episodic events accumulate → patterns get distilled into semantic knowledge → validated patterns become rules. An evolution engine drives this process.

### CLI Quick Reference

All memory operations go through the `mem-x` CLI. Run commands using `npx mem-x <command>` from the project root.

```
# Initialize
mem-x init

# Memory CRUD
mem-x memory add episodic --event "..." [--context "..."] [--result "..."] [--tags "a,b"]
mem-x memory add semantic --topic "..." --content "..." [--tags "a,b"]
mem-x memory add rules --trigger "..." --constraint "..." [--reason "..."]
mem-x memory list <layer> [--since YYYY-MM-DD] [--limit N]
mem-x memory get <id> --layer <layer>
mem-x memory delete <id> --layer <layer>

# Search (dual-path: BM25 + vector)
mem-x search "<query>" [--layer <layer>] [--mode bm25|vector|hybrid] [--limit N]

# Tasks
mem-x task add --title "..." [--deadline "..."] [--priority low|medium|high|urgent]
mem-x task list [--status pending|in_progress|done|cancelled]
mem-x task update <id> --status <status>

# Config
mem-x config show
mem-x config set <key> <value>
```

### Search Priority

When you need to recall information, search in this order:

1. **Rules first** — `mem-x search "<query>" --layer rules` — These are constraints you must follow.
2. **Semantic next** — `mem-x search "<query>" --layer semantic` — General knowledge and patterns.
3. **Episodic last** — `mem-x search "<query>" --layer episodic` — Specific past events.

Or search all layers at once: `mem-x search "<query>"` (results are ranked by relevance across layers).

---

## 2. Memory Management

### When to Write Episodic Memory

Write an episodic memory (`mem-x memory add episodic`) when:

- The user shares a fact, preference, or decision that may be useful later
- A task is completed (record what was done and the outcome)
- An error occurs and is resolved (record the problem and solution)
- The user corrects your behavior (record the correction)

Example:
```bash
mem-x memory add episodic \
  --event "User prefers functional programming style over classes in TypeScript" \
  --context "code-review" \
  --tags "preference,typescript,coding-style"
```

### When to Write Semantic Memory

Write semantic memory (`mem-x memory add semantic`) when:

- You notice a pattern across multiple episodic memories (e.g., user always prefers X over Y)
- You distill a general principle from specific experiences
- You learn a reusable piece of knowledge

Example:
```bash
mem-x memory add semantic \
  --topic "User coding preferences" \
  --content "Prefers functional programming. Files should be under 300 lines. Uses TypeScript with ESM modules." \
  --tags "preference,coding-style"
```

### When to Write Rules

Write a rule (`mem-x memory add rules`) when:

- A behavioral constraint has been clearly established and validated
- The user explicitly states "always do X" or "never do Y"
- A pattern has been confirmed multiple times and should be enforced

Example:
```bash
mem-x memory add rules \
  --trigger "When writing TypeScript code" \
  --constraint "Use functional programming style. Avoid classes. Keep files under 300 lines." \
  --reason "User's explicit coding style preference, confirmed across multiple sessions"
```

### Conflict Detection

Before writing a new memory, search for similar existing memories:

```bash
mem-x search "<summary of new memory>" --layer <target-layer> --limit 5
```

If a result is highly similar:
- **Same information**: Skip writing (avoid duplicates)
- **Updated information**: Write new memory, note that it supersedes the old one
- **Contradictory**: Write the new memory with the correction context, and flag the old memory for review during evolution

---

## 3. Knowledge Capture

During every conversation, actively identify information worth remembering:

### What to Capture

| Signal | Action | Example |
|--------|--------|---------|
| User teaches a fact | Write episodic | "Our API uses JWT tokens with 1h expiry" |
| User states preference | Write episodic | "I prefer Tailwind over CSS modules" |
| User corrects you | Write episodic (record correction) | "No, we use PostgreSQL not MySQL" |
| Task completed | Write episodic (record outcome) | "Migrated auth from session to JWT" |
| User assigns task | Create task | "Fix the login bug by Friday" |
| User says "always/never" | Write rule directly | "Always use named exports" |

### What NOT to Capture

- Trivial small talk or greetings
- Temporary debugging steps that won't be useful later
- Information already well-captured in existing memories
- Extremely context-specific details with no reuse value

### Handling Corrections

When the user corrects you:

1. Search for the incorrect memory: `mem-x search "<incorrect belief>" --limit 5`
2. Note which memory was wrong (by ID)
3. Write a new episodic memory recording the correction, referencing the old memory
4. The evolution engine will handle adjusting confidence scores

---

## 4. Evolution Engine

The evolution engine is what makes mem-x a *self-evolving* system rather than a simple database. It runs an 8-step workflow to continuously improve memory quality.

### Eight-Step Workflow

```
Commit → Review → Why → Solution → Update → Check → Log → Distill
```

**Step 1 — Commit**: Record the current session's key information as episodic memory.
```bash
mem-x memory add episodic --event "<session summary>" --context "<project>" --tags "session"
```

**Step 2 — Review**: Search recent episodic memories for patterns.
```bash
mem-x search "recent patterns" --layer episodic --limit 20
```
Look for: recurring topics, repeated mistakes, consistent preferences, knowledge gaps.

**Step 3 — Why**: Analyze the patterns. Ask: Why did certain approaches work or fail? What underlying principle explains the pattern?

**Step 4 — Solution**: Design improvements:
- New semantic memory to capture a discovered pattern
- New rule to enforce a validated behavior
- Updates to existing memories (corrections, confidence adjustments)

**Step 5 — Update**: Execute the improvements via CLI commands.

**Step 6 — Check**: Verify the updates don't conflict with existing high-confidence memories:
```bash
mem-x search "<new knowledge summary>" --layer semantic --limit 5
mem-x search "<new knowledge summary>" --layer rules --limit 5
```

**Step 7 — Log**: Record what was done in this evolution cycle (for future meta-analysis).

**Step 8 — Distill**: If multiple evolution cycles have accumulated, look for meta-patterns and distill higher-level knowledge.

### When to Trigger

| Trigger | What to Run |
|---------|-------------|
| End of every conversation | At minimum: Step 1 (Commit) |
| User asks to "evolve" / "review" / "reflect" | Full 8-step workflow |
| Memory conflict detected | Steps 2-6 (Review through Check) |
| Accumulated 5+ sessions without evolution | Full 8-step workflow |

### Memory Quality Maintenance

During evolution, look for:

- **Stale memories**: Semantic memories that haven't been hit recently → mark status as "stale"
- **Low-confidence memories**: Episodic memories that were corrected → already have lower confidence
- **Redundant episodics**: Multiple episodic memories saying the same thing → distill into one semantic memory
- **Unverified rules**: Rules that haven't been tested → flag for verification next time the trigger condition occurs
