---
title: "Manufacturing (MRP-light) — Module Spec"
module_id: "manufacturing"
version: "0.1.0-draft"
category: "data"
autonomy: "agent-capable"
status: "spec / not yet implemented"
owner: "ERP track"
---

# Manufacturing (MRP-light)

> **Status:** Specification only. No tables, no UI, no skills exist yet.
> This document defines the contract that the upcoming module must honor so that the handbook narrative ("OpenClaw runs the factory floor") is buildable.

---

## 1. Why this module exists

Closes the most credibility-damaging Odoo gap for a B2B/discrete-manufacturing prospect:
we already have **Inventory + Purchasing + Products + Projects**, but we cannot answer
*"How do you know what to build, from which components, and when to reorder the parts?"*

`manufacturing` is the missing link between **demand** (sales order / forecast) and
**supply** (purchase order / stock). It is intentionally **MRP-light**: no full APS,
no multi-plant routing, no labor capacity model. Just enough to:

1. Define what a finished product is made of (BOM).
2. Plan a production run (Manufacturing Order).
3. Consume components and produce finished goods (stock moves).
4. Trigger procurement when components are short.
5. Let an agent (FlowPilot or OpenClaw) operate the loop.

---

## 2. Process — Make-to-Stock loop

```
┌─────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│ Sales Order /   │───▶│ MO Planning       │───▶│ Component Check   │
│ Reorder Point   │    │ (qty + due_date)  │    │ (stock vs BOM)    │
└─────────────────┘    └──────────────────┘    └────────┬─────────┘
                                                         │
                                ┌────────────────────────┼─────────────────┐
                                ▼                        ▼                 ▼
                      ┌──────────────────┐   ┌──────────────────┐  ┌──────────────────┐
                      │ Components OK     │   │ Shortage          │  │ No BOM / invalid │
                      │ → MO confirmed    │   │ → trigger PO      │  │ → block + alert  │
                      └─────────┬────────┘   └────────┬─────────┘  └──────────────────┘
                                │                     │
                                ▼                     ▼
                      ┌──────────────────┐   ┌──────────────────┐
                      │ Produce / consume │   │ Wait for receipt  │
                      │ stock_moves       │   │ then back to plan │
                      └─────────┬────────┘   └──────────────────┘
                                │
                                ▼
                      ┌──────────────────┐
                      │ MO done           │
                      │ → +finished stock │
                      │ → -components     │
                      │ → emit event      │
                      └──────────────────┘
```

Maturity target: **L3 manual** at launch, **L4 agent-augmented** within one sprint after
skills are seeded.

---

## 3. Data objects

All tables live in `public`, follow the `created_at / updated_at / created_by` convention,
have RLS (admin write, employee read), and are indexed on the FK columns shown.

### 3.1 `bom_headers` — Bill of Materials (header)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `product_id` | uuid FK → `products.id` | The finished good. **Indexed.** |
| `version` | text | e.g. `v1`, `v2-2026Q1`. |
| `is_active` | boolean | Only one active version per product. Enforced by partial unique index. |
| `quantity_produced` | numeric(12,4) | How many units this BOM produces in one run (default 1). |
| `routing_notes` | text | Free-form work instructions (no formal routing table in MRP-light). |
| `created_at`, `updated_at`, `created_by` | | |

### 3.2 `bom_lines` — Components

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `bom_id` | uuid FK → `bom_headers.id` ON DELETE CASCADE | |
| `component_product_id` | uuid FK → `products.id` | |
| `quantity` | numeric(12,4) NOT NULL | Required per `quantity_produced`. |
| `unit` | text | `pcs`, `m`, `kg`, … (mirrors `products.unit`). |
| `scrap_pct` | numeric(5,2) DEFAULT 0 | Optional waste factor. |
| `position` | int | Sort order in the assembly. |

Constraint: `bom_id`, `component_product_id` unique (no duplicate component lines).

### 3.3 `manufacturing_orders` (MO)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `mo_number` | text UNIQUE | Generated `MO-2026-0001` (sequence per year). |
| `product_id` | uuid FK → `products.id` | Finished good. |
| `bom_id` | uuid FK → `bom_headers.id` | Snapshotted at confirmation time. |
| `quantity` | numeric(12,4) NOT NULL | How many to build. |
| `status` | enum `mo_status` | `draft` → `planned` → `confirmed` → `in_progress` → `done` / `cancelled`. |
| `due_date` | date | |
| `started_at`, `completed_at` | timestamptz | |
| `source_type` | text | `manual`, `sales_order`, `reorder`, `agent`. |
| `source_id` | uuid | Polymorphic — points to the trigger row. |
| `notes` | text | |
| `created_at`, `updated_at`, `created_by` | | |

Trigger: on `status` change to `done`, post stock moves (see 3.5) **inside the same
transaction** and emit `manufacturing.completed` to `agent_events`.

### 3.4 `mo_components` — Per-MO snapshot of what to consume

