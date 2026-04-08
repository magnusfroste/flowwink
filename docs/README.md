# FlowWink Documentation

> **FlowWink — The Business Operating System, powered by an autonomous AI operator.**

Quick reference for all documentation. Each document has a clear purpose and target audience.

---

## Quick Start

| Document | Purpose | Audience |
|----------|---------|----------|
| [DOCKER-QUICKSTART.md](./DOCKER-QUICKSTART.md) | Deploy with Docker in 5 minutes | Users/Admins |
| [SETUP.md](./SETUP.md) | Backend setup and environment | Developers |
| [UPGRADING.md](./UPGRADING.md) | Update to new versions | Users/Admins |

---

## Product & Vision

| Document | Purpose | Audience |
|----------|---------|----------|
| [PRD.md](./PRD.md) | Product requirements — modules, capabilities, architecture | Product/Dev |
| [ELEVATOR-PITCH.md](./ELEVATOR-PITCH.md) | BOS positioning, vision, competitive landscape | All |
| [INTEGRATIONS-STRATEGY.md](./INTEGRATIONS-STRATEGY.md) | Go-to-market wedge and integration playbook | Product/Growth |
| [FEEDBACK-LOOPS.md](./FEEDBACK-LOOPS.md) | Growth engine — automated business loops | Product/Growth |

---

## FlowPilot — The Agentic Operator

| Document | Purpose | Audience |
|----------|---------|----------|
| [FLOWPILOT.md](./FLOWPILOT.md) | Complete agent reference — skills, heartbeat, tools, memory | Developers |
| [SKILLS-SOURCE.md](./SKILLS-SOURCE.md) | Skill registry — all registered skills | Developers |
| [OPENCLAW-LAW.md](./OPENCLAW-LAW.md) | Agentic architecture laws (inviolable) | Developers |
| [COMMANDS.md](./COMMANDS.md) | Slash commands for FlowPilot | Users/Admins |
| [TESTING.md](./TESTING.md) | Autonomy test framework (L1–L8) | Developers |

---

## Modules & Features

| Document | Purpose | Audience |
|----------|---------|----------|
| [MODULE-API.md](./MODULE-API.md) | Module contract system, typed schemas, plugin architecture | Developers |
| [SITE-MIGRATION.md](./SITE-MIGRATION.md) | Import content from existing websites | Users/Admins |
| [TEMPLATE-AUTHORING.md](./TEMPLATE-AUTHORING.md) | Create site templates | Developers |
| [AI_DEPENDENCIES.md](./AI_DEPENDENCIES.md) | AI provider requirements per feature | Developers |

---

## Federation & APIs

| Document | Purpose | Audience |
|----------|---------|----------|
| [A2A-COMMUNICATION-MODEL.md](./A2A-COMMUNICATION-MODEL.md) | Agent-to-Agent federation protocol | Developers |
| [HEADLESS-API.md](./HEADLESS-API.md) | REST/GraphQL content API | Developers |

---

## Deployment & Operations

| Document | Purpose | Audience |
|----------|---------|----------|
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Production deployment (Docker, Easypanel, Railway, Fly.io) | DevOps |
| [MAINTENANCE.md](./MAINTENANCE.md) | Backups, updates, troubleshooting | DevOps |
| [SECURITY.md](./SECURITY.md) | Auth, RLS policies, security architecture | Security |

---

## Contributing

| Document | Purpose | Audience |
|----------|---------|----------|
| [CONTRIBUTING.md](./CONTRIBUTING.md) | How to contribute | Contributors |
| [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md) | Architecture, extending the platform | Developers |

## Pilot Engine Internals

| Document | Purpose | Audience |
|----------|---------|----------|
| [pilot/README.md](./pilot/README.md) | Pilot engine overview — serverless OpenClaw | Developers |
| [pilot/architecture.md](./pilot/architecture.md) | Engine architecture and data flow | Developers |
| [pilot/handlers-reference.md](./pilot/handlers-reference.md) | Built-in tool handler reference | Developers |

---

## Primary References (Single Source of Truth)

These three documents form the system's canonical reference:

1. **[PRD.md](./PRD.md)** — What the system does (modules, capabilities)
2. **[FLOWPILOT.md](./FLOWPILOT.md)** — How the operator works (agent logic, skills)
3. **[SKILLS-SOURCE.md](./SKILLS-SOURCE.md)** — Skill registry (all registered skills)

When in doubt, these are authoritative.

---

*Last updated: April 2026*
