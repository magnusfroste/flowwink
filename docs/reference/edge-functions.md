---
title: "Edge functions — the full surface"
description: Every Deno edge function under supabase/functions, with its deploy tier (core vs module-bound), JWT setting and one-line purpose. Generated from code — do not edit by hand.
category: reference
generated: true
---

# Edge functions — the full surface

> **Generated** by `scripts/generate-edge-function-docs.ts`. 77 functions: 37 core (always deployed), 40 module-bound (deployed when an owning module is enabled). The deploy map is `supabase/seed/edge-function-map.json`; the operator's mental model is [`../operators/edge-function-tiers.md`](../operators/edge-function-tiers.md).

**Audience column:** `public` = `verify_jwt = false` in `config.toml` — the function verifies its caller itself (see the guard `public-functions-verify-their-caller`); `JWT` = the gateway requires a signed-in caller.

| Function | Tier | Audience | Purpose |
|---|---|---|---|
| `a2a` | module: federation | public | a2a — Unified router for all A2A federation traffic. |
| `agent-card` | module: federation | default (JWT) | A2A agent card — the instance's identity and external-facing skills for federation peers. |
| `agent-execute` | core | public | B1b admin-tool handlers — kept VERBATIM as Request→Response functions and |
| `agent-operate` | core | public | FlowPilot Operate — Interactive streaming agent |
| `ai-task` | core | public | ai-task — Consolidated AI Task Hub |
| `automation-dispatcher` | core | public | Automation Dispatcher |
| `blog-rss` | module: blog | public | RSS feed of the 20 most recent published blog posts. |
| `browser-fetch` | module: browserControl | public | Browser Fetch — Hybrid Operator Skill |
| `chat-completion` | core | public | Chat Completion — Visitor-facing AI chat |
| `chat-stt` | core | default (JWT) | chat-stt — server-side Speech-to-Text router for the chat widget. |
| `check-secrets` | core | default (JWT) | Reports which provider secrets (AI, email, payments…) are configured, for the admin setup screens. |
| `comms-send` | core | default (JWT) | comms-send — the transactional-comms cluster (edge-surface refactor B2). |
| `composio-proxy` | module: composio | public | Gmail thread the message belongs to — what the inbox thread view groups on. */ |
| `composio-webhook` | module: composio | public | composio-webhook — public endpoint Composio calls when a watched Gmail mailbox |
| `consultant-match` | module: consultants | public | Resume Match — Hybrid semantic (pgvector) + BM25 (tsvector) matching. |
| `content-api` | core | public | Programmatic content access — pages, posts and KB as JSON or Markdown for headless consumers. |
| `contract-billing-cron` | module: contracts | default (JWT) | Contract billing cron — daily |
| `contract-sign` | module: contracts | public | Public contract signing endpoint. |
| `create-checkout` | module: ecommerce | public | Creates the shop checkout (Stripe, or a recorded order in sandbox mode). |
| `create-invoice-payment` | module: invoicing | public | Create a Stripe Checkout session for an invoice. Public — uses public_token. |
| `create-user` | core | default (JWT) | Create user with admin API (email_confirm: true skips verification). |
| `customer-signup` | core | public | Public customer-signup endpoint. |
| `delete-user` | core | default (JWT) | delete-user — admin removes a user account, completely and safely. |
| `demo-cycle` | core | public | demo-cycle — the nightly rebuild for a demo/sandbox instance. |
| `docs-chat` | module: docs | public | Public AI chat over the docs (Retrieval Engine consumer — see |
| `document-share` | core | default (JWT) | document-share — anon-callable: resolve share token and stream (or redirect to) the file. |
| `document-sign-request` | core | default (JWT) | document-sign-request — send a signing request email with a tokenized link. |
| `dunning-processor` | module: subscriptions | default (JWT) | Dunning processor — runs on cron, advances active dunning sequences |
| `elks46-ingest` | module: liveSupport | public | NOTE: 46elks has NO Lovable connector yet — we call api.46elks.com directly |
| `email-send` | core | default (JWT) | email-send — provider-agnostic email router for FlowWink |
| `email-webhook` | core | public | email-webhook — receive delivery/bounce/complaint events from ESPs (Resend/Mailgun-shaped) |
| `event-dispatcher` | core | public | Event Dispatcher (Phase 3 — Platform Event Bus) |
| `extract-pdf-text` | core | public | Input: { document_id } / { file_url } / { storage_path } — any of the shapes a |
| `federation-invite-peer` | module: federation | public | Federation: peer-to-peer invitation |
| `flowpilot-heartbeat` | module: flowpilot | public | FlowPilot Heartbeat — Autonomous Loop |
| `flowpilot-lifecycle` | core | default (JWT) | flowpilot-lifecycle — the autonomous operator's lifecycle cluster |
| `gatewayapi-ingest` | module: liveSupport | public | GatewayAPI SMS channel adapter — inbound webhook + outbound send + test. |
| `generate-invoice-pdf` | module: invoicing | default (JWT) | Renders an invoice as PDF — by public token for the customer, or as staff. |
| `get-page` | core | public | Serves a published page by slug with caching; PublicPage falls back to the database if it fails. |
| `gmail-oauth-callback` | module: email | public | Gmail OAuth Callback Edge Function |
| `instance-health` | core | public | RPC and enriches it via the SHARED cron-health brain — which judges |
| `integrations-account` | core | default (JWT) | Integrations account info — one function for every provider's usage/quota |
| `invite-colleague` | core | default (JWT) | invite-colleague — email a colleague an invite that lands them, on first |
| `invite-employee` | module: recruitment | default (JWT) | Invites an employee to a portal account over the instance's own email rail. |
| `knowledge-indexer` | core | public | Cron-invoked every 5 min (job 'knowledge-indexer', self-registered on first |
| `llms-txt` | core | public | Serves /llms.txt — the site as plain text for LLM crawlers. |
| `mcp-server` | core | public | Platform skill-relevance primitive — shared by FlowPilot (reason.ts) AND this |
| `media-optimize` | module: mediaLibrary | default (JWT) | media-optimize — server-side image resize. |
| `migrate-page` | module: siteMigration | public | Site migration — fetches an external page or site and maps it to FlowWink blocks. |
| `newsletter` | module: newsletter | public | newsletter — consolidated newsletter edge function. |
| `openclaw-responses` | module: federation | public | openclaw-responses — Call OpenClaw's POST /v1/responses endpoint. |
| `process-image` | core | public | Server-side image processing for the media library (fetch, convert, store). |
| `process-job-application` | module: recruitment | public | process-job-application — turns a website form submission with a CV upload into |
| `quote-expiry-reminders` | module: quotes | public | Expiry Reminders", migration 20260703130500_quote-expiry-reminders.sql). |
| `quote-pay` | module: quotes | public | Public quote payment endpoint (sign-and-pay, Odoo portal parity). |
| `quote-sign` | module: quotes | public | Public quote signing endpoint. |
| `run-autonomy-tests` | module: flowpilot | default (JWT) | Runs the autonomy test suites against this instance and reports per test. |
| `run-platform-tests` | core | default (JWT) | Platform Test Runner — FlowWink SaaS-level health checks. |
| `score-visitor-intent` | module: visitorIntelligence | public | score-visitor-intent |
| `send-webhook` | core | public | Send webhook with retry logic |
| `setup-database` | core | default (JWT) | Fresh-install bootstrap — applies the core schema and seeds so a new project can start. |
| `signal-dispatcher` | core | public | Signal Dispatcher |
| `signal-ingest` | module: salesIntelligence | public | Signal Ingest — External operator endpoint |
| `sitemap` | core | public | sitemap — Generates a dynamic sitemap.xml from published pages and blog posts. |
| `stripe-webhook` | core | public | Receives Stripe events — checkout completed, refunds, subscription changes — and updates orders and subscriptions. |
| `subscription-billing-cron` | module: subscriptions | default (JWT) | Daily cron — generates invoices for all manual (invoice-driven) subscriptions |
| `subscriptions` | module: subscriptions | public | Subscriptions — Unified Router |
| `system-integrity-check` | core | default (JWT) | Checks and (on request) repairs platform integrity — schema, seeds, buckets, cron. |
| `telegram-ingest` | module: liveSupport | public | Telegram channel adapter — consolidated inbound + outbound. |
| `track-auth-event` | core | public | Records sign-in and other auth events for the login-activity view. |
| `track-page-view` | core | public | Records a page view (with coarse geo) for analytics. |
| `twilio-ingest` | module: liveSupport | public | Twilio SMS channel adapter — inbound webhook + outbound send + test. |
| `voice-ingest` | module: voice | public | voice-ingest — provider-agnostisk callback-handler + AI-receptionist-brygga. |
| `voice-recording` | module: liveSupport, voice | default (JWT) | Proxies 46elks (and future provider) voicemail recordings so the browser |
| `web-scrape` | module: flowpilot | public | Web Scrape — Modular integration skill |
| `web-search` | module: flowpilot | public | Web Search — Modular integration skill |
| `workspace-chat` | module: workspaceChat | JWT | Cowork Chat (internal id: workspace-chat) |

## Runtime notes

- All functions are Deno on Supabase Edge; the transport for MCP is Streamable HTTP.
- Public-facing functions are deployed with `--no-verify-jwt`; the rest use default JWT verification.
- Shared code lives in `supabase/functions/_shared/` (the FlowPilot engine under `pilot/`, the Skill Relevance Engine under `skills/`, MCP schema under `mcp/`).
