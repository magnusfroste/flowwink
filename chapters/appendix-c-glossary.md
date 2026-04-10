---
title: "Appendix C: Glossary"
description: "Key terms and concepts used throughout the Clawable handbook."
order: 92
icon: "book-open"
appendix: true
---

# Appendix C: Glossary

> **A reference for the terms, concepts, and abbreviations used throughout this handbook.**

---

## Agent Concepts

| Term | Definition |
|------|-----------|
| **Agentic AI** | AI systems with three properties: agency (can decide and act), persistence (remembers across sessions), and adaptation (improves over time). Distinguished from prompt-response AI and tool-augmented AI. |
| **Agent** | The complete system around an LLM — memory, skills, surfaces, and infrastructure — that enables autonomous operation. The agent is not the model; the agent is the orchestration layer. |
| **Agent Card** | A JSON document describing an agent's capabilities, skills, and communication endpoint. Used for discovery in A2A communication. Follows patterns from Google's A2A protocol. |
| **Agent Manager** | A human role responsible for setting objectives, monitoring performance, calibrating behavior, and managing the soul/identity of one or more agents. Term coined by Harvard Business Review (February 2026). |
| **Control Plane** | The layer between the user and the AI model that decides what the model sees, what tools it can use, and how it acts. Where the real product value lives in agentic systems. |
| **Digital Employee** | Mental model for understanding agents in an organizational context. An agent is hired (deployed), trained (configured), given objectives, supervised, and developed — not just installed and configured like software. |
| **ReAct Loop** | Reasoning + Acting loop. The agent reasons about what to do, takes an action (tool call), observes the result, and reasons again. Repeats until the task is complete or a limit is reached. |
| **Swarm** | Multiple specialized agents working together, each with its own role, identity, and skill set. Coordinated via A2A protocols and/or an orchestration layer. |

---

## OpenClaw Concepts

| Term | Definition |
|------|-----------|
| **SOUL.md** | The file that defines an OpenClaw agent's personality, values, tone, and boundaries — who the agent *is*. |
| **AGENTS.md** | The file that defines an OpenClaw agent's operating rules, conventions, and safety constraints — how the agent *works*. |
| **HEARTBEAT.md** | The file that defines what an OpenClaw agent checks and does during autonomous cycles — what the agent *does when nobody is watching*. |
| **Heartbeat** | A scheduled, self-directed execution cycle. The agent wakes up, assesses the current state, decides what needs attention, acts, and reflects. OpenClaw default: every 30 minutes. Flowwink: structured 7-step protocol. |
| **Skill** | A knowledge container that defines an agent capability: name, description, routing rules, JSON schema, rich instructions, handler, scope, and approval gate. Skills are the unit of agent capability. |
| **SKILL.md** | The file-based skill definition format used by OpenClaw (and compatible tools like Kilo Code and NanoClaw). Contains instructions the agent reads on demand. |
| **ClawHub** | The skill/plugin marketplace for OpenClaw. Skills can be installed via `openclaw plugins install clawhub:<package>`. |
| **Workspace Files** | The set of files (`SOUL.md`, `AGENTS.md`, `HEARTBEAT.md`, `IDENTITY.md`, `USER.md`, `TOOLS.md`, `MEMORY.md`) that define an OpenClaw agent's identity and are injected into every reasoning turn. |

---

## Flowwink Concepts

| Term | Definition |
|------|-----------|
| **Flowwink** | An open-source, self-hosted business platform — like Odoo meets Supabase. Each business runs its own isolated instance. Bundles CMS, CRM, blog, newsletter, booking, e-commerce, and more. |
| **FlowPilot** | The autonomous agent that operates a Flowwink instance. Runs the heartbeat protocol, manages content, qualifies leads, and executes business operations without being asked. |
| **FlowAgent** | The admin-facing agent surface in Flowwink. Handles interactive conversations with the business owner/admin via the admin panel. |
| **Public Chat** | The visitor-facing agent surface in Flowwink. Read-only + booking scope. Answers questions from the knowledge base and captures leads. |
| **Edge Function** | A serverless function running on Supabase (Deno runtime). Flowwink's agent surfaces, heartbeat, and A2A communication are all implemented as edge functions. |
| **Instance** | A single Flowwink deployment serving one business. Each instance has its own database, auth, edge functions, and agent. Self-hosted or running in an isolated cloud container. |

---

## Architecture Concepts

