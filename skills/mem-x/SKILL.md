---
name: mem-x
description: Self-evolving AI memory system. Use on EVERY user message to recall context, capture insights, and evolve behavior. Provides `mem-x recall` for instant context bootstrap and `mem-x search` for targeted retrieval across episodic, semantic, rule, and short-term memory layers. Use when the user mentions mem-x, memory, remember, recall, evolve, review, reflect, or knowledge management. Use also when starting any conversation, when the user teaches something, corrects you, assigns a task, or states a preference.
---

# mem-x

## Agent Identity

Set a unique bucket name for isolation. Every command below inherits this scope.

```bash
export MEM_X_BUCKET=<agent-name>
# or prepend: mem-x --bucket <name> <command>
```

Use a stable, lowercase identifier — typically the project name or a constant like `claude-code`. Pick once and reuse it across all sessions for this agent so memories accumulate correctly.

---

## Core Loop

Execute these four rules on **every conversation**, in order.

### Rule 1 — Recall (first message)

On the **first user message**, immediately bootstrap context before responding:

```bash
mem-x recall
```

This outputs all active rules, pending tasks, and recent memories in one dump. Read and internalize everything.

Then search for topic-specific context based on the user's message:

```bash
mem-x search "<keywords from user's first message>"
```

**Apply all recalled rules immediately.** Note pending tasks. Use memories as context for your response.

If the conversation continues across multiple topics, search again as needed:

```bash
mem-x search "<new topic>"
```

### Rule 2 — Start Session (first message)

Start a session to track this conversation:

```bash
mem-x session start
# → Session started: <session-id>
```

Keep the session ID for all subsequent captures in this conversation.

### Rule 3 — Capture (every message)

On **every user message**, evaluate: did the user say something worth remembering?

| Signal | Action |
|--------|--------|
| User teaches a fact | `mem-x session add <id> --content "..." --tags "fact"` |
| User states a preference | `mem-x session add <id> --content "..." --tags "preference"` |
| User corrects you | `mem-x session add <id> --content "..." --tags "correction"` |
| Task completed with outcome | `mem-x session add <id> --content "..." --tags "outcome"` |
| User assigns a task | `mem-x task add --title "..." --priority <p>` |
| User says "always" / "never" | `mem-x memory add rules --trigger "..." --constraint "..." --reason "..."` |
| Pattern confirmed across 3+ sessions (visible in recall output) | `mem-x memory add semantic --topic "..." --content "..." --tags "..."` |

**Before every write**, check for conflicts:

```bash
mem-x search "<summary of new info>" --layer <target> --limit 5
```

- Duplicate found → skip
- Updated info → write new, note it supersedes old
- Contradiction → write new with correction context

**Skip**: greetings, trivial chat, temporary debug steps, information already captured.

### Rule 4 — Commit (conversation end)

When the conversation is clearly wrapping up — user says goodbye, the task is done, or the topic closes naturally. If unsure, commit anyway; it is safe to run multiple times.

```bash
mem-x session end <session-id>
mem-x memory purge
```

This commits all session entries to short-term memory (TTL 7 rounds), increments the round counter, and cleans expired entries.

---

## Evolution Workflow

### When to Trigger

| Condition | Action |
|-----------|--------|
| User says "evolve" / "review" / "reflect" / "复盘" | Run full 8-step workflow |
| 5+ sessions accumulated since last evolution | Run full 8-step workflow |
| Memory conflict detected during capture | Run Steps 2–6 |

### Step 1 — Commit

End the current session if active:

```bash
mem-x session end <session-id>
```

### Step 2 — Review

Gather all recent material:

```bash
mem-x recall --limit 30
mem-x memory list short_term --limit 30
```

Scan for: recurring topics, repeated mistakes, consistent preferences, knowledge gaps.

### Step 3 — Analyze

Write your analysis as a session entry (start a new session for the evolution process):

```bash
mem-x session start
# → Session started: <evo-session-id>

mem-x session add <evo-session-id> \
  --content "Analysis: user consistently prefers X over Y because Z. Pattern P appeared in 3 sessions." \
  --tags "evolution,analysis"
```

### Step 4 — Plan Promotions

Decide what to promote, discard, or consolidate. Record the plan:

```bash
mem-x session add <evo-session-id> \
  --content "Plan: promote 'prefer X over Y' → semantic; promote 'always use X' → rule; discard stale items A, B" \
  --tags "evolution,plan"
```

### Step 5 — Execute

Execute each promotion:

```bash
# Promote to semantic
mem-x memory add semantic \
  --topic "<knowledge topic>" \
  --content "<consolidated knowledge>" \
  --tags "promoted"

# Promote to rules
mem-x memory add rules \
  --trigger "<when this applies>" \
  --constraint "<what to do>" \
  --reason "<why, based on analysis>"

# Promote to episodic
mem-x memory add episodic \
  --event "<significant event>" \
  --context "<context>" \
  --result "<outcome>" \
  --tags "promoted"
```

