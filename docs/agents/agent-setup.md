---
title: "Agent Setup — from invite to operator (Game Master pattern)"
audience: "platform owners + game masters (Claude Code, human operators)"
last_updated: "2026-05-26"
---

# Agent Setup

How an external agent (OpenClaw, Hermes, ClawThree, Claude Desktop, custom MCP
claw) goes from "nothing" to "running a department on this FlowWink site".

This is the flow we used to seed the **clawable.org agentic handbook**
simulations — Claude Code acted as **game master (spelledare)**, generated
invites, assigned roles to OpenClaw peers, then observed and reset.

---

## 1. Generate an invite

`/admin/federation → Agent Invites`

Pick one of the 5 operator missions (all `category: 'operator'`):

| Mission | When to use |
|---|---|
| **Full Operator** | One peer owns everything (no department split) |
| **Growth Operator** | Lead gen, pipeline, conversion |
| **Commerce Operator** | Orders, inventory, fulfillment |
| **HR Operator** | Hiring, contracts, onboarding |
| **Finance Operator** | Invoicing, expenses, BAS 2024 accounting |
| **Custom Mission** | Write your own instructions |

Each invite generates a `fwk_*` MCP key (visible under `/admin/developer →
MCP Keys`) and renders a copy-pasteable bootstrap payload — base URL,
bearer token, two protocol options (native MCP / REST facade), key resources,
and the mission text. See [`agent_invite.md`](./agent_invite.md) for the
full template.

For department-specialist peers, also point them at the matching
[department playbook](./README.md) and the `?groups=<dept>` filter.

---

## 2. Hand off to the peer

Paste the invite payload into the peer's chat / config. The peer should:

1. `GET /rest/resources/briefing` — identity + modules + health in one call
2. `GET /rest/tools?groups=<dept>` (or `tools/list`) — discover live catalog
3. Begin the operating cadence described in the mission

No further setup on the FlowWink side. The MCP key authorises everything;
inactive modules are auto-hidden from the catalog
(`mem://architecture/mcp-module-aware-filtering`).

---

## 3. Game Master pattern (spelledare)

For demos, beta tests, training scenarios, or proving a process end-to-end,
use the **game master loop**. One human (or Claude Code) orchestrates;
multiple peers play roles.

```text
Game Master (Claude Code)
   │
   ├── seed_module_demo(module='crm', scenario='lead_storm')
   │     → 5 tagged leads in CRM, tracked in demo_runs
   │
   ├── invite Growth Operator   → OpenClaw #1  (gets fwk_xxx, plays "SDR")
   ├── invite Commerce Operator → OpenClaw #2  (gets fwk_yyy, plays "Ops")
   │
   ├── observe via /admin/federation/findings + audit_logs
   │
   └── reset_module_data(module='crm', run_id=<id>)
         → deletes ONLY the seeded rows; master data untouched
```

Key skills (MCP-exposed):

- **`seed_module_demo`** — `trust_level: auto`. Tags every created row in
  `demo_run_items`. Pilot modules: `crm`, `quotes`, `invoices`, `expenses`.
- **`reset_module_data`** — `requires_staging: true`. Defaults to `dry_run`,
  shows affected counts, requires human approval before deletion. Guarded by
  hardcoded `PROTECTED_TABLES` (KB, templates, products, identity).

See `mem://platform/demo-data-platform` for architecture.

---

## 4. Roles vs. trust

A single peer can be **Operator** (executes), **Auditor** (reviews +
reports), or **Architect** (issues objectives) — assigned per channel, not
per peer. Hard rule: at most **one Architect per objective**
(`mem://federation/single-architect-policy`).

For training scenarios the game master typically stays Architect; peers are
Operators. For external beta tests, peers can be Auditors only (read-only
plus `openclaw_report_finding`).

---

## 5. Cleanup

- **End a scenario**: `reset_module_data` per module touched.
- **Revoke a peer**: `/admin/developer → MCP Keys` → delete the `fwk_*` key.
  The invite payload becomes inert immediately.
- **Audit trail**: `audit_logs` and `beta_test_findings.reported_by` keep the
  attribution even after keys are revoked.

---

## Related

- [`agent_invite.md`](./agent_invite.md) — the invite payload template
- [`README.md`](./README.md) — department claw playbook index
- [`../modules/federation.md`](../modules/federation.md) — channels, transports, A2A
- `mem://platform/demo-data-platform` — seed/reset architecture
- `mem://federation/orchestrator-onboarding-process` — 4-step peer onboarding
- `mem://federation/agent-onboarding-missions-strategy` — Operator vs Audit
