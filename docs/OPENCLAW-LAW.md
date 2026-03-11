# OpenClaw Law — FlowWink Agentic Architecture Standard

> **This document is LAW.** All future development of the FlowAgent/FlowPilot system MUST follow these principles. They are inspired by and aligned with the OpenClaw framework — the reference architecture for autonomous AI agents.

---

## 1. The Nine-Layer System Prompt Architecture

OpenClaw decomposes the agent system prompt into 9 distinct layers with clear separation of concerns. FlowWink maps to each layer:

| # | OpenClaw Layer | FlowWink Implementation | Status |
|---|----------------|------------------------|--------|
| 1 | **Core Instructions** | Heartbeat protocol + Operate protocol in `flowpilot-heartbeat` and `agent-operate` | ✅ Done |
| 2 | **Tool Definitions** | `getBuiltInTools()` + `loadSkillTools()` in `agent-reason.ts` | ✅ Done |
| 3 | **Skills Registry** | `agent_skills` table with auto-discovery via `loadSkillTools(scope)` | ✅ Done |
| 4 | **Model Aliases** | `resolveAiConfig()` with provider-agnostic routing (OpenAI/Gemini/Lovable) | ✅ Done |
| 5 | **Protocol Specs** | Tool-calling format (OpenAI function-calling JSON schema) | ✅ Done |
| 6 | **Runtime Info** | Site stats, recent activity, automations, self-healing report | ✅ Done |
| 7 | **Workspace Files** | SOUL.md → `agent_memory(key='soul')`, IDENTITY → `agent_memory(key='identity')` | ✅ Done |
| 8 | **Bootstrap Hooks** | Skill instructions loaded lazily via `fetchSkillInstructions()` | ✅ Done |
| 9 | **Inbound Context** | User messages + conversation history + @-commands | ✅ Done |

---

## 2. The Five-Component Architecture

OpenClaw's five pillars, mapped to FlowWink:

### 2.1 Gateway (Message Router)
| OpenClaw | FlowWink |
|----------|----------|
| Multi-channel (Slack, Discord, WhatsApp) | `chat-completion` (visitor), `agent-operate` (admin SSE), Signal Ingest API (webhooks) |
| Protocol normalization | Unified message format via `chat_messages` table |
| Session management | `chat_conversations` with persistent `conversation_id` |

### 2.2 Brain (LLM Orchestrator)
| OpenClaw | FlowWink |
|----------|----------|
| ReAct reasoning loop | `agent-reason.ts` → iterative tool-call loop (max 6-8 iterations) |
| Model-agnostic | `resolveAiConfig()` — OpenAI, Gemini, Lovable AI, local endpoints |
| Tool calling | OpenAI function-calling format, parallel tool execution |
| Chain depth | `MAX_CHAIN_DEPTH = 4` for plan advancement |

### 2.3 Memory (Persistent Context)
| OpenClaw | FlowWink |
|----------|----------|
| `MEMORY.md` (curated facts) | `agent_memory` table (categories: preference, context, fact) |
| `SOUL.md` (personality) | `agent_memory(key='soul')` — purpose, values, tone, philosophy |
| `IDENTITY.md` (role) | `agent_memory(key='identity')` — name, role, capabilities, boundaries |
| Daily conversation logs | `chat_messages` + `chat_conversations` |
| Long-term recall | `loadMemories()` — last 30 memories injected into prompt |
| Memory evolution | `memory_write`, `memory_read`, `soul_update` tools |

### 2.4 Skills (Capability Modules)
| OpenClaw | FlowWink |
|----------|----------|
| `~/skills/` directory with SKILL.md | `agent_skills` table with `instructions` markdown field |
| Auto-discovery at startup | `loadSkillTools(scope)` — scope-filtered (internal/external/both) |
| Skill instructions | Lazy-loaded via `fetchSkillInstructions()` after first use |
| Skill creation by agent | `skill_create` built-in tool |
| Skill evolution | `skill_instruct` + `skill_update` tools |
| Handler routing | `edge:fn`, `module:name`, `db:table`, `webhook:url` |

### 2.5 Heartbeat (Proactive Loop)
| OpenClaw | FlowWink |
|----------|----------|
| `HEARTBEAT.md` config | `flowpilot-heartbeat` edge function with 7-step protocol |
| Cron-based execution | Automation dispatcher + cron trigger evaluation |
| Self-healing | `runSelfHealing()` — 3 consecutive failures → auto-disable |
| Plan decomposition | `decomposeObjectiveIntoPlan()` → 3-7 AI-planned steps |
| Plan advancement | `advance_plan` with chain=true (up to 4 steps per call) |
| Proactive proposals | `propose_objective` with duplicate detection |

---

## 3. Mandatory Laws

These are non-negotiable rules for all future development:

### LAW 1: Skills as Knowledge Containers
Every skill MUST have a rich `instructions` field. This is the OpenClaw SKILL.md equivalent. Instructions should contain:
- **What** the skill does
- **When** to use it vs alternatives
- **How** to think about parameters
- **Provider knowledge** (if multiple providers exist)
- **Edge cases** and failure modes
- **Decision tables** (scenario → action → why)