### Step 6 — Verify

Check that new memories don't conflict with existing ones:

```bash
mem-x search "<new knowledge summary>" --layer rules --limit 5
mem-x search "<new knowledge summary>" --layer semantic --limit 5
```

If conflicts found: update or delete the conflicting entry, then re-verify.

### Step 7 — Log

Record this evolution cycle as an episodic event:

```bash
mem-x memory add episodic \
  --event "Evolution cycle: promoted N short-term → M semantic, K rules" \
  --context "evolution-cycle" \
  --result "<summary: what was promoted, what was discarded, what was updated>" \
  --tags "evolution"
```

### Step 8 — Distill

Search past evolution logs for meta-patterns:

```bash
mem-x search "evolution" --layer episodic --limit 20
```

If a recurring pattern emerges across evolution cycles (e.g., "user always rejects class-based code"), write a meta-rule:

```bash
mem-x memory add rules \
  --trigger "<meta-pattern trigger>" \
  --constraint "<distilled constraint>" \
  --reason "Meta-pattern observed across N evolution cycles"
```

End the evolution session:

```bash
mem-x session end <evo-session-id>
```

---

## Maintenance

### After Every Conversation (mandatory — part of Rule 4)

```bash
mem-x memory purge
```

### During Every Evolution (part of Step 2)

While reviewing, also inspect for:

**Stale semantic memories** — no hits in 30+ days:

```bash
mem-x memory list semantic --limit 50
```

Entries with `hit_count: 0` or very old `last_hit_at` → delete or update.

**Redundant short-term entries** — multiple entries about the same topic:

→ Consolidate into one semantic memory in Step 5, originals expire naturally.

**Unverified rules** — rules with `hit_count: 0`:

```bash
mem-x memory list rules --limit 50
```

→ Next time their trigger fires, actively test. If still valid, keep. If not, delete:

```bash
mem-x memory delete <id> --layer rules
```

### Weekly Check (when 5+ sessions since last evolution)

Run the full 8-step evolution workflow. Find the last evolution timestamp:

```bash
mem-x search "evolution-cycle" --layer episodic --limit 1
mem-x session list --limit 10
```

Count sessions created after the last evolution episodic entry. If 5+, trigger evolution.

---

## CLI Reference

```
# Context bootstrap
mem-x recall [--limit N]                                 # Dump all rules, tasks, recent memories

# Session (Tier 1 — ephemeral)
mem-x session start                                      # Start session → returns <session-id>
mem-x session add <id> --content "..." [--tags "a,b"]    # Add entry to session
mem-x session end <id> [--ttl <rounds>]                   # End → commit to short-term + round++
mem-x session show <id>                                  # View session details
mem-x session list [--limit N]                           # List recent sessions

# Memory CRUD (Tier 2 & 3)
mem-x memory add short_term --content "..." [--ttl <rounds>] [--tags "..."]
mem-x memory add episodic --event "..." [--context C] [--result R] [--tags "..."]
mem-x memory add semantic --topic "..." --content "..." [--tags "..."]
mem-x memory add rules --trigger "..." --constraint "..." [--reason "..."]
mem-x memory list <layer> [--since DATE] [--limit N]
mem-x memory get <id> --layer <layer>
mem-x memory delete <id> --layer <layer>
mem-x memory purge                                       # Clean expired short-term

# Search (BM25 + vector hybrid)
mem-x search "<query>" [--layer L] [--mode bm25|vector|hybrid] [--limit N]

# Tasks
mem-x task add --title "..." [--priority P] [--deadline D] [--tags "..."]
mem-x task list [--status S] [--limit N]
mem-x task update <id> --status <status>

# Config & Debug
mem-x config show
mem-x config set <key> <value>
mem-x debug [--port 3210]                                # Launch web debug dashboard

# Global: mem-x --bucket <name> <command>  or  MEM_X_BUCKET=<name>
```

---

## Architecture Reference

```
Session Memory ──[session end]──▶ Short-term ──[evolution]──▶ Long-term
  (JSON files)                     (TTL 7 rounds)              ├── Episodic (diary)
  ephemeral                        SQLite + FTS5 + vec0        ├── Semantic (knowledge)
  per-conversation                 searchable, round-decay     └── Rules (constraints)
```

| Tier | Layer | Lifespan | Analogy |
|------|-------|----------|---------|
| 1 | Session | Single conversation | Scratch paper |
| 2 | Short-term | 7 rounds (configurable) | Sticky notes |
| 3 | Episodic | Permanent | Diary |
| 3 | Semantic | Permanent | Notebook |
| 3 | Rules | Permanent, highest priority | Rulebook |

- **Search priority**: Rules → Short-term → Semantic → Episodic
- **Search modes**: BM25 (keyword) + vector (semantic) → fused via Reciprocal Rank Fusion
- **Storage**: SQLite with FTS5 full-text index + sqlite-vec vector extension
- **Bucket isolation**: Each agent gets `~/.mem-x/<bucket>/` with own DB + sessions
