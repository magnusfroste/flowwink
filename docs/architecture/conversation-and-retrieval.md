---
title: "Conversation & Retrieval: one engine, two dials"
status: "proposed architecture (approved direction 2026-07-10)"
last_updated: "2026-07-10"
---

# Conversation & Retrieval: one engine, two dials

FlowWink serves four human audiences — anonymous visitors, B2C customers,
B2B customers, and internal employees (sales, purchasing, support, finance,
product, …) — plus a fifth, growing one: **external agents acting on behalf of
those audiences**. All of them meet the platform through the same modality:
conversation grounded in enterprise data (chat + RAG).

The temptation is to build four chat products. This document says: don't.

> **There is ONE conversation engine. Identity turns two dials:**
> 1. **Context injection (retrieval)** — *what knowledge grounds the answer*
> 2. **Skill surface + trust** — *what the conversation is allowed to do*
>
> Every audience is a point on an identity ladder, not a separate product.

This is the read-side twin of [MCP as Platform](./mcp-as-platform.md) and of
the agent-safe-by-construction principle: correctness (and now
*confidentiality*) lives in the platform, not in the surface.

---

## 1. Current state (verified 2026-07-10)

Three AI chat engines exist, each with its own edge function, identity model
and grounding strategy — none with real retrieval:

| Surface | Edge function | Identity | Grounding today |
|---|---|---|---|
| Public chat widget / AiAssistantBlock | `chat-completion` | Anonymous (`sessionId` in localStorage, optional self-declared email). **Never consumes the user JWT** — a logged-in customer gets the anonymous experience. | `buildKnowledgeBase()` in `_shared/chat-context.ts` **bulk-dumps** published pages + `kb_articles` into the system prompt up to a ~50k-token budget. No ranking, no query relevance. |
| Docs chat | `docs-chat` | Anonymous | Hand-rolled keyword scoring over `docs_pages` ("CAG"). |
| Flowwork (workspace) | `workspace-chat` | JWT + role gate (`admin`/`employee`/`manager`). Role-agnostic beyond the gate — every allowed role sees the same sources. | `buildContext()` pulls the **25 most-recent rows** per selected source (documents, contracts, kb, pages, crm, employees, wiki, flowtable — the flowtable source is question-driven keyword search over workspace-shared bases, not most-recent rows) into a 15k-token fair-share budget, with `[N]` inline citations. |
| FlowPilot Operate / FlowChat | `agent-operate` | JWT, admin | Full pilot core (`_shared/agent-reason.ts`, soul, objectives, memories) + `search_skills` → `execute_skill`. The *acting* agent, not a retrieval surface. |
| Live support (human) | `route_conversation` skill → `route_conversation_to_agent` RPC | — | Human handoff; `chat-completion` already skips AI when a human agent is engaged. |

Supporting facts that shape the design:

- **pgvector is enabled** (`baseline.sql`) but used by exactly one feature:
  `resume-match` (embeddings on `consultant_profiles`, cosine query, graceful
  text-only fallback). The embedding provider chain already exists in
  `_shared/ai-providers.ts` (`resolveEmbeddingProvider` / `embedText`).
- **A global full-text search RPC already exists** in the baseline
  (`to_tsvector`/`ts_rank` across ~16 entity tables) — it powers admin search,
  not chat.
- **`customer-360` exists but is admin/service-role only** — it aggregates
  orders, bookings, subscriptions, activities, conversations into a timeline +
  KPIs. Exactly the context an authenticated customer chat needs; not wired.
- **The customer portal (`/account`) has no chat at all** — B2C customers and
  ESS employees share the portal, but "support" is a static string in
  `ProfilePage.tsx`.
- **B2B is invisible as a category** — portal users carry role `customer` with
  no company association; org data (pricelists, contracts, credit) lives in
  CRM/companies, unreachable from the customer's own session.

So: all the infrastructure for hybrid RAG exists (pgvector, embedding
providers, tsvector RPC, a citation UI), and all the identity raw material
exists (JWT, roles, customer-360, companies). Nothing connects them.

---

## 2. The identity ladder

One conversation engine; each rung adds **more context and more agency**,
never a different product:

