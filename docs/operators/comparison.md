---
title: FlowWink vs Odoo / HubSpot / NetSuite
description: How FlowWink compares to traditional business suites for operators evaluating a BOS.
last_updated: 2026-05-23
---

# FlowWink vs traditional business suites

FlowWink is a **self-hosted, single-tenant Business Operating System** — CMS, CRM and ERP in one codebase, with every module exposed over MCP so any agent (FlowPilot, OpenClaw, Claude Desktop, custom) can operate it.

The comparison below is from the operator's point of view — what you actually deal with day to day.

| | **FlowWink** | **Odoo** | **HubSpot** | **NetSuite** |
|---|---|---|---|---|
| **Hosting** | Self-hosted (Docker, Easypanel, Railway, your own infra). Single-tenant per deploy. | Self-hosted or Odoo.sh SaaS | SaaS only | SaaS only |
| **Pricing model** | Open source / one-time license. No per-user fees. | Per-user, per-module | Per-seat + per-contact tiers | Per-user + module licensing, enterprise-priced |
| **Data ownership** | 100 % yours — your Supabase / Postgres | Yours if self-hosted | Vendor-hosted | Vendor-hosted |
| **CMS + CRM + ERP in one** | ✅ Native — same DB, same admin | ✅ (CMS via Website module) | Partial (CRM-first, CMS bolt-on, no ERP) | ❌ ERP-only |
| **Module model** | `defineModule()` manifests, opt-in, hot-toggle in `/admin/modules` | Strong — apps marketplace | Limited (hubs + add-ons) | Strong — SuiteApps, but heavy |
| **Agent / MCP surface** | ✅ Every module ships MCP-exposed skills out of the box | ❌ No native MCP | ❌ No native MCP (Breeze AI is closed) | ❌ No native MCP |
| **Built-in autonomous operator** | ✅ FlowPilot (opt-in module — soul, objectives, heartbeat, reflection) | ❌ | Partial (Breeze copilots) | Partial (SuiteAI features) |
| **BYO agent** | ✅ Claude Desktop, OpenClaw, ClawWink, custom — all over MCP | ❌ | ❌ | ❌ |
| **Accounting locale packs** | BAS 2024 (SE), IFRS, US GAAP — pluggable + export adapters (SIE/SAF-T) | Strong (country localization apps) | ❌ | Strong (multi-country) |
| **Extensibility** | TypeScript + Supabase edge functions, idiomatic React | Python + XML views | Limited (CRM cards, custom objects) | SuiteScript (JS) |
| **Time to first useful site** | Minutes (template install + module toggle) | Hours / days | Hours | Weeks (implementation partner) |
| **Best for** | SMB / consultancies / agencies wanting one stack + agent-native workflows | Mid-market wanting deep ERP + apps marketplace | Sales/marketing-first orgs | Large enterprise, multi-entity finance |

## When to pick FlowWink

- You want **one stack** for site, CRM and operations — not three vendors stitched together.
- You want **agents to actually run the business** (not just chat about it) — and the freedom to swap which agent.
- You care about **data sovereignty** (GDPR, regulated industries, on-prem).
- You're a **small team** that can't afford NetSuite implementation costs or HubSpot per-seat sprawl.

## When to pick something else

- **You need an Odoo-style apps marketplace today.** FlowWink's module count is growing (~62 modules) but Odoo has 10 000+ third-party apps. If your business depends on a specific industry vertical app, check Odoo first.
- **You're a Fortune-500 multi-entity, multi-currency consolidation.** NetSuite is purpose-built for that. FlowWink supports multi-currency and locale packs but is not yet a consolidation suite.
- **You only need CRM and marketing automation.** HubSpot is best-of-breed for that narrow scope — FlowWink is a wider system and may be over-engineered for pure CRM use.

## What you get with FlowWink that the others don't

1. **MCP-native by design.** Every business capability is a skill, every skill is callable by any MCP client. You aren't waiting for the vendor to ship an "AI feature."
2. **Operator-agnostic.** Run FlowPilot, or run Claude Desktop, or run no agent at all — the platform is the same.
3. **Single codebase, single DB.** No integration glue between CMS, CRM and ERP. A lead has the same `id` whether it was captured from a landing page, a chat conversation or a manual entry.
4. **Department claws.** Specialist external agents (marketing, sales, finance, ops, support, success) each get a focused composite MCP group instead of seeing all ~280 skills.

## Related

- [`../concepts/elevator-pitch.md`](../concepts/elevator-pitch.md) — one-page positioning
- [`../concepts/operator-strategy.md`](../concepts/operator-strategy.md) — choosing your operator
- [`../architecture/mcp-as-platform.md`](../architecture/mcp-as-platform.md) — why MCP is a platform layer
- [`../agents/README.md`](../agents/README.md) — department-claw playbooks
