---
title: "Memory Architecture"
description: "The 4-tier memory system — session, working, long-term, and semantic memory powered by pgvector."
order: 10
icon: "cpu-chip"
---

# Memory Architecture — How Agents Remember and Learn

> **Memory is not recall. Memory is identity. Without persistent memory, an agent is just a very expensive function call. OpenClaw uses files on disk. Flowwink evolved this into a 4-tier PostgreSQL system with vector search.**

---

Think about your best colleague at work. What makes them valuable isn't just what they know today — it's that they remember your last conversation, they know how your business operates, they recall what didn't work last time, and they've built up an intuition about what you actually need. That accumulated context is what separates a trusted colleague from a new hire.

An agent without memory is the new hire every single morning. No matter how many tasks it completed yesterday, it wakes up fresh — blank slate, no context, no continuity. Every interaction starts from zero.

Memory is what makes the "digital employee" metaphor real rather than rhetorical. Without it, you don't have an employee. You have a very capable temp worker who forgets everything at the end of each shift.

---

## The Memory Problem

LLMs are stateless. Each API call starts fresh. Without a memory system, the agent has no continuity — it can't remember what it did yesterday, what it learned last week, or who it's talking to.

**OpenClaw's solution** (verified from source): Workspace files (`AGENTS.md`, `SOUL.md`, `TOOLS.md`, `IDENTITY.md`, `USER.md`, `HEARTBEAT.md`, `MEMORY.md`) are injected into every agent turn. Daily memory files (`memory/*.md`) are accessed on-demand via `memory_search` and `memory_get` tools. Simple, no database required, but all injected files consume tokens (capped at 20k per file, 150k total).

**Flowwink's evolution**: A 4-tier PostgreSQL system with vector search, designed for self-hosted business operations where each instance has its own database and memory is organized via RLS.

```
L1: Session Memory (ephemeral)
  │  Current conversation
  │  Cleared when session ends
  │
L2: Working Memory (short-term)
  │  Top 20-30 recent entries
  │  Ordered by recency
  │
L3: Long-term Memory (persistent)
  │  All persisted facts and lessons
  │  Full-text searchable
  │
L4: Semantic Memory (vector)
     Embeddings for similarity search
     pgvector cosine similarity
```

---

## L1: Session Memory

The current conversation history. This is what the LLM sees directly.

**Storage:** `chat_messages` table (or in-memory for edge functions)
**Access:** Linear scan (most recent N messages)
**Lifetime:** Session duration

Session memory includes:
- User messages
- Agent responses
- Tool calls and results
- System messages (skill instructions, context injection)

**Pruning:** When session memory approaches the context limit, older messages are summarized and replaced with a single `[SUMMARY]` message. Key facts are extracted and saved to L2/L3 before pruning.

---

## L2: Working Memory

The agent's "top of mind" — recent memories that are most likely relevant.

**Storage:** `agent_memory` table
**Access:** Key/category filter, ordered by `updated_at DESC LIMIT 30`
**Lifetime:** Until displaced by newer entries

Working memory is loaded into the system prompt at every reasoning cycle. It's limited to 30 entries to prevent context bloat.

```sql
SELECT * FROM agent_memory
WHERE category IN ('preference', 'context', 'fact')
ORDER BY updated_at DESC
LIMIT 30;
```

---

## L3: Long-term Memory

All persisted facts, lessons, and learned patterns.

**Storage:** `agent_memory` table (full)
**Access:** Full-text search via `pg_trgm`
**Lifetime:** Permanent (until explicitly deleted)

Long-term memory is searched when the agent needs specific information that's not in working memory.

```sql
SELECT * FROM agent_memory
WHERE to_tsvector('english', content) @@ plainto_tsquery('english', 'blog engagement')
ORDER BY updated_at DESC;
```

---

## L4: Semantic Memory

Vector embeddings for similarity-based retrieval.

**Storage:** `agent_memory.embedding` column (768-dimensional vector)
**Access:** pgvector cosine similarity
**Lifetime:** Permanent

Semantic memory enables the agent to find relevant memories even when the exact keywords don't match.

```sql
SELECT *, 1 - (embedding <=> $query_embedding) as similarity
FROM agent_memory
WHERE embedding IS NOT NULL
ORDER BY embedding <=> $query_embedding
LIMIT 5;
```

**Embedding providers** (auto-fallback):
1. OpenAI `text-embedding-3-small` (768d)
2. Gemini `text-embedding-004` (768d)

---

## Memory Categories

Memories are organized by category:

| Category | Purpose | Example |
|----------|---------|---------|
| `soul` | Agent personality & values | `{ purpose: "Help businesses grow", tone: "professional but warm" }` |
| `identity` | Agent identity & boundaries | `{ name: "FlowPilot", role: "Digital Operator", boundaries: ["No financial decisions"] }` |
| `preference` | Learned preferences | `preferred_blog_tone: "conversational"` |
| `context` | Operational context | `last_campaign_date: "2026-01-15"` |
| `fact` | Learned facts & patterns | `lesson:blog_engagement: { data_viz_posts: "3x more engagement" }` |
| `agents` | Operational rules | `{ direct_action_rules: [...], self_improvement: [...] }` |

---

## The Memory Lifecycle

```
Creation → Working → Long-term → Semantic → Retrieval → Influence
   │          │          │           │           │           │
   │          │          │           │           │           └─ Shapes future
   │          │          │           │           │              decisions
   │          │          │           │           └─ Found when
   │          │          │           │              needed
   │          │          │           └─ Embedded for
   │          │          │              similarity search
   │          │          └─ Persisted indefinitely
   │          └─ Top of mind (loaded every cycle)
   └─ Created by: reflection, learning,
      user input, or agent observation
```

### Creation

Memories are created by:
1. **Reflection** — The agent analyzes performance and saves learnings
2. **Learning** — The `flowpilot-learn` function distills feedback
3. **User input** — The user tells the agent something to remember
4. **Observation** — The agent notices a pattern during operation

### Embedding

New memories are automatically embedded:
```typescript
// In handleMemoryWrite()
const embedding = await generateEmbedding(content);
await supabase.from('agent_memory').upsert({
  key, category, content, embedding, importance
});
```

### Retrieval

When the agent needs information:
1. Check working memory (top 30) — fast, always loaded
2. If not found, search long-term memory — full-text search
3. If still not found, search semantic memory — vector similarity

---

## Workspace Files as Memory

Both OpenClaw and Flowwink use the same conceptual categories for agent configuration. The storage mechanism differs:

| Concept | OpenClaw (verified) | Flowwink (DB-driven) | Purpose |
|---------|--------------------|-----------------------|---------|
| Persona | `SOUL.md` (file, auto-injected) | `agent_memory` key `soul` | Persona, boundaries, tone |
| Identity | `IDENTITY.md` (file, auto-injected) | `agent_memory` key `identity` | Agent name, role, emoji |
| Rules | `AGENTS.md` (file, auto-injected) | `agent_memory` key `agents` | Operating instructions, conventions |
| Heartbeat | `HEARTBEAT.md` (file, auto-injected) | `heartbeat_protocol` memory key | Protocol text (7-step loop) |
| Tool policy | `TOOLS.md` (file, auto-injected) | `tool_policy` memory key | `{ blocked: string[] }` |
| Memory | `MEMORY.md` (file, auto-injected) | L2/L3/L4 tiers in `agent_memory` | Persistent facts and lessons |
| Daily notes | `memory/*.md` (on-demand via tools) | — | Day-to-day observations |

These are loaded into the system prompt at every reasoning cycle. They're the agent's "constitution" — the rules it lives by.

**Safety:** Internal system keys (`tool_policy`, `heartbeat_state`) are excluded from LLM context. This prevents infrastructure metadata from polluting the agent's reasoning.

---

## Memory Compression

As memory grows, compression becomes necessary:

```
preCompactionFlush(oldMessages, supabase)
  │
  ├── AI extracts up to 5 discrete facts from old messages
  ├── Each fact saved as agent_memory entry with vector embedding
  └── Old messages replaced with [SUMMARY]

pruneConversationHistory(messages, supabase)
  │
  ├── AI generates summary of old messages
  ├── Replaces old messages with [SUMMARY] message
  └── Keeps recent N messages intact
```

This ensures the agent doesn't lose important information when conversations get long.

---

## The Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| No memory | Agent starts from zero every session | Implement L2/L3 memory |
| Everything in context | Context window fills up instantly | Lazy loading + budget tiers |
| No categorization | Can't find relevant memories | Category-based filtering |
| No embedding | Can't find semantically similar memories | pgvector embedding |
| No compression | Context grows unbounded | Pre-compaction flush |
| No workspace files | Agent has no personality or rules | Soul/identity/agents keys |

---

*Memory is what transforms a stateless function into a persistent entity. Without it, the agent is a goldfish. With it, the agent is a colleague.*

*Next: managing the scarcest resource — prompt compilation, lazy loading, and the token budget. [The Token Economy →](07b-token-economy.md)*