```markdown
# Good: Rich instructions
"Use jina for blogs/docs (free). Use firecrawl for SPAs/LinkedIn (paid, JS rendering)."

# Bad: No instructions
(description field alone is NOT enough)
```

### LAW 2: Free First, Paid When Necessary
When multiple providers exist for the same capability:
1. **Default to `auto`** — system tries free/cheap providers first
2. Add a `preferred_provider` parameter so the agent can override
3. Store provider preferences in `site_settings` (not hardcoded)
4. Document provider tradeoffs in skill instructions

### LAW 3: Lazy Instruction Loading
Never inject all skill instructions into the system prompt upfront. Use `fetchSkillInstructions()` to load instructions only for skills the agent actually calls. This keeps the prompt lean and scales with skill count.

### LAW 4: The Agent MUST Be Able to Evolve
The agent must have built-in tools for self-modification:
- `skill_create` — create new skills
- `skill_instruct` — add/update knowledge
- `skill_update` — modify parameters
- `skill_disable` — remove broken skills
- `soul_update` — evolve personality
- `reflect` — self-assessment with auto-persisted learnings
- `propose_objective` — proactive goal creation
- `automation_create` — self-scheduling

### LAW 5: Handler Abstraction
Skills use handler strings, NOT direct function calls:
- `edge:function-name` → Edge Function invocation
- `module:module-name` → Module API operation
- `db:table-name` → Database query
- `webhook:url` → External HTTP call

New handler types can be added to `agent-execute` without modifying the skill registry.

### LAW 6: Scope-Based Permissions
Every skill MUST define its scope:
- `internal` — Only FlowPilot (admin operations)
- `external` — Only visitor chat
- `both` — Available to both agents

### LAW 7: Approval Gating
Destructive or costly skills MUST set `requires_approval: true`. The agent logs `pending_approval` activities for admin review. New agent-created automations are disabled by default.

### LAW 8: Self-Healing Protocol
The system automatically quarantines skills after `SELF_HEAL_THRESHOLD` (3) consecutive failures. Linked automations are also disabled. Admin must manually re-enable after investigation.

### LAW 9: Heartbeat Protocol (7-Step Loop)
Every autonomous heartbeat MUST follow this order:
1. **Self-Heal** — Check and quarantine failing skills
2. **Propose** — Analyze stats, propose new objectives if gaps found
3. **Plan** — Decompose objectives without plans
4. **Advance** — Execute plan steps (highest priority first)
5. **Automate** — Execute DUE automations
6. **Reflect** — Weekly self-assessment
7. **Remember** — Persist learnings to memory

### LAW 10: Unified Reasoning Core
All agent surfaces (interactive, autonomous, visitor chat) MUST share the same reasoning engine (`agent-reason.ts`). No logic duplication. Surfaces are thin wrappers.

---

## 4. Module-Skill Mapping

FlowAgent interacts with platform modules through registered skills:

### CMS & Content (Full Autonomy)

| Module | Skills | Handler | Scope |
|--------|--------|---------|-------|
| **Pages** | `manage_page`, `manage_page_blocks` | `module:pages` | internal |
| **Blog** | `write_blog_post` | `module:blog` | internal |
| **Knowledge Base** | `manage_kb_article` | `module:kb` | internal |
| **Global Elements** | `manage_global_blocks` | `module:globalElements` | internal |
| **Media** | `manage_media` | `module:media` | internal |

### CRM & Sales

| Module | Skills | Handler | Scope |
|--------|--------|---------|-------|
| **CRM/Leads** | `add_lead`, `qualify_lead` | `module:crm`, `edge:qualify-lead` | both, internal |
| **Companies** | `manage_company`, `enrich_company` | `module:companies`, `edge:enrich-company` | internal |
| **Deals** | `manage_deal` | `module:deals` | internal |
| **Forms** | `manage_form_submissions` | `module:forms` | internal |

### Communication

| Module | Skills | Handler | Scope |
|--------|--------|---------|-------|
| **Newsletter** | `send_newsletter`, `execute_newsletter_send` | `module:newsletter`, `edge:newsletter-send` | internal |
| **Webinars** | `manage_webinar` | `module:webinars` | internal |
| **Email** | `scan_gmail_inbox` | `edge:gmail-inbox-scan` | internal |

### Commerce

| Module | Skills | Handler | Scope |
|--------|--------|---------|-------|
| **Products** | `manage_product` | `module:products` | internal |
| **Orders** | `lookup_order` | `module:orders` | both |
| **Booking** | `book_appointment` | `module:booking` | both |

### Intelligence & Research