Snapshotted from `bom_lines` at confirmation, so later BOM edits don't rewrite history.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `mo_id` | uuid FK → `manufacturing_orders.id` ON DELETE CASCADE | |
| `component_product_id` | uuid FK → `products.id` | |
| `qty_required` | numeric(12,4) | `bom_line.quantity * (mo.quantity / bom.quantity_produced) * (1 + scrap_pct/100)` |
| `qty_consumed` | numeric(12,4) DEFAULT 0 | Filled at completion. |
| `availability` | text | `ok`, `short`, `awaiting_po` — denormalised cache. |

### 3.5 Reuse: `stock_moves` (existing table, extended)

Add two new values to `stock_moves.move_type` enum:

- `'mo_consumption'` — component leaves stock (Dt 4960 Cr 1410 in BAS, optional).
- `'mo_production'` — finished good enters stock.

Add nullable `mo_id uuid REFERENCES manufacturing_orders(id)` so all MO-driven moves are
auditable from the MO detail page.

### 3.6 Reuse: `purchase_orders` (existing)

When a shortage is detected, the module calls the existing `create_purchase_order`
RPC with `source_type='manufacturing'`, `source_id=<mo_id>`. No new table needed.

---

## 4. RPCs (SECURITY DEFINER, all MCP-exposed)

| RPC | Purpose | Idempotent |
|---|---|---|
| `create_bom(product_id, lines[], version)` | Header + lines + activate. | No (versioned). |
| `confirm_mo(mo_id)` | Snapshot components, recompute `availability`, set status `confirmed`. | Yes — same input → same snapshot. |
| `check_mo_availability(mo_id)` | Reads stock, updates `mo_components.availability`, returns shortages. | Yes (read-only state computation). |
| `start_mo(mo_id)` | `confirmed → in_progress`, sets `started_at`. | Yes. |
| `complete_mo(mo_id, actual_qty?)` | Posts `mo_consumption` + `mo_production` stock moves, sets `done`, emits event. | Yes via `WHERE status = 'in_progress'` guard. |
| `cancel_mo(mo_id, reason)` | Releases reservations, status `cancelled`. | Yes. |
| `trigger_procurement_for_mo(mo_id)` | For each shortage, create or extend a PO via existing skill. Returns list of PO ids. | Yes — checks for existing open PO with same `source_id` before creating. |

All RPCs follow the **NOT NULL contract** — every required column appears in the
JSON-Schema `required` array (Agent Contract Integrity layer 2).

---

## 5. Skills (seeded with `mcp_exposed=true` when module enabled)

Pattern matches `purchasing-module.ts`. Eight skills total:

| Skill | Handler | Use when | NOT for |
|---|---|---|---|
| `manage_bom` | `db:bom_headers` (CRUD wrapper) | Creating/listing/updating BOM versions. | Production planning. |
| `create_manufacturing_order` | `rpc:create_mo` | Admin or sales order needs a build planned. | Recording past production. |
| `confirm_manufacturing_order` | `rpc:confirm_mo` | Snapshotting BOM + reserving components. | Final completion. |
| `check_mo_availability` | `rpc:check_mo_availability` | Asking *"can we build this today?"* | Triggering POs (use next skill). |
| `trigger_procurement_for_mo` | `rpc:trigger_procurement_for_mo` | After `check_mo_availability` returns `short`. | Standalone PO creation (use `create_purchase_order`). |
| `start_manufacturing_order` | `rpc:start_mo` | Floor confirms work has begun. | Backlogged builds. |
| `complete_manufacturing_order` | `rpc:complete_mo` | Build finished, finished goods enter stock. | Cancelling. |
| `list_manufacturing_orders` | `db:manufacturing_orders` (read) | Dashboard, agent triage. | Detail of one MO (use `get` action). |

All eight registered in `manufacturing-module.ts` `skillSeeds[]` so the
**Module Registry Guardrails** test passes and `mcp-discovery-transparency` lights
them up under the `manufacturing` group.

---

## 6. Event bus integration

Emits to `agent_events` (platform layer):

| Event | Payload | Triggered when |
|---|---|---|
| `mo.created` | `{ mo_id, product_id, quantity, due_date }` | Insert. |
| `mo.confirmed` | `{ mo_id, shortages: [{component_id, qty_short}] }` | After `confirm_mo`. |
| `mo.shortage_detected` | `{ mo_id, components: [...] }` | After `check_mo_availability` finds short. |
| `mo.completed` | `{ mo_id, qty_produced, components_consumed }` | After `complete_mo`. |
| `mo.cancelled` | `{ mo_id, reason }` | After `cancel_mo`. |

Subscribes (consumes) via existing automation patterns:

| Source event | Default automation | Executor |
|---|---|---|
| `inventory.low_stock` (finished good) | Create draft MO if BOM exists, else fall through to PO. | `platform` (deterministic). |
| `order.confirmed` (sales order with manufacturable line) | Create draft MO linked to order. | `platform`. |
| `mo.shortage_detected` | Run `trigger_procurement_for_mo`. | `flowpilot` (default) or `openclaw`. |

