# FlowWink Documentation

> **FlowWink — The Business Operating System, powered by an autonomous AI operator.**
>
> Docs structure inspired by [OpenClaw](https://github.com/openclaw/openclaw). FlowWink implements OpenClaw's agentic architecture in a serverless CMS shell.

---

## How This Is Organized

| Folder | What's Inside | OpenClaw Equivalent |
|--------|--------------|---------------------|
| [`concepts/`](./concepts/) | Architecture, laws, vision, positioning | `docs/concepts/` |
| [`pilot/`](./pilot/) | Agent engine internals (Pilot = our OpenClaw runtime) | Core gateway/agent code |
| [`modules/`](./modules/) | FlowWink's "claws" — the CMS/ERP modules | `docs/channels/` + `docs/plugins/` |
| [`guides/`](./guides/) | Setup, deployment, migration, operations | `docs/install/` + `docs/help/` |
| [`reference/`](./reference/) | APIs, skill registry, commands | `docs/reference/` |
| [`contributing/`](./contributing/) | How to contribute, test, author templates | Contributing guides |

---

## Concepts — Architecture & Vision

| Document | Summary | Read When |
|----------|---------|-----------|
| [prd.md](./concepts/prd.md) | Product requirements — 32 modules, 130+ skills | You need the full system scope |
| [openclaw-law.md](./concepts/openclaw-law.md) | The 10 inviolable agentic architecture laws | Building or modifying FlowPilot |
| [flowpilot.md](./concepts/flowpilot.md) | Complete agent reference — skills, heartbeat, memory | Understanding the operator |
| [elevator-pitch.md](./concepts/elevator-pitch.md) | BOS positioning and competitive landscape | Explaining FlowWink to others |
| [a2a-communication-model.md](./concepts/a2a-communication-model.md) | Agent-to-Agent federation protocol | Implementing federation |
| [feedback-loops.md](./concepts/feedback-loops.md) | Growth engine — automated business loops | Designing growth features |
| [integrations-strategy.md](./concepts/integrations-strategy.md) | Go-to-market wedge and integration playbook | Planning integrations |
| [agent-driven-development.md](./concepts/agent-driven-development.md) | How FlowPilot drives its own development | Understanding autonomy model |
| [ai-dependencies.md](./concepts/ai-dependencies.md) | AI provider requirements per feature | Checking what needs API keys |

---

## Pilot — The Agent Engine

| Document | Summary | Read When |
|----------|---------|-----------|
| [README.md](./pilot/README.md) | Pilot engine overview — serverless OpenClaw | First time reading pilot code |
| [architecture.md](./pilot/architecture.md) | Data flow: Surface → Core → Handlers | Understanding the reasoning loop |
| [handlers-reference.md](./pilot/handlers-reference.md) | All 40+ built-in tool handlers | Implementing or debugging tools |

---

## Modules — FlowWink's Claws

> Each module adds a distinct capability to the platform. Modules are FlowWink's equivalent of OpenClaw's channels and plugins — they give the agent body and context.

| Document | Summary | Read When |
|----------|---------|-----------|
| [overview.md](./modules/overview.md) | All 32+ modules, their skills, and relationships | Planning module work |

*Module-specific docs will be added as modules mature.*

---

## Guides — Setup & Operations

| Document | Summary | Read When |
|----------|---------|-----------|
| [docker-quickstart.md](./guides/docker-quickstart.md) | Deploy with Docker in 5 minutes | First deployment |
| [setup.md](./guides/setup.md) | Backend setup and environment | Development setup |
| [deployment.md](./guides/deployment.md) | Production deployment (Docker, Easypanel, Railway) | Going to production |
| [upgrading.md](./guides/upgrading.md) | Update to new versions | Version upgrades |
| [site-migration.md](./guides/site-migration.md) | Import content from existing websites | Migrating a site |
| [maintenance.md](./guides/maintenance.md) | Backups, updates, troubleshooting | Ongoing operations |
| [security.md](./guides/security.md) | Auth, RLS policies, security architecture | Security review |

---

## Reference — APIs & Registry

| Document | Summary | Read When |
|----------|---------|-----------|
| [module-api.md](./reference/module-api.md) | Module contract system, typed schemas | Building a module |
| [headless-api.md](./reference/headless-api.md) | REST content API for headless use | Headless integrations |
| [skills-source.md](./reference/skills-source.md) | Complete skill registry | Checking registered skills |
| [commands.md](./reference/commands.md) | Slash commands for FlowPilot | Using FlowPilot commands |

---

## Contributing

| Document | Summary | Read When |
|----------|---------|-----------|
| [contributing.md](./contributing/contributing.md) | How to contribute | First contribution |
| [developer-guide.md](./contributing/developer-guide.md) | Architecture, extending the platform | Deep development |
| [template-authoring.md](./contributing/template-authoring.md) | Create site templates | Building templates |
| [testing.md](./contributing/testing.md) | Autonomy test framework (L1–L8) | Writing tests |

---

## Primary References (Single Source of Truth)

1. **[concepts/prd.md](./concepts/prd.md)** — What the system does
2. **[concepts/flowpilot.md](./concepts/flowpilot.md)** — How the operator works
3. **[concepts/openclaw-law.md](./concepts/openclaw-law.md)** — The inviolable laws

---

*Last updated: April 2026*