| Module | Skills | Handler | Scope |
|--------|--------|---------|-------|
| **Analytics** | `analyze_analytics`, `weekly_business_digest`, `seo_audit_page`, `kb_gap_analysis` | `db:page_views`, `edge:business-digest`, `module:analytics` | internal |
| **Content Pipeline** | `research_content`, `generate_content_proposal` | `edge:research-content`, `edge:generate-content-proposal` | internal |
| **Sales Intelligence** | `prospect_research`, `prospect_fit_analysis` | `edge:prospect-research`, `edge:prospect-fit-analysis` | internal |
| **Web Research** | `search_web`, `scrape_url` | `edge:web-search`, `edge:web-scrape` | internal |
| **Browser** | `browser_fetch` | `edge:browser-fetch` | internal |
| **Scheduling** | `publish_scheduled_content` | `edge:publish-scheduled-pages` | internal |
| **Learning** | `learn_from_data` | `edge:flowpilot-learn` | internal |
| **Objectives** | `create_objective` | `module:objectives` | internal |
| **Resume** | `manage_consultant_profile`, `match_consultant` | `module:resume` | internal |

### Integration-Aware Skills

Skills that use external providers document their provider strategy in `instructions`:

| Skill | Providers | Selection |
|-------|-----------|-----------|
| `search_web` | Firecrawl (paid) → Jina (free) | `preferred_provider` param, `auto` default |
| `scrape_url` | Firecrawl (JS rendering, paid) → Jina Reader (free) | `preferred_provider` param, `auto` default |
| `prospect_research` | Hunter.io (contacts) + Jina/Firecrawl (scraping) + AI | Orchestrated pipeline |
| `enrich_company` | Jina/Firecrawl (scraping) + AI | Auto fallback |

---

## 5. Gap Analysis vs OpenClaw

### ✅ Fully Implemented
- 9-layer prompt architecture (mapped to DB-driven equivalent)
- ReAct reasoning loop with iterative tool calling
- Persistent multi-tier memory (soul, identity, facts, preferences, context)
- Skill registry with auto-discovery and lazy instructions
- Self-healing with quarantine
- Plan decomposition and chained advancement
- Proactive objective proposals
- Automation system (cron, event, signal)
- Reflection with auto-persisted learnings
- Self-modification (skill CRUD, soul evolution)
- Approval gating (human-in-the-loop)
- Activity audit trail
- **Prompt Compiler** — `buildSystemPrompt(mode)` shared across heartbeat/operate/chat surfaces
- **Vector Memory** — `pgvector` with 768-dim embeddings, semantic search via `search_memories_semantic()` RPC
- **Context Pruning** — `pruneConversationHistory()` with AI-powered summarization of old messages
- **Full CMS Autonomy** — Block-level manipulation, page lifecycle, KB articles, global elements, deals, products, companies, forms, webinars (28+ registered skills)
- **Page Rollback** — Version history with rollback capability via `manage_page`
- **Auto Module Activation** — Modules auto-enable when FlowPilot uses them

### ⚠️ Partially Implemented
| Gap | OpenClaw Has | FlowWink Status | Priority |
|-----|-------------|-----------------|----------|
| **Thinking Modes** | Reasoning budget control (fast vs deep thinking) | Not implemented — always same model | Low |
| **Session Keys** | Conversation isolation per agent instance | Conversation IDs exist but no isolation guarantees | Low |

### ❌ Missing Layers
| Gap | OpenClaw Has | Impact | Recommendation |
|-----|-------------|--------|----------------|
| **Skill Marketplace / Discovery** | Community skills installable via registry | No external skill marketplace | Future: template-based skill packs |
| **Multi-Agent Routing** | Route messages to specialized agents | Single FlowPilot + single visitor chat | Future: A2A protocol ready (documented) |
| **Execution Sandbox** | Safe code execution environment | Skills run in edge functions (isolated) but no sandboxed code gen | Not needed for CMS use case |

---

## 6. Recommended Next Steps (Priority Order)

1. **Skill Packs** — Allow templates to include pre-configured skill sets (e.g., "E-commerce Pack" adds order tracking, inventory check, cart recovery skills).
2. **A2A Protocol** — Implement `@a2a:agent-name` for multi-agent delegation.
3. **Workflow DAGs** — Multi-step automation chains with conditional branching.

---

## 7. Data Flow Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Gateway        │     │   Brain           │     │   Memory         │
│                  │     │                   │     │                  │
│ • chat-completion│────▶│ • agent-reason.ts │────▶│ • agent_memory   │
│ • agent-operate  │     │   (ReAct loop)    │     │   (soul/identity)│
│ • signal-ingest  │     │ • resolveAiConfig │     │ • chat_messages  │
│ • heartbeat      │     │ • tool execution  │     │ • chat_convos    │
└─────────────────┘     └──────┬───────────┘     └─────────────────┘
                               │
                    ┌──────────┴──────────┐
                    │                     │
              ┌─────▼──────┐     ┌───────▼────────┐
              │   Skills    │     │   Heartbeat     │
              │             │     │                 │
              │ • agent_    │     │ • self-healing  │
              │   skills    │     │ • plan decomp   │
              │ • agent_    │     │ • advance_plan  │
              │   execute   │     │ • automations   │
              │ • lazy      │     │ • reflection    │
              │   instruct  │     │ • proposals     │
              └─────────────┘     └─────────────────┘
```

---

*This document supersedes all previous architectural descriptions. Updated: 2026-03-12.*
