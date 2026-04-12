# OpenClaw Law — FlowWink Agentic Architecture Standard

> **This document is LAW.** All development of the FlowAgent/FlowPilot system MUST follow these principles. Founded on the [OpenClaw](https://github.com/openclaw/openclaw) reference architecture for autonomous AI agents.
>
> For implementation details, see [`docs/pilot/`](pilot/README.md).

---

## 1. The Nine-Layer Prompt Architecture

OpenClaw assembles the system prompt from 9 ordered layers. FlowWink compiles these into a 6-layer DB-driven prompt via `buildSystemPrompt(mode)`:

| # | OpenClaw Layer | FlowWink Equivalent |
|---|---------------|---------------------|
| 1 | **Core Instructions** | `GROUNDING_RULES` (hardcoded) + Mode Identity |
| 2 | **Tool Definitions** | `getBuiltInTools()` + `loadSkillTools()` |
| 3 | **Skills Registry** | `agent_skills` table with lazy loading |
| 4 | **Model Aliases** | `resolveAiConfig()` with provider-agnostic routing |
| 5 | **Protocol Specs** | `REPLY_DIRECTIVES` + `parseReplyDirectives()` |
| 6 | **Runtime Info** | CMS Schema Awareness (modules, integrations, blocks) |
| 7 | **Workspace Files** | `agent_memory` keys: `soul`, `identity`, `agents`, `heartbeat_protocol` |
| 8 | **Bootstrap Hooks** | `fetchSkillInstructions()` + idempotent `setup-flowpilot` |
| 9 | **Inbound Context** | `chat_messages` + objectives + memory |

---

## 2. The Ten Laws

### LAW 1: Skills as Knowledge Containers
Every skill MUST have a rich `instructions` field containing: what it does, when to use it, how to think about parameters, provider knowledge, edge cases, and decision tables.

### LAW 2: Free First, Paid When Necessary
Default to `auto` (free/cheap first). `preferred_provider` for override. Document tradeoffs in skill instructions.

### LAW 3: Lazy Instruction Loading
Never inject all skill instructions into the prompt. Use `fetchSkillInstructions()` to load only for skills the agent actually calls. List metadata only (~97 chars/skill).

### LAW 4: The Agent MUST Be Able to Evolve
Built-in tools for self-modification: `skill_create`, `skill_instruct`, `skill_update`, `skill_disable`, `soul_update`, `agents_update`, `reflect`, `propose_objective`, `automation_create`.

### LAW 5: Handler Abstraction
Skills use handler strings, NOT direct function calls: `edge:fn`, `module:name`, `db:table`, `webhook:url`.

### LAW 6: Scope-Based Permissions
Every skill MUST define scope: `internal`, `external`, or `both`.

### LAW 7: Approval Gating
Destructive or costly skills MUST set `requires_approval: true`. New agent-created automations are disabled by default.

### LAW 8: Self-Healing Protocol
Auto-quarantine skills after 3 consecutive failures. Linked automations also disabled. Admin must manually re-enable.

### LAW 9: Heartbeat Protocol (7-Step Loop)
Every autonomous heartbeat follows: **Self-Heal → Propose → Plan → Advance → Automate → Reflect → Remember**.

### LAW 10: Unified Reasoning Core
All agent surfaces (interactive, autonomous, visitor chat) MUST share `agent-reason.ts`. No logic duplication.

---

## 3. Key Architectural Decisions

FlowWink is a **CMS-native** agentic system. These are intentional adaptations, not gaps:

| Decision | OpenClaw | FlowWink | Rationale |
|----------|----------|----------|-----------|
| Storage | Markdown on disk | PostgreSQL (`agent_memory`) | Relational data, RLS, multi-user |
| Transport | WebSocket daemon | HTTP/SSE edge functions | Serverless, scales to zero |
| Memory | File-based (git) | DB-based (pgvector) | Structured queries, RLS |
| Skills | File auto-discovery (`SKILL.md`) | DB table + handler routing | Admin UI, no SSH needed |
| Workspace | `SOUL.md`, `IDENTITY.md`, `AGENTS.md`, `TOOLS.md`, `USER.md` on disk | Same keys in `agent_memory` table | Identical semantics, DB-backed |
| Skill Format | YAML frontmatter + `## When to Use` / `## When NOT to Use` | `description` with `Use when:` / `NOT for:` + `instructions` column | Same routing pattern, DB-native |
| Channels | Multi-platform bridges | Web-only (chat + admin) | CMS visitors use website |
| Isolation | Docker containers | Deno Edge Functions | Supabase-native |
| Heartbeat | 30-min timer | 12h cron | CMS ops are less time-sensitive |
| Intent Guards | None — skill descriptions handle all routing | None — removed in favor of OpenClaw pattern | Descriptions as routing logic |

## 4. Workspace File Mapping

| OpenClaw File | FlowWink `agent_memory` key | Purpose |
|---------------|----------------------------|---------|
| `SOUL.md` | `soul` | Persona, boundaries, tone |
| `IDENTITY.md` | `identity` | Agent name, role, emoji |
| `AGENTS.md` | `agents` | Operating instructions, conventions |
| `TOOLS.md` | `tools` | User-maintained tool notes |
| `USER.md` | `user` | User profile, preferred address |
| `BOOTSTRAP.md` | N/A (handled by `setup-flowpilot`) | One-time first-run ritual |

---

*This document supersedes all previous architectural descriptions. Revised: 2026-03-29.*
*Implementation details: [`docs/pilot/`](pilot/README.md)*