| Term | Definition |
|------|-----------|
| **A2A (Agent-to-Agent)** | Communication between agents. Three levels exist: intra-process (OpenClaw sessions), inter-instance (Flowwink custom A2A), and inter-organizational (Google A2A protocol). |
| **Approval Gate** | A mechanism that pauses agent execution and requires human approval before a high-risk action is performed. Configured per skill via `requires_approval`. |
| **Autonomy Spectrum** | The range from full human control to full agent autonomy. Different actions sit at different points. Calibrated through graduated trust phases (Observer → Assistant → Operator → Director). |
| **Drift** | A long-term failure mode where an agent's behavior, tone, and judgment gradually shift from the original design — without anyone changing the configuration. Caused by memory accumulation, reflection loop bias, and soul mutation. |
| **Handler** | The routing mechanism that determines how a skill is executed. Flowwink handlers include: `edge:`, `module:`, `db:`, `webhook:`, `a2a:`, `responses:`. |
| **Lazy Loading** | Skills are NOT injected as full instructions into the system prompt. Only name, description, and path are listed. The agent reads full instructions on demand when it decides a skill is relevant. |
| **Memory Tier** | One of four levels of agent memory in Flowwink: L1 Session (ephemeral), L2 Working (top 30 recent), L3 Long-term (persistent, searchable), L4 Semantic (vector embeddings via pgvector). |
| **OpenResponses** | The `/v1/responses` API endpoint on an OpenClaw instance. Used for top-down task delegation (e.g., Paperclip assigns work to a Claw). The caller defines the expected output format. |
| **Scope** | A skill property that controls visibility: `internal` (admin only), `external` (visitors and peers only), or `both`. Determines which agent surface can invoke the skill. |
| **Self-Healing** | Automatic quarantine of skills that fail 3+ consecutive times. Linked automations are disabled. A healing report is injected into the next heartbeat cycle. |
| **Stagnation** | A long-term failure mode where the agent stops proposing new things and settles into repetitive patterns. Caused by memory saturation, checklist ossification, and lack of external stimulation. |
| **Token Budget** | A hard limit on context size per agent cycle. Prevents runaway API costs. Flowwink uses budget tiers (full, compact, drop) that progressively trim skill definitions as usage rises. |
| **responseSchema** | A field in A2A requests that lets the calling agent specify the structure it expects back. Best-effort — the receiving agent's LLM does its best to comply. |

---

## Infrastructure Concepts

| Term | Definition |
|------|-----------|
| **ClawStack** | Infrastructure for running multiple OpenClaw instances on a single server. Handles DNS, TLS (via Caddy), container isolation, and A2A wiring. The bridge from "I understand OpenClaw" to "I operate agents." |
| **Paperclip** | The orchestration layer that sits on top of ClawStack. Represents the organization — delegates tasks to individual Claw instances, enforces budgets, and manages agent lifecycle. The "CEO" of an agent swarm. |
| **Caddy** | The web server used by ClawStack. Handles automatic TLS certificate issuance on first request. No nginx, no certbot, no manual cert management. |
| **Role Preset** | A pre-configured agent identity in ClawStack (QA Agent, SEO Agent, Dev Agent, etc.). Writes the appropriate `SOUL.md`, `TOOLS.md`, and `AGENTS.md` at bootstrap time. |
| **RLS (Row-Level Security)** | PostgreSQL feature used by Flowwink to isolate data within an instance between admin roles, public visitors, and system processes. |

---

## Ecosystem

| Term | Definition |
|------|-----------|
| **NemoClaw** | NVIDIA's enterprise distribution of OpenClaw. Adds hardened sandboxing via OpenShell, policy-based access control, SSRF validation, and NVIDIA hardware integration (GeForce RTX, DGX Spark). Built on OpenClaw's runtime. |
| **NanoClaw** | Independent project using Claude Agent SDK as runtime. Focuses on container-based isolation (Docker/Apple Container), AI-native setup (Claude Code handles configuration), and OneCLI Agent Vault for credential management. Not built on OpenClaw's Node.js runtime. |
| **DefenseClaw** | Cisco's enterprise governance layer for OpenClaw. Multi-component system: Python CLI, Go Gateway (policy engine, inspection pipeline, SQLite audit), TypeScript plugin. Includes CodeGuard (static analysis), guardrail proxy (LLM traffic inspection), and OpenShell sandbox integration. |
| **Kilo Code** | Model-agnostic agentic coding platform (VS Code/JetBrains extension + CLI). Supports 500+ models. Adopts OpenClaw's AGENTS.md and SKILL.md file formats as a de facto standard. Used to write this handbook. |

---

## Governance Frameworks

| Term | Definition |
|------|-----------|
| **McKinsey Four-Layer Model** | Accountability framework: Design (who built the skill), Deploy (who authorized it), Operate (who monitors it), Review (who audits it). From *Trust in the Age of Agents* (March 2026). |
| **Singapore AIGL** | AI Governance Lab framework for autonomous agents. Key principles: oversight proportional to autonomy, attributable accountability, transparency to affected parties, reversibility by design. |
| **10 Laws of Agentic Architecture** | Flowwink's architectural constraints: skills as knowledge containers, cost optimization, lazy loading, self-modification, handler routing, scope isolation, approval gating, self-healing, heartbeat protocol, unified reasoning core. |
| **The Responsibility Chain** | For any agent action: who built the skill → who configured it → who trained the agent → who monitors it → who owns the organization. Each layer carries a portion of accountability. |

---

*This glossary is updated as the handbook evolves. If a term is missing, [open an issue](https://github.com/magnusfroste/clawable/issues).*