| Rung | Who | Context injected (dial 1) | Skill surface + trust (dial 2) |
|---|---|---|---|
| 0 | Anonymous visitor | Public KB + pages (retrieved, not dumped) | External skills: ask, book, capture lead |
| 1 | Known visitor (email) | + `visitor_profile`, prior conversations | + lead skills |
| 2 | B2C customer (JWT) | + customer-360 summary: my orders, tickets, subscriptions, invoices | + "my" skills: initiate return, download invoice, update subscription |
| 3 | B2B contact (JWT + company link) | + company context: pricelist, contracts/SLA, open invoices, order history at org level | + org skills: reorder, approval flows, multi-user visibility |
| 4 | Employee (functional role) | + role-scoped internal sources (sales → crm/quotes; finance → accounting/reconciliation; support → tickets/kb; …) | + internal skills per the existing per-skill trust dials (approve⇔staged, notify⇔direct) |

Two consequences worth making explicit:

**Rungs are cumulative and data-driven.** A rung is resolved at request time
from verifiable identity (JWT → user → roles → customer record → company
link), never from client-supplied claims. `customerEmail` in the payload can
place you on rung 1, never rung 2+.

**External agents ride the same ladder.** A B2B customer in two years is not
a human in a portal — it is the customer's own agent connecting to the MCP
gateway with a scoped API key. The key-scope model
([MCP-TOKEN-RLS-ARCHITECTURE](./MCP-TOKEN-RLS-ARCHITECTURE.md)) and the human
identity ladder are the **same abstraction**: an identity that resolves to a
rung, which sets both dials. `?groups=`, `toolset_groups`, and dispatch mode
already implement dial 2 for agents; this document extends the same idea to
dial 1 (what a key's bearer can *retrieve*).

---

## 3. The Retrieval Engine — a platform primitive

Retrieval gets the same treatment the Skill Relevance Engine got: it is a
**platform primitive in `supabase/functions/_shared/retrieval/`** — NOT under
`pilot/`, NOT named for FlowPilot or MCP (name it for what it does: retrieves
knowledge relevant to a query, for a given identity).

### Shape

```
retrieve({
  query,            // the user's message / distilled intent
  identity,         // resolved rung: { kind, userId?, customerId?, companyId?, roles[] }
  sources?,         // optional narrowing (kb, pages, wiki, docs, crm, …)
  k, tokenBudget,   // result sizing
}) → [{ chunk, source, entityRef, score, citation }]
```

- **Hybrid ranking**: existing tsvector RPC (keyword/recency) + pgvector
  cosine over chunk embeddings, merged. Embeddings via the existing
  `ai-providers.ts` chain with **graceful text-only fallback** (the
  resume-match pattern) — retrieval must degrade, never gate (Law 4).
- **Chunk store**: a `knowledge_chunks` table (source table, entity id, chunk
  text, tsvector, embedding, visibility class), populated by an indexer that
  walks pages/KB/wiki/docs/handbook content — incremental on write (trigger or
  event-bus), full reindex as a maintenance skill.
- **Citations are first-class**: every result carries what the Flowwork
  `[N]`-citation drawer needs. The citation UI already built for Cowork is an
  asset; retrieval feeds it everywhere.

### Consumers (one primitive, many surfaces — the intent-scorer pattern)

1. `chat-completion` — replaces the `buildKnowledgeBase()` bulk-dump with
   top-K retrieval. This removes the scale ceiling: today quality dies when
   the KB outgrows the token budget.
2. `workspace-chat` — replaces "25 most-recent rows" with query-relevant
   retrieval; keeps modes (`strict`/`cowork`) and citations.
3. `docs-chat` — replaces the hand-rolled keyword scorer.
4. **MCP gateway** — a `search_knowledge` skill so external operators get the
   same grounding (the surface is the product).
5. FlowPilot (`reason.ts`) — optional context step for objective-driven work.

### The confidentiality rule (agent-safe-by-construction, read side)

> **Retrieval always runs with the caller's eyes, never service-role.**

Context injection is a side-effect in the security sense: a chunk pulled into
a prompt *is* disclosure. The write side learned this lesson (idempotency
guards, staged ops); the read side needs its twin:

- Every chunk carries a **visibility class** (`public`, `customer`,
  `company:<id>`, `role:<role>`, `internal`) derived from its source row's
  RLS reality at index time.
- The retrieval query filters by the resolved identity's rung — enforced in
  SQL (RLS on `knowledge_chunks` keyed on visibility class), not in
  application code that could be bypassed by a new consumer.
- **Guardrail tests per rung boundary**: an anonymous query must never return
  a `customer` chunk; a rung-3 query for company A must never return
  `company:B` chunks. Every future leak incident becomes a permanent tripwire
  (the dual-axis.guardrails pattern).

This is what makes it safe to hand the same engine to a customer's own agent
on a scoped key: the platform, not the prompt, enforces the boundary.

---

## 4. Two verbs, one grounding layer

Internally there are two conversation verbs, and they stay two surfaces:

- **Ask** (Cowork Chat / `workspace-chat`) — read-only, cited, refuses to
  mutate. Low risk, wide availability.
- **Act** (FlowPilot Operate / `agent-operate`) — skills, staged operations,
  per-skill trust dials. Higher risk, dialed availability.

They must **share the Retrieval Engine** (same grounding, same citations,
same visibility classes) but keep separate risk profiles. This is
dials-not-gates in practice: an employee's rung sets which sources *Ask* can
retrieve and which skills *Act* may reach — it never forks the engine.

On the public side the two verbs are already fused in `chat-completion`
(answer + external skills + human handoff); that stays. The ladder just makes
its dials identity-aware.

---

## 5. Laws applied

- **Law 1 (no hardcoded intent detection)** — role scoping of sources and
  skills is **configuration/metadata** (a role→sources/skills profile, editable
  in admin), never `if (role === 'cfo') attachAccounting()`. Same for rung
  resolution: data-driven from identity records.
- **Law 2 (self-describing)** — `search_knowledge` and every "my"/org skill
  carries `Use when:` / `NOT for:` so both FlowPilot and external agents pick
  them by scoring, not routing.
- **Law 3 (blocks are interfaces)** — the portal chat, ChatWidget,
  AiAssistantBlock, and docs chat are *lenses* on the one engine. No surface
  grows its own pipeline.
- **Law 4 (fail forward)** — no embedding provider configured ⇒ retrieval
  falls back to tsvector-only, never to "feature disabled".
- **MCP as Platform** — the Retrieval Engine lives in `_shared/retrieval/`,
  module-toggle-independent; disabling FlowPilot must not reduce what an
  external agent can retrieve (within its rung).

---

## 6. Build order

Ordered by leverage; each phase ships value alone.

**Phase 1 — Retrieval Engine** (`_shared/retrieval/` + `knowledge_chunks` +
indexer). Wire into `chat-completion`, `workspace-chat`, `docs-chat`; expose
`search_knowledge` on the gateway. Biggest single lift: upgrades all three
chats at once and removes the KB scale ceiling. Guardrails: rung-boundary
leak tests + retrieval-quality smoke (known question → known chunk).

**Phase 2 — Identity-aware public/customer chat.** `chat-completion` accepts
the user JWT when present (keep the anon path — see the public-block auth
pattern in CLAUDE.md), resolves the customer, injects a customer-360 summary
(refactor `customer-360` aggregation into a shared helper callable at rung 2).
Give `/account` a chat surface — same `UnifiedChat`, authenticated scope.
Unlocks "where is my order / start a return" self-service.

**Phase 3 — B2B rung.** Contact→company link on portal users; company
context (pricelist, contracts, open invoices, org-level order history) into
both portal UI and chat; org skills with approval flows. Also mint the
external-agent variant: a customer-scoped API key whose rung-3 identity the
gateway and Retrieval Engine both honor.

**Phase 4 — Role-scoped Cowork.** Role→sources/skills profiles (metadata,
admin-editable): sales defaults to crm+quotes, finance to
accounting+reconciliation, support to tickets+kb. Same ladder, top rung.

---

## 7. Non-goals / open questions

- **Not a new chat UI program** — surfaces reuse `UnifiedChat`/existing
  widgets; this is engine + identity work. (Nav/IA chrome is separately
  deferrable per the 2026-07-06 IA decision.)
- **Not omnichannel** — channel adapters (Telegram/voice) stay the
  contact-center track ([channel-adapter-contract](./channel-adapter-contract.md));
  they normalize into the same conversation engine and inherit the ladder.
- **Open: chunking + reindex cadence** for large sources (documents module
  with extracted `content_md`) — decide in the Phase-1 spec.
- **Open: rung-2/3 retrieval over transactional rows** (orders, invoices) —
  likely *live queries via skills*, not indexed chunks; the chunk store is for
  knowledge-shaped content. Draw this line explicitly in Phase 2.
- **Open: embedding cost/locality** — provider chain supports local
  `/embeddings`; per-instance choice, config not code.
