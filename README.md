# FlowWink

> **The autonomous agentic web that runs your business.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Docker Image](https://img.shields.io/badge/Docker-ghcr.io-blue)](https://github.com/magnusfroste/flowwink/pkgs/container/flowwink)
[![Release](https://img.shields.io/badge/release-v2.0-brightgreen)](https://github.com/magnusfroste/flowwink/releases/tag/v2.0.0)

---

## A new era for the web

The web is changing. For 30 years a website has been a passive artifact — something you build, maintain, and operate manually. That era is ending.

**FlowWink is the first platform built for what comes next:** a web where your entire digital presence — content, leads, campaigns, orders, relationships — runs autonomously. Not scheduled. Not templated. **Autonomously.** An AI agent called **FlowPilot** understands your business objectives and executes on them continuously, around the clock, without hand-holding.

You set the direction. FlowPilot runs the business.

---

## What FlowPilot does

FlowPilot is not a chatbot, a copilot, or a content suggester. It is an **autonomous agent** — a persistent process that wakes up every 12 hours, reads your business situation, and acts.

```
┌─────────────────────────────────────────────────────────────┐
│                    THE AUTONOMOUS LOOP                       │
│                                                             │
│  Self-Heal → Propose → Plan → Execute → Automate → Reflect │
│      ↑                                               │      │
│      └───────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

| What FlowPilot does | How |
|---------------------|-----|
| Writes and publishes blog posts | Researches topics, drafts, SEO-optimizes, schedules |
| Qualifies and enriches leads | Scores, enriches from domain, routes to deals |
| Sends newsletter campaigns | Segments subscribers, drafts, schedules sends |
| Manages product promotions | Creates landing pages, promotional posts |
| Recovers abandoned carts | Detects stale orders, drafts recovery campaigns |
| Reviews deal pipeline | Surfaces stale deals, drafts re-engagement |
| Proposes new objectives | Reads site stats, spots gaps, creates its own goals |
| Evolves its own capabilities | Creates new skills, updates its instructions, reflects |

---

## FlowPilot 2.0 — Full Autonomy

FlowWink 2.0 ships complete **10/10 autonomy** across every layer of your digital business:

### 37+ Skills across your entire business

| Domain | Skills |
|--------|--------|
| **CMS** | Pages (create/publish/rollback), block-level manipulation (add/edit/remove/reorder), Global Elements |
| **Content** | Blog posts, Knowledge Base, content research, SEO briefs, social media batches |
| **CRM** | Leads, Companies, Deals, Form submissions, Lead qualification, Company enrichment |
| **Commerce** | Products, Orders, Bookings |
| **Communication** | Newsletter campaigns, Webinars, Gmail inbox scanning |
| **Intelligence** | Analytics, SEO audits, web research, browser automation, prospect research |
| **Learning** | Memory read/write (vector search), reflection, soul evolution |

### Workflow DAGs — Multi-step automation chains

Define automation chains where each step passes its output to the next:

```
Research topic → Write blog post → Create social posts → Schedule newsletter
     s1               s2                  s3                    s4
                  {{s1.topic}}     {{s2.post_id}}         {{s3.content}}
```

- **Template variables** — `{{stepId.result.field}}` passes data between steps
- **Conditional branching** — run a step only if a previous result meets a condition
- **Failure modes** — `on_failure: continue` or `stop` per step

### A2A Delegation — Multi-agent orchestration

FlowPilot delegates subtasks to specialist agents when depth matters:

```
FlowPilot → delegate_task("seo", "analyze /pricing page")
         → delegate_task("content", "write a case study about...")
         → delegate_task("sales", "review stale deals > $10k")
```

Built-in specialists: **seo**, **content**, **sales**, **analytics**, **email** — each with deep domain focus. Register custom agents with your own system prompts.

### Skill Packs — Install a bundle of capabilities in one command

```
skill_pack_install("E-Commerce Pack")      → product_promoter, cart_recovery_check, inventory_report
skill_pack_install("Content Marketing Pack") → content_calendar_view, seo_content_brief, social_post_batch
skill_pack_install("CRM Nurture Pack")     → lead_pipeline_review, deal_stale_check, customer_health_digest
```

---

## Architecture

FlowWink follows the **OpenClaw** agentic architecture — 9 composable layers with clear separation of concerns:

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Gateway        │     │   Brain           │     │   Memory         │
│                  │     │                   │     │                  │
│ • Visitor chat  │────▶│ • agent-reason.ts │────▶│ • pgvector       │
│ • Admin operate │     │   (ReAct loop)    │     │   semantic search│
│ • Webhooks      │     │ • resolveAiConfig │     │ • Soul + Identity│
│ • Heartbeat     │     │ • tool execution  │     │ • Conversation   │
└─────────────────┘     └──────┬───────────┘     └─────────────────┘
                               │
              ┌────────────────┼────────────────────┐
              │                │                    │
       ┌──────▼─────┐  ┌───────▼───────┐  ┌────────▼──────┐
       │   Skills    │  │   Heartbeat   │  │   Workflows   │
       │             │  │               │  │               │
       │ 37+ skills  │  │ 8-step loop   │  │ DAG chains    │
       │ Skill Packs │  │ Self-healing  │  │ Conditions    │
       │ A2A agents  │  │ Plan decomp   │  │ Template vars │
       └─────────────┘  └───────────────┘  └───────────────┘
```

### One reasoning core, all surfaces

`agent-reason.ts` is the single engine shared by every surface:
- **`agent-operate`** — interactive admin sessions (streaming)
- **`flowpilot-heartbeat`** — autonomous scheduled loop
- **`chat-completion`** — visitor-facing AI chat

No logic duplication. All surfaces get every capability automatically.

### Provider-agnostic, free-first

```
OpenAI GPT-4o → Gemini 2.5 Flash → Lovable AI → Local LLM (Ollama/LM Studio)
```

FlowPilot routes to whichever provider is configured. Use your own API keys. Run fully offline with a local model.

---

## What FlowWink replaces

| What you used to need | FlowWink replaces it with |
|-----------------------|--------------------------|
| WordPress / Webflow | Visual block editor, 50+ block types |
| HubSpot / Pipedrive | CRM with AI qualification and deal pipeline |
| Mailchimp / Klaviyo | Newsletter with autonomous campaign creation |
| Calendly | Booking system with AI follow-up |
| Jasper / Copy.ai | FlowPilot writing directly into your CMS |
| Zapier / N8N | Workflow DAGs with conditional branching |
| Intercom | AI chat with KB integration and lead capture |
| Shopify (simple) | Products, orders, and Stripe checkout |

One platform. One agent. One subscription (or self-host free).

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
| AI Providers | OpenAI, Gemini, Lovable AI, Local LLM (Ollama/LM Studio/vLLM) |

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
3. Run `./scripts/setup-supabase.sh` to deploy edge functions
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
| **[docs/flowpilot.md](docs/flowpilot.md)** | Complete FlowPilot agent reference — all 37+ skills, heartbeat protocol, tool groups |
| **[docs/OPENCLAW-LAW.md](docs/OPENCLAW-LAW.md)** | Agentic architecture laws — the principles all future development must follow |
| **[docs/SETUP.md](docs/SETUP.md)** | Supabase project setup, environment variables, migrations |
| **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** | Docker, Easypanel, Railway, Fly.io deployment guides |
| **[docs/MODULES.md](docs/MODULES.md)** | Module documentation — Pages, Blog, CRM, Commerce, etc. |
| **[docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md)** | Architecture, extending the platform, writing skills |

---

## Roadmap

The agentic web is early. What's coming next:

- **Hosted Skill Pack Registry** — Import community skill packs from a manifest URL
- **Workflow Visualization** — Admin UI to view and edit DAG steps visually
- **A2A Message Protocol** — `@a2a:agent-name` inline delegation in the operate chat
- **Multi-Tenant Mode** — Run FlowWink as a SaaS with per-tenant agent isolation
- **Agent Marketplace** — Shareable FlowPilot configurations (soul + skills + workflows)

---

## Contributing

Contributions are welcome. Open an issue or submit a pull request. See **[docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)**.

## License

MIT — see [LICENSE](LICENSE) for details.

---

*Stop managing. Start directing. FlowPilot runs the business so you can build it.*

**Made in Sweden 🇸🇪**
