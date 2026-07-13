---
title: "Retrieval Engine — Phase 1 spec"
status: "approved spec, ready to build (2026-07-13)"
last_updated: "2026-07-13"
---

# Retrieval Engine — Phase 1 spec

Implements Phase 1 of
[Conversation & Retrieval](./conversation-and-retrieval.md): a **platform
primitive** in `supabase/functions/_shared/retrieval/` that grounds every
conversation surface in relevant knowledge — replacing the public chat's
bulk-dump (`buildKnowledgeBase`), Flowwork/workspace-chat's recent-25-rows
(`buildContext`), and docs-chat's hand-rolled keyword scorer.

Named for what it does (retrieves knowledge relevant to a query, for a given
identity). NOT under `pilot/`, NOT named for any consumer — same rule as the
Skill Relevance Engine.

## 1. The two lanes (and the source-plugin contract)

Conversations draw on two kinds of data, retrieved two different ways:

| Lane | Data shape | Mechanism | Freshness |
|---|---|---|---|
| **Chunk index** | Knowledge-shaped prose: pages, KB articles, wiki, docs, extracted document text | `knowledge_chunks` + hybrid tsvector/pgvector ranking | Near-live (indexed on write) |
| **Live query** | Structured/transactional rows: Flowtable records, orders, invoices, CRM | Existing skills (`query_flowtable`, order lookups, …) with the caller's rights | Always live |

**Structured data is never chunk-indexed.** Chunking a Flowtable base or an
orders table produces stale copies of data that already has a rich, filtered,
RLS-guarded query surface. The "ask about an error code in a 6 000-row
catalog" case is a live-query hit (`query_flowtable` with a filter), not a
semantic-search hit.

Both lanes present to consumers through one **source contract** so a surface
like Flowwork composes them uniformly:

```ts
interface RetrievalSource {
  key: string;                       // 'kb' | 'pages' | 'wiki' | 'docs' | 'flowtable' | ...
  kind: 'chunks' | 'live';
  retrieve(q: RetrievalQuery): Promise<RetrievalResult[]>;
}
```

`chunks` sources all delegate to the shared chunk query (§4); `live` sources
wrap a skill/RPC. **Coordination note (Flowwork):** the queued
"Flowtable-as-Flowwork-source" build should implement this contract as the
first `live` source — not a bespoke path inside workspace-chat — and
Flowwork's kb/wiki/docs sources switch from recent-25 to `chunks` sources.

## 2. Data model

```sql
create table if not exists public.knowledge_chunks (
  id            uuid primary key default gen_random_uuid(),
  source_table  text not null,            -- 'pages' | 'kb_articles' | 'wiki_pages' | 'docs_pages' | 'documents'
  entity_id     uuid not null,            -- row in the source table
  chunk_index   int  not null,
  title         text not null,            -- entity title + heading trail, for citations
  content       text not null,            -- the chunk text (target ~600 tokens)
  tsv           tsvector generated always as (to_tsvector('simple', content)) stored,
  embedding     extensions.vector,        -- null until embedded; dim per instance config
  embedding_model text,                   -- 'openai:text-embedding-3-small' etc.
  visibility    text not null default 'internal',  -- 'public' | 'customer' | 'internal' (company:<id>/role:<r> in Phase 3/4)
  content_hash  text not null,            -- skip re-embed when unchanged
  updated_at    timestamptz not null default now(),
  unique (source_table, entity_id, chunk_index)
);
create index on public.knowledge_chunks using gin (tsv);
-- ivfflat/hnsw index added when embeddings populate (dim must be known)
```

**Visibility is derived at index time** from the source row's own publication
state: published page/KB with `include_in_chat` → `public`; wiki/docs/internal
documents → `internal`. Phase 1 ships only these two classes; `customer` /
`company:<id>` / `role:<r>` arrive with ladder rungs 2–4 and MUST NOT be
invented ad hoc before the identity resolution exists.

## 3. Indexer

`_shared/retrieval/indexer.ts`, exposed as an internal handler in
`agent-execute` (`internal:reindex_knowledge`) plus a nightly sweep
automation:

- **On write:** DB triggers on source tables set a `stale` marker row
  (`knowledge_index_queue`) — the sweeper (cron, every few minutes) chunks,
  hashes, upserts, and embeds changed entities. No inline embedding in the
  write path (Law 4: a down embedding provider must never block a save).
- **Chunking:** split on headings, target ~600 tokens with ~80 overlap;
  reuse `extractTextFromTiptap` / `extractTextFromBlock` from
  `_shared/chat-context.ts` for pages. Chunk titles carry the heading trail
  ("Refund policy › Partial refunds") for citations.