This honors the **Platform Event Bus** memory — manufacturing produces and consumes
events through the same `event-dispatcher` cron.

---

## 7. UI surface (`/admin/manufacturing`)

Three tabs, no exotic widgets — same shadcn/Card patterns as `/admin/purchasing`:

1. **Manufacturing Orders** — Kanban (`draft | confirmed | in_progress | done`) +
   detail drawer with components table, availability chips, "Trigger procurement" button.
2. **Bills of Materials** — Product picker → BOM editor (header + line grid). Version
   dropdown to switch active version.
3. **Insights** — Counts by status, throughput last 30 days, top-shorted components.
   Reads only — no charts library beyond what's already used elsewhere.

Module flag: `enhancedByFlowPilot: true`. The whole module works manually as plain
SaaS; the agent layer just makes it autonomous.

---

## 8. Agent steps (handbook narrative)

This is the OpenClaw operator story we want in the handbook. Single MCP session,
peer scoped to `?groups=manufacturing,inventory,purchasing,products`.

```
1. Sensor:    event-dispatcher delivers `inventory.low_stock` for product
              "AcmeWidget-Pro" (qty_on_hand 4, reorder_point 25).
2. Reason:    OpenClaw checks if product has active BOM via `manage_bom?action=get`.
              → Yes, BOM v3 with 6 components.
3. Plan:      Calls `create_manufacturing_order` { product_id, quantity: 50, due_date: +7d,
              source_type: 'reorder', source_id: <event_id> }.
4. Confirm:   Calls `confirm_manufacturing_order(mo_id)`.
              → Returns shortages: [{ "M3 screws", short 120 }, { "PCB rev2", short 50 }].
5. Procure:   Calls `trigger_procurement_for_mo(mo_id)`.
              → Creates PO-2026-0142 to preferred vendor (existing skill picks vendor by
                price + lead time).
6. Notify:    Posts an objective to FlowPilot: "MO-2026-0007 awaiting receipt of
              PO-2026-0142 — re-check availability when goods received."
7. Wait:      On `purchase.received`, automation re-runs `check_mo_availability`. If `ok`,
              automation calls `start_manufacturing_order`. If still short, loop.
8. Complete:  Floor operator (or agent, if trust=auto) calls `complete_manufacturing_order`.
              Stock moves post atomically. `mo.completed` event fires.
              Accounting subscribes (existing pattern) and books WIP → finished goods.
```

Every step is a real RPC. Every state change is auditable in `audit_logs` and
`agent_objectives`. No simulation, no mock data — per *Modules as Real SaaS, not
Simulations* memory.

---

## 9. What this spec deliberately leaves out (for v1)

To keep MRP-light actually light:

- **Multi-level BOMs** — components can themselves have BOMs, but we don't recursively
  plan sub-assemblies in v1. (Workaround: create MOs manually for sub-assemblies first.)
- **Work centers / capacity / labor hours** — `routing_notes` is free text only.
- **Quality control points** — separate `quality` module later.
- **Backflush vs pick-list flows** — v1 is backflush only (consume on completion).
- **Lots / serial numbers** — handled by stock module if/when added; out of scope here.
- **Cost rollup** — finished good cost = sum(component.cost * qty) computed on-the-fly
  for reports; not persisted as `standard_cost` field.

These are explicit non-goals so the v1 ships and the handbook story works.

---

## 10. Pre-release checklist (Agent Contract Integrity)

Before this module flips from spec to enabled, the **Skill Linter** (`bun run lint:skills`)
must pass for all eight skills, covering:

- [ ] Layer 1 — Arg mapping: every RPC parameter present in `tool_definition.parameters.properties`.
- [ ] Layer 2 — NOT NULL coverage: `required[]` matches DB NOT NULL columns for the action.
- [ ] Layer 3 — Value domain: enums (`status`, `source_type`, `move_type`) declared as JSON-Schema enums.
- [ ] Layer 4 — Module registration: `manufacturing-module.ts` listed in `module-registry.ts`,
      guardrail test green.

Plus the standard module checklist: manifest, MCP group, nav entry, feature flag, docs
(this file), memory entry.

---

## 11. Files to create when implementing

| Path | Purpose |
|---|---|
| `supabase/migrations/<ts>_manufacturing_module.sql` | Tables, enums, indexes, RLS, RPCs, triggers. |
| `src/lib/modules/manufacturing-module.ts` | `defineModule` + `skillSeeds` + `automationSeeds`. |
| `src/pages/admin/ManufacturingPage.tsx` | Three-tab admin UI. |
| `src/components/admin/manufacturing/*` | Kanban, BOM editor, MO drawer. |
| `src/hooks/useManufacturing.ts` | React Query wrappers around the RPCs. |
| `docs/modules/manufacturing.md` | This file (already exists). |
| `mem://erp/manufacturing-mrp-light.md` | Memory: BOM versioning + snapshot pattern + non-goals. |

---

*Last updated: April 2026. This is a draft spec — implementation pending prioritization.*
