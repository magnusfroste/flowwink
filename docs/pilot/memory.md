---
title: Memory Architecture
summary: How Pilot stores, retrieves, and evolves agent memory using PostgreSQL + pgvector
read_when: Working on agent memory, embeddings, or knowledge persistence
---

# Memory Architecture

> **OpenClaw pattern:** Markdown files on disk (`SOUL.md`, `IDENTITY.md`, etc.)
> **Pilot implementation:** PostgreSQL table `agent_memory` with pgvector embeddings and RLS

---

## The 4-Tier Memory Model

Pilot implements a tiered memory system that mirrors how human memory works — fast short-term recall at the top, deep semantic search at the bottom.

```
┌─────────────────────────────────────────────┐
│  L1: SESSION MEMORY                         │
│  Current conversation in chat_messages      │
│  Access: linear scan, always in context     │
│  Lifetime: conversation scope               │
├─────────────────────────────────────────────┤
│  L2: WORKING MEMORY                         │
│  Top 20 recent memories from agent_memory   │
│  Access: key/category filter, by updated_at │
│  Lifetime: persistent, recency-ranked       │
├─────────────────────────────────────────────┤
│  L3: LONG-TERM MEMORY                       │
│  All entries in agent_memory                 │
│  Access: key lookup, category filter         │
│  Lifetime: persistent until deleted          │
├─────────────────────────────────────────────┤
│  L4: SEMANTIC MEMORY                         │
│  Vector embeddings (768d) in agent_memory    │
│  Access: search_memories_hybrid() RPC        │
│  Lifetime: persistent, searchable by meaning │
└─────────────────────────────────────────────┘
```

## Database Schema

```sql
-- agent_memory table
id          UUID PRIMARY KEY
key         TEXT UNIQUE          -- identifier (e.g. 'soul', 'user_prefers_dark_mode')
value       JSONB                -- the actual content
category    agent_memory_category -- 'preference' | 'context' | 'fact'
embedding   vector(768)          -- pgvector embedding for semantic search
created_by  agent_type           -- 'flowpilot' | 'user' | 'system'
expires_at  TIMESTAMPTZ          -- optional TTL
created_at  TIMESTAMPTZ
updated_at  TIMESTAMPTZ
```

## Reserved System Keys

These keys are stored in `agent_memory` but **excluded from LLM context** in `loadMemories()` to prevent infrastructure metadata from polluting reasoning:

| Key | Purpose | Excluded from LLM |
|-----|---------|-------------------|
| `soul` | Persona, values, tone, philosophy | No (injected via prompt Layer 2) |
| `identity` | Agent name, role, emoji | No (injected via prompt Layer 2) |
| `agents` | Operational rules, conventions | No (injected via prompt Layer 3) |
| `tools` | User-maintained tool notes | No |
| `user` | User profile, preferred address | No |
| `heartbeat_state` | Last run metadata | **Yes** |
| `heartbeat_protocol` | 7-step loop config | **Yes** |
| `tool_policy` | Blocked/allowed skills | **Yes** |
| `expected_skill_hash` | Drift detection hash | **Yes** |

## Workspace Files (OpenClaw Mapping)

OpenClaw stores agent identity as Markdown files on disk. Pilot stores them as JSON in `agent_memory`:

| OpenClaw File | Pilot Key | Content |
|--------------|-----------|---------|
| `SOUL.md` | `soul` | `{ purpose, values[], tone, philosophy }` |
| `IDENTITY.md` | `identity` | `{ name, role, capabilities[], boundaries[] }` |
| `AGENTS.md` | `agents` | `{ direct_action_rules, self_improvement, memory_guidelines }` |
| `TOOLS.md` | `tools` | `{ blocked: string[] }` |
| `USER.md` | `user` | `{ name, preferences }` |
| `BOOTSTRAP.md` | N/A | Handled by `setup-flowpilot` edge function |

## Hybrid Search (70% Vector + 30% Keyword)

The `memory_read` tool uses `search_memories_hybrid()` — a PostgreSQL RPC function that combines:

1. **Vector similarity** (70% weight) — cosine distance on 768d embeddings
2. **Keyword matching** (30% weight) — `pg_trgm` trigram similarity on key + value text

This means the agent can search by meaning ("what does the user prefer?") or exact terms ("api_key_stripe") and both work.

### Embedding Providers (Auto-Fallback)

1. **OpenAI** `text-embedding-3-small` (768 dimensions)
2. **Gemini** `text-embedding-004` (768 dimensions)

The `handleMemoryWrite` handler automatically generates embeddings when writing. If the primary provider fails, it falls back to the secondary.

## Memory Write Flow

```
Agent calls memory_write({ key, value, category })
  │
  ├── 1. Generate embedding from value text
  │     └── OpenAI text-embedding-3-small (fallback: Gemini)
  │
  ├── 2. Upsert into agent_memory
  │     └── ON CONFLICT(key) → UPDATE value, embedding, updated_at
  │
  └── 3. Return confirmation
```

## Memory Read Flow

```
Agent calls memory_read({ query, category? })
  │
  ├── 1. Generate embedding from query text
  │
  ├── 2. Call search_memories_hybrid() RPC
  │     ├── Vector: cosine_similarity(query_embedding, embedding)
  │     ├── Keyword: pg_trgm similarity(query, key || value)
  │     └── Combined: 0.7 * vector_score + 0.3 * keyword_score
  │
  ├── 3. Filter by category (if provided)
  │
  └── 4. Return top N results with scores
```

## Context Isolation

`loadMemories()` in `reason.ts` loads the top 20 most recently updated memories into the system prompt — but explicitly excludes system keys:

```typescript
.not('key', 'in', '("soul","identity","agents","heartbeat_state",...)')
```

Each memory entry is truncated to 150 chars in the prompt, with a hint to use `memory_read` for full values:

```
Memory (use memory_read for full values):
- [preference] user_timezone: Europe/Stockholm
- [fact] company_name: FlowWink AB
- [context] last_deployment: 2026-04-10, edge functions updated…
```

## Self-Evolution via Memory

The agent evolves by writing to its own workspace files:

- **`soul_update`** → modifies the `soul` key (persona evolution)
- **`agents_update`** → modifies the `agents` key (operational rules evolution)
- **`reflect`** → auto-persists learnings as new memory entries

This implements OpenClaw's principle that the agent should be able to change its own character over time, with all changes audit-logged in `agent_activity`.

---

*See also: [Architecture](./architecture.md) · [Context Engine](./context-engine.md) · [Compaction](./compaction.md)*