- **Embedding:** `embedText` via the existing `resolveEmbeddingProvider`
  chain (`_shared/ai-providers.ts`) — the consultant-match pattern verbatim:
  `embedding_status`-style tracking, **graceful text-only fallback** when no
  provider is configured. Store `embedding_model`; a model switch marks all
  chunks stale.
- **Full reindex** = truncate + rebuild, runnable as a skill
  (`reindex_knowledge`) so operators/agents can heal drift.

## 4. Query path

RPC modeled on the existing `match_consultants` hybrid RRF (baseline.sql),
with one critical difference — **SECURITY INVOKER, not DEFINER**:

```sql
create or replace function public.search_knowledge_chunks(
  query_text text,
  query_embedding extensions.vector default null,
  match_count int default 8,
  rrf_k int default 60
) returns table (chunk_id uuid, source_table text, entity_id uuid,
                 title text, content text, hybrid_score float)
language sql stable security invoker ...
```

- tsvector rank and cosine rank fused with reciprocal-rank fusion (RRF),
  same shape as `match_consultants` / `search_memories_hybrid`.
- `query_embedding` null → text-only ranking (fallback lane, Law 4). The
  edge function computes the embedding (it holds the provider key), the
  ranking runs in SQL.
- The TS wrapper `retrieve()` in `_shared/retrieval/index.ts` packages this
  plus token budgeting and citation records (`[N]` markers — reuse the
  Flowwork citations drawer format).

### The confidentiality rule (enforced, not promised)

> **Retrieval always runs with the caller's eyes.**

- `knowledge_chunks` gets RLS: `anon` → `visibility = 'public'` only;
  `authenticated` with an internal role → `public` + `internal`.
- Consumers call `search_knowledge_chunks` through PostgREST **with the
  caller's own key/JWT** — the anon/publishable key for visitor chat (the
  public-block auth pattern in CLAUDE.md), the user JWT for
  Flowwork/workspace-chat. **Never the service-role key.** SECURITY INVOKER +
  RLS makes a leak structurally impossible rather than prompt-discouraged —
  the read-side twin of agent-safe-by-construction.

## 5. Consumers and migration order

1. `chat-completion` — replace `buildKnowledgeBase()` bulk-dump with top-K
   `retrieve()`; keep `loadVisitorContext` (that's identity, not knowledge).
2. `docs-chat` — replace the keyword scorer (docs_pages become a chunk source).
3. `workspace-chat` (Flowwork) — knowledge sources (kb/pages/wiki/docs) move
   to `chunks`; entity sources (crm/employees) stay live; Flowtable lands as
   the first `live` plugin. Citations UI unchanged.
4. MCP gateway — `search_knowledge` skill (platform-seeds, NOT flowpilot
   module) exposing the same `retrieve()` to external operators.
5. FlowPilot `reason.ts` — optional grounding step, after the above prove out.

## 6. Guardrails (ship WITH milestone 1, not after)

- **Rung-boundary leak tests:** anon query must never return an `internal`
  chunk — enforced live against a seeded fixture (an `internal` wiki chunk +
  a `public` KB chunk; assert the anon path sees exactly one). Every future
  leak incident adds a tripwire here (dual-axis.guardrails pattern).
- **Quality smoke:** seeded known question → expected chunk in top-3, wired
  into `local:smoke`.
- **Drift check:** chunk count per source vs source-row count (catches a dead
  sweeper), surfaced in `system-integrity-check`.

## 7. Milestones

- **M1 — index + text search:** table, indexer, `search_knowledge_chunks`
  (text-only), RLS + leak tests. `docs-chat` switches (lowest risk).
- **M2 — embeddings:** provider wiring, hybrid RRF, model-switch staleness.
- **M3 — the big two:** `chat-completion` and `workspace-chat` switch;
  Flowtable live-source lands behind the source contract (Flowwork build #1).
- **M4 — gateway:** `search_knowledge` skill + OpenClaw validation pass over
  the MCP surface.

## 8. Non-goals

- No per-instance vector DB — pgvector in the site's own Postgres (works
  self-hosted; verified the extension ships in the self-hosted image).
- No cross-instance/federated retrieval (a federation question, later).
- No UI program — surfaces keep their chrome; this is engine work.
- Rungs 2–4 visibility classes (`customer`, `company:<id>`, `role:<r>`) are
  Phase 2–4 of the parent doc, not this spec.
