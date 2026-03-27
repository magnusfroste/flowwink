# FlowWink

> **The autonomous agentic web that runs your business.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Docker Image](https://img.shields.io/badge/Docker-ghcr.io-blue)](https://github.com/magnusfroste/flowwink/pkgs/container/flowwink)
[![Release](https://img.shields.io/badge/release-v2.1-brightgreen)](https://github.com/magnusfroste/flowwink/releases)

---

## A new era for the web

The web is changing. For 30 years a website has been a passive artifact — something you build, maintain, and operate manually. That era is ending.

**FlowWink is the first platform built for what comes next:** a web where your entire digital presence — content, leads, campaigns, orders, relationships — runs autonomously. Not scheduled. Not templated. **Autonomously.** An AI agent called **FlowPilot** understands your business objectives and executes on them continuously, around the clock, without hand-holding.

You set the direction. FlowPilot runs the business.

---

## What FlowPilot does

FlowPilot is not a chatbot, a copilot, or a content suggester. It is an **autonomous agent** — a persistent process that wakes up on a configurable schedule (default: every 6 hours), reads your business situation, and acts.

```
┌─────────────────────────────────────────────────────────────────┐
│                     THE AUTONOMOUS LOOP                         │
│                                                                 │
│  Evaluate → Plan → Advance → Propose → Automate → Reflect      │
│      ↑                                                 │        │
│      └─────────── Remember ← ──────────────────────────┘        │
└─────────────────────────────────────────────────────────────────┘
```

| What FlowPilot does | How |
|---------------------|-----|
| Writes and publishes blog posts | Researches topics, drafts, SEO-optimizes, schedules |
| Qualifies and enriches leads | Scores, enriches from domain, routes to deals |
| Sends newsletter campaigns | Segments subscribers, drafts, schedules sends |
| Manages product promotions | Creates landing pages, promotional posts |
| Triages support tickets | Auto-categorizes, routes, resolves from Knowledge Base |
| Reviews deal pipeline | Surfaces stale deals, drafts re-engagement |
| Proposes new objectives | Reads site stats, spots gaps, creates its own goals |
| Federates with peer agents | Delegates tasks to external A2A agents via JSON-RPC |
| Evolves its own capabilities | Creates new skills, updates its instructions, reflects |

---

## Modules — 22 integrated domains

FlowWink follows an **Odoo-inspired modular architecture** where each module owns its data, views, and FlowPilot integration. Modules are registered as plugins with typed contracts.

| Category | Modules |
|----------|---------|
| **Content** | Pages, Blog, Knowledge Base, Global Blocks, Media |
| **CRM** | Leads, Companies, Deals, Forms, Sales Intelligence |
| **Commerce** | Products, Orders, Bookings |
| **Communication** | Newsletter, Webinars |
| **Support** | Tickets (Kanban + auto-triage via FlowPilot) |
| **Growth** | Growth Dashboard, Company Insights, Resume/CV |
| **System** | FlowPilot, Federation (A2A), Browser Control |

Each module provides:
- **Data layer** — Supabase table + RLS policies
- **Admin views** — React components in `/admin/`
- **FlowPilot skills** — Agent capabilities auto-registered
- **Webhook events** — `module.action` signals for automation

---

## FlowPilot — Full Autonomy Engine

### Heartbeat Protocol (7 steps)

```
1. EVALUATE  — Score past actions against real outcomes (traffic, leads, revenue)
2. PLAN      — Decompose active objectives into executable steps
3. ADVANCE   — Execute the next pending step for each objective
4. PROPOSE   — If no active objectives, analyze stats and create new goals
5. AUTOMATE  — Detect recurring patterns, suggest or create automations
6. REFLECT   — Review recent actions, distill learnings
7. REMEMBER  — Save insights to semantic memory for future cycles
```

### Skills — 40+ across your business

| Domain | Skills |
|--------|--------|
| **CMS** | Pages (create/publish/rollback), block manipulation, Global Elements |
| **Content** | Blog posts, KB articles, content research, SEO briefs, social batches |
| **CRM** | Leads, Companies, Deals, Form processing, Lead qualification, Company enrichment |
| **Commerce** | Products, Orders, Bookings |
| **Communication** | Newsletter campaigns, Webinars |
| **Support** | Ticket triage, KB-powered auto-resolve |
| **Intelligence** | Analytics, SEO audits, web research, browser automation, prospect research |
| **Growth** | Ad campaigns, competitor monitoring, prospect fit analysis |
| **Learning** | Memory read/write (vector search), reflection, soul evolution |

### Workflow DAGs — Multi-step automation chains

```
Research topic → Write blog post → Create social posts → Schedule newsletter
     s1               s2                  s3                    s4
                  {{s1.topic}}     {{s2.post_id}}         {{s3.content}}
```

- **Template variables** — `{{stepId.result.field}}` passes data between steps
- **Conditional branching** — run a step only if a previous result meets a condition
- **Failure modes** — `on_failure: continue` or `stop` per step

### Outcome Evaluation Loop

FlowPilot uses **causal correlation** to connect actions to business outcomes:
- Traffic metrics, leads, bookings, and revenue signals
- Hard gates for technical failures (timeout, 429, auth errors)
- Skill Scorecard — flags underperforming skills (>60% negative rate)
- Learnings saved to semantic memory for the next planning cycle

### Multi-Agent Delegation

FlowPilot delegates subtasks to specialist sub-agents with persistent sessions:

```
FlowPilot → delegate_task("seo", "analyze /pricing page")
         → delegate_task("content", "write a case study about...")
         → delegate_task("sales", "review stale deals > $10k")
```

Built-in specialists: **seo**, **content**, **sales**, **analytics**, **email** — each maintains conversation history across invocations.

### Skill Packs

```
skill_pack_install("E-Commerce Pack")        → product_promoter, cart_recovery_check, inventory_report
skill_pack_install("Content Marketing Pack") → content_calendar_view, seo_content_brief, social_post_batch
skill_pack_install("CRM Nurture Pack")       → lead_pipeline_review, deal_stale_check, customer_health_digest
```

---

## A2A Federation — Agent-to-Agent Protocol

FlowWink implements the **A2A JSON-RPC 2.0** protocol for peer-to-peer agent communication:

```
┌─────────────┐    JSON-RPC 2.0    ┌─────────────┐
│  FlowPilot  │◄──────────────────▶│  Peer Agent  │
│ (gatekeeper)│   message/send     │  (e.g. OpenClaw)
│             │   tasks/send       │              │
└─────────────┘                    └─────────────┘
```

- **FlowPilot as gatekeeper** — all peer interactions routed through the autonomous agent
- **Peer management** — add, test, discover, and audit external agents
- **Graceful degradation** — 503 `peer_unavailable` handling when peers are offline
- **Audit loop** — architectural findings from peers auto-convert to agent objectives
- **Agent Card** — `/.well-known/agent.json` discovery endpoint

---

## Architecture

FlowWink follows the **OpenClaw** agentic architecture — composable layers with clear separation of concerns:

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Gateway        │     │   Brain           │     │   Memory         │
│                  │     │                   │     │                  │
│ • Visitor chat  │────▶│ • Pilot engine    │────▶│ • pgvector       │
│ • Admin operate │     │   (ReAct loop)    │     │   semantic search│
│ • Webhooks      │     │ • resolveAiConfig │     │ • Soul + Identity│
│ • Heartbeat     │     │ • tool execution  │     │ • Conversation   │
│ • A2A ingest    │     │ • trace IDs       │     │ • Objectives     │
└─────────────────┘     └──────┬───────────┘     └─────────────────┘
                               │
              ┌────────────────┼────────────────────┐
              │                │                    │
       ┌──────▼─────┐  ┌───────▼───────┐  ┌────────▼──────┐
       │   Skills    │  │   Heartbeat   │  │   Workflows   │
       │             │  │               │  │               │
       │ 40+ skills  │  │ 7-step loop   │  │ DAG chains    │
       │ Skill Packs │  │ Self-healing  │  │ Conditions    │
       │ A2A peers   │  │ Outcome eval  │  │ Template vars │
       └─────────────┘  └───────────────┘  └───────────────┘
```

### One reasoning core, all surfaces

The Pilot engine (`_shared/pilot/`) is the single engine shared by every surface:
- **`agent-operate`** — interactive admin sessions (streaming)
- **`flowpilot-heartbeat`** — autonomous scheduled loop
- **`chat-completion`** — visitor-facing AI chat
- **`a2a-ingest`** — incoming federation requests

No logic duplication. All surfaces get every capability automatically.

### Modularized core

```
_shared/
├── pilot/
│   ├── reason.ts          — Main ReAct reasoning loop
│   ├── prompt-compiler.ts — System prompt assembly
│   ├── handlers.ts        — Built-in tool implementations
│   └── built-in-tools.ts  — Tool definitions
├── types.ts               — Shared type definitions
├── ai-config.ts           — Provider routing (OpenAI → Gemini → Local)
├── concurrency.ts         — Lane-based locking
├── token-tracking.ts      — Budget management
├── trace.ts               — Correlation IDs (fp_{ts}_{rand})
└── domains/
    └── cms-context.ts     — CMS domain pack
```

### Provider-agnostic, self-hosted first

```
OpenAI GPT-4o → Gemini 2.5 Flash → Local LLM (Ollama / LM Studio / vLLM)
```

FlowPilot routes to whichever provider is configured. Use your own API keys. Run fully offline with a local model. No vendor lock-in.

---

## What FlowWink replaces

| What you used to need | FlowWink replaces it with |
|-----------------------|--------------------------|
| WordPress / Webflow | Visual block editor, 50+ block types |
| HubSpot / Pipedrive | CRM with AI qualification and deal pipeline |
| Mailchimp / Klaviyo | Newsletter with autonomous campaign creation |
| Calendly | Booking system with AI follow-up |
| Zendesk / Freshdesk | Tickets with Kanban board + AI triage from KB |
| Jasper / Copy.ai | FlowPilot writing directly into your CMS |
| Zapier / N8N | Workflow DAGs with conditional branching |
| Intercom | AI chat with KB integration and lead capture |
| Shopify (simple) | Products, orders, and Stripe checkout |

One platform. One agent. Self-host free.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS |
| UI Components | shadcn/ui, Radix UI |
| Backend | Supabase (PostgreSQL + pgvector, Auth, Storage, Edge Functions) |
| Agent Engine | Deno edge functions, OpenAI function-calling format |
| Editor | Tiptap |
| State | TanStack Query |
| AI Providers | OpenAI, Google Gemini, Local LLM (Ollama / LM Studio / vLLM) |
| Federation | A2A JSON-RPC 2.0 protocol |

---

## Self-Hosting

FlowWink is **free to self-host**. Your agent, your data, your infrastructure.

### Quick Start

```bash
git clone https://github.com/magnusfroste/flowwink.git
cd flowwink
npm install
cp .env.example .env
# Edit .env with your Supabase credentials
npm run dev   # migrations run automatically
```

### Connect your Supabase instance

1. Create a project at [supabase.com](https://supabase.com/)
2. Copy **Project URL**, **Anon key**, and **Project ref** into `.env`
3. Run `npm run cli` and use `/install` to deploy functions, run migrations and create admin
4. Start the server — migrations apply automatically on `npm run dev`

### Deploy to production

```bash
# Docker (recommended)
docker pull ghcr.io/magnusfroste/flowwink:latest

# Or deploy edge functions manually
supabase functions deploy agent-execute agent-operate flowpilot-heartbeat
supabase db push
```

Supported platforms: **Easypanel**, **Railway**, **Fly.io**, **Hetzner**, **DigitalOcean**, or any VPS with Docker.

See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** for full deployment guides.

---

## Documentation

| Document | What it covers |
|----------|---------------|
| **[docs/flowpilot.md](docs/flowpilot.md)** | Complete FlowPilot agent reference — skills, heartbeat, tools |
| **[docs/MODULES.md](docs/MODULES.md)** | Module documentation — all 22 modules |
| **[docs/MODULE-API.md](docs/MODULE-API.md)** | Module contract system, typed schemas, plugin architecture |
| **[docs/OPENCLAW-LAW.md](docs/OPENCLAW-LAW.md)** | Agentic architecture laws |
| **[docs/SETUP.md](docs/SETUP.md)** | Supabase setup, environment variables, migrations |
| **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** | Docker, Easypanel, Railway, Fly.io guides |
| **[docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md)** | Architecture, extending the platform, writing skills |
| **[docs/SECURITY.md](docs/SECURITY.md)** | RLS policies, auth patterns, security model |
| **[docs/TESTING.md](docs/TESTING.md)** | Autonomous test framework (L1–L8) |
| **[docs/VISION.md](docs/VISION.md)** | Product vision and philosophy |

---

## Roadmap

- **Hosted Skill Pack Registry** — Import community skill packs from a manifest URL
- **Workflow Visualization** — Admin UI to view and edit DAG steps visually
- **Multi-Tenant Mode** — Run FlowWink as a SaaS with per-tenant agent isolation
- **Agent Marketplace** — Shareable FlowPilot configurations (soul + skills + workflows)
- **Expanded A2A Ecosystem** — Peer discovery, trust scoring, capability negotiation

---

## Contributing

Contributions are welcome. Open an issue or submit a pull request. See **[docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)**.

## License

MIT — see [LICENSE](LICENSE) for details.

---

*Stop managing. Start directing. FlowPilot runs the business so you can build it.*

**Made in Sweden 🇸🇪**
