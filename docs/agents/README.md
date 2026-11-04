---
title: "Department Claws — Playbook Index"
audience: "external operators (OpenClaw, ClawThree, Claude Desktop, custom MCP claws)"
last_updated: "2026-05-04"
description: FlowWink exposes ~600+ MCP skills. A focused department claw picks up one composite group and runs that department end-to-end — without FlowPilot.
category: agents
---

# Department Claws

> **New here?** Start with [`agent-setup.md`](./agent-setup.md) for the full
> invite → role → seed/reset (Game Master) flow, then come back for the
> department-specific playbooks below.

FlowWink exposes ~600+ MCP skills. A focused **department claw** picks up
one composite group and runs that department end-to-end — without FlowPilot.

| Department | Playbook | Composite group | Brief |
|------------|----------|-----------------|-------|
| 📣 Marketing | [marketing-claw-playbook.md](./marketing-claw-playbook.md) | `?groups=marketing` | Paid ads, content, research, analytics |
| 💼 Sales | [sales-claw-playbook.md](./sales-claw-playbook.md) | `?groups=sales` | Prospecting, deals, quotes, contracts |
| 🛟 Support | [support-claw-playbook.md](./support-claw-playbook.md) | `?groups=support` | Ticket triage, KB answers, SLA |
| 💚 Customer Success | [success-claw-playbook.md](./success-claw-playbook.md) | `?groups=success` | Retention, NPS, expansion, churn save |
| 💰 Finance | [finance-claw-playbook.md](./finance-claw-playbook.md) | `?groups=finance` | Invoicing, expenses, reconciliation, close |
| 📦 Operations | [operations-claw-playbook.md](./operations-claw-playbook.md) | `?groups=operations` | Orders, stock, purchasing, manufacturing |

## How a claw connects

```http
POST https://<your-site>/mcp
Authorization: Bearer <MCP_API_KEY>
```

`/mcp` on the site's own domain is the address every other integration has
taught operators to expect (`mcp.stripe.com`, `mcp.linear.app/mcp`); on a
Vercel deployment `api/mcp.ts` serves it, and `mcp.<your-domain>` is the same
route behind one more domain on the project. The gateway itself lives at
`<ref>.supabase.co/functions/v1/mcp-server`, which always works too — and is
the address for a job that runs longer than the proxy's 60-second window, or on
a Docker self-host without the proxy. Admin → Developer → MCP Keys shows the
one this deployment answers on.

Get a key from `/admin/developer → MCP Keys`. Discover live state with
`GET /rest/groups`.

## Why composite groups

Each group expands to multiple internal skill categories. The claw doesn't
need to know FlowWink's internal taxonomy — it just asks for `marketing` and
gets the full toolkit. See `mem://architecture/mcp-toolset-groups-and-tool-bloat-strategy`.

## What every department playbook covers

1. **Connect** — MCP endpoint and auth
2. **Pull the toolkit** — `?groups=<name>` and what it expands to
3. **End-to-end loop** — concrete JSON-RPC calls for a full workflow
4. **Approval gating** — which skills are `notify` (instant) vs `approve` (HIL)
5. **What's NOT exposed** — and why
6. **Audit & limits** — rate limits, audit trail, multi-tenancy notes
7. **Related** — memory and module references

## What every claw should know, whatever the department

- **Read first, then act:** `check_operations` (sales, receivables, contracts,
  support, field service, automations — each finding with the skill and
  arguments that fix it) and, with accounting on, `check_books`.
- **Hand a result to people as a page:** `publish_report` — a quarter's costs,
  a reconciliation, a pipeline review — markdown with KPI tiles, charts and
  live figures, every publish a version, your agent's name stamped by the
  platform. `read_skill publish_report` carries the format guide. See
  [`../modules/reports.md`](../modules/reports.md).
- **The envelope:** a failure is `{ error, code, retryable, hint }`; a refusal
  (`status: refused`) is not a failure and is never retried as is.
- **A read-only key** runs reads as they are and refuses every write — what an
  owner hands an agent they are still evaluating. Ask for a full key when you
  need to write.

## One claw per department

Recommended pattern: one external claw owns one department per FlowWink site.
FlowPilot remains the generalist; department claws are the specialists.

## Related

- `mem://federation/marketing-claw-department-pattern` — the original pattern
- `mem://architecture/mcp-as-platform-not-flowpilot-feature` — why MCP is platform
- `mem://federation/orchestrator-onboarding-process` — onboarding new peers
