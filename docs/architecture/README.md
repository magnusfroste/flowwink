---
title: "architecture/ — index"
description: Platform design: the harness, event bus, retrieval, locale packs, tiers, the edge surface. A page marked `status: proposed` is a design under discussion, not shipped behaviour.
category: general
---

# `architecture/`

> Platform design: the harness, event bus, retrieval, locale packs, tiers, the edge surface. A page marked `status: proposed` is a design under discussion, not shipped behaviour. Audience: builders.

| Page | What it is |
|---|---|
| [`MCP-TOKEN-RLS-ARCHITECTURE.md`](./MCP-TOKEN-RLS-ARCHITECTURE.md) | MCP Token Authentication and RLS Architecture — Both my test execution and Hermes agent operations failed with the same error: |
| [`accounting-locale-packs.md`](./accounting-locale-packs.md) | Accounting Locale Packs — Without packs, the platform was hard-locked to BAS 2024 / SEK / 25% VAT / PAXml / SIE. |
| [`agent-harness.md`](./agent-harness.md) | The FlowWink Agent Harness — A harness is everything around the model that makes an agent reliable in production: the loop, skill selection, context assembly, memory, po… |
| [`agent-resumption.md`](./agent-resumption.md) | Resumption (H11) — design — Agent Harness (H11), and the last Hermes-benchmark gap in flowpilot-2.0.md. |
| [`channel-adapter-contract.md`](./channel-adapter-contract.md) | Channel Adapter Contract — Today our channels are implemented ad hoc: |
| [`channels-vs-modules.md`](./channels-vs-modules.md) | Channels vs Modules — Examples: |
| [`conversation-and-retrieval.md`](./conversation-and-retrieval.md) | Conversation & Retrieval: one engine, two dials *(status: proposed architecture (approved direction 2026-07-10))* — FlowWink serves four human audiences — anonymous visitors, B2C customers, B2B customers, and internal employees (sales, purchasing, support,… |
| [`customer-spine.md`](./customer-spine.md) | The customer spine — one party register — FlowWink had five parallel dialects for "who is the customer". The party register (Odoo's res.partner, deliberately copied) makes it one, an… |
| [`edge-surface-classification.md`](./edge-surface-classification.md) | Edge surface classification: a small stable kernel, modularity in data *(status: analysis (read-only — no changes prescribed until approved))* — This is the generalization of a pattern the codebase already proved: agent-execute is ONE deploy artifact carrying 600+ skills, toggled enti… |
| [`email-routing-and-mailboxes.md`](./email-routing-and-mailboxes.md) | Email routing: transports, mailboxes, and what a conversation binds to — Nothing here contradicts the channel boundary those documents drew. |
| [`event-bus.md`](./event-bus.md) | Platform Event Bus — The event bus is the platform's nervous system. |
| [`evidence-ledger.md`](./evidence-ledger.md) | The evidence ledger — observed facts, not asserted ones *(status: proposed)* — Enrichment writes claims with provenance and a band; strong evidence lands in the record, weak evidence becomes a suggestion a human settles… |
| [`flowbox-as-aggregator.md`](./flowbox-as-aggregator.md) | FlowBox as aggregator — FlowBox projects email threads, chat conversations, tickets, form submissions and voice calls into one queue — but the source of truth and t… |
| [`flowpilot-2.0.md`](./flowpilot-2.0.md) | FlowPilot 2.0 — Design & Build Plan — Tonight's campaign hardened 13 SMB processes and the money core (idempotency, abort guards, rounding seams, currency splitting) — all verifi… |
| [`flowwink-control-model.md`](./flowwink-control-model.md) | FlowWink Control Model — With and Without FlowPilot *(status: core architecture)* — These are genuinely FlowPilot-only — they make no sense for external agents: |
| [`flowwork-dispatch-surface.md`](./flowwork-dispatch-surface.md) | FlowWork — the human surface on the agent substrate |
| [`identity-ladder-rung3-b2b.md`](./identity-ladder-rung3-b2b.md) | Identity Ladder — Rung 3 (B2B) design sketch — The identity ladder is one engine; each rung turns two dials — context (what grounds the answer) and skills+trust (what it may do). |
| [`language.md`](./language.md) | Language — a light internationalization system |
| [`mcp-as-platform.md`](./mcp-as-platform.md) | MCP as Platform (not a FlowPilot feature) *(status: core architecture)* — FlowWink is a traditional SaaS first, an autonomous-agent platform second. |
| [`module-tiers.md`](./module-tiers.md) | Module Tiers — Promoting to core is an architectural decision, not a refactor. |
| [`ownership-and-coverage.md`](./ownership-and-coverage.md) | Ownership & coverage — Shipped 2026-08-07 in four steps (#166–#169). |
| [`recurring-value-model.md`](./recurring-value-model.md) | Recurring value across the sales chain — one dimensioned line, derived rollups *(status: COMPLETE — steps 1–5 shipped (product cadence · quote recurrence/term/rollup · deal basis display · quote→contract→subscription inheritance · dimension-consistent pipeline sums + agent instructions))* |
| [`retrieval-engine.md`](./retrieval-engine.md) | Retrieval Engine — Phase 1 spec *(status: approved spec, ready to build (2026-07-13))* — Implements Phase 1 of Conversation & Retrieval: a platform primitive in supabase/functions/shared/retrieval/ that grounds every conversation… |
| [`site-template-authoring.md`](./site-template-authoring.md) | Site templates an agent can author |
| [`what-gets-indexed.md`](./what-gets-indexed.md) | What gets indexed — and who pays |
| [`work-queue.md`](./work-queue.md) | The work queue — durable tasks instead of a cron job per feature *(status: proposed)* — One dispatcher that decides nothing, and work that lives as rows with a due time, a lease and an attempt count. |
