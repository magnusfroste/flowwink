# Nordbrygg — the long-lived testbed

> A sandbox answers *"did something break last night?"*
> A testbed answers *"what happens when an invoice is left to age 60 days and
> nobody touches it?"*
>
> They are different questions and they need different instances.

## Why a third instance

The seed chains ([`sandbox-company.md`](../concepts/sandbox-company.md)) build
Nordbrygg AB by **running** its processes and asserting the invariants those
processes must hold. Wired into `demo-cycle`, they turn every nightly rebuild
into a regression run — which catches anything that broke in the last 24 hours.

What that construction can *never* catch is anything that takes longer than one
night to happen:

| Process | Time it needs |
|---|---|
| Dunning escalation (reminder → fee → collection) | weeks |
| Subscription renewal and churn | a billing period |
| Reordering rules firing on real consumption | as stock actually depletes |
| Aging receivables (30/60/90 buckets) | a quarter |
| SLA breach and escalation | hours to days |
| Contract renewal notice windows | months |
| Period close and FX revaluation | a month end |
| An agent's own learning loop (`flowpilot-learn`) | many cycles |

A nightly reset destroys all of it before it can happen. Every one of those is a
process FlowWink ships and nobody has watched run to completion.

The testbed is also where **external agents act over time** — OpenClaw and other
MCP operators can hold a position, make decisions across days, and be observed.
A sandbox that forgets every night cannot host that.

## Why not www.flowwink.com

It was proposed, and the data argument is winnable — you could keep coffee off
the visible pages. The argument that is not winnable is FlowPilot.

FlowWink's premise is that the website *is* a consultant: the chat on
www.flowwink.com runs FlowPilot with **that instance's** soul, objectives,
knowledge base and CRM context. Give it Nordbrygg's business and the agent on
FlowWink's own front page starts operating a coffee roastery — answering
prospects with Nordbrygg's context, and working Nordbrygg's objectives in its
autonomous loops (`flowpilot-heartbeat`, `-briefing`, `-learn`).

Measured on www before the decision: 16 pages, 34 blog posts, **76 KB articles**,
536 skills, 2 FlowPilot objectives, 0 products, 0 orders. Empty of *business*
data, full of *marketing* content — and those 76 KB articles are FlowPilot's
knowledge base, i.e. FlowWink's own documentation. Mixing Nordbrygg's in degrades
the shop window's answers permanently, and unmixing is hard.

## The three kinds of instance

| | reset | horizon | who is on it |
|---|---|---|---|
| **www** | — | — | prospects; FlowWink's own voice |
| **sandbox** | nightly, destroy-and-rebuild | one cycle | curious visitors; the regression run |
| **testbed** | **never** | months | us and external agents, acting |

## The flag, and the trap it avoids

The chains refuse to run unless `seed_chain_mode()` returns non-NULL. It reads
three settings, in order:

```sql
sandbox_mode        → 'sandbox'
demo_mode.enabled   → 'demo'
testbed_mode.enabled→ 'testbed'
(none)              → NULL, and every chain refuses
```

**Do not set `demo_mode` on the testbed.** The obvious way to unlock seeding is
to switch on `demo_mode` — but `demo-cycle` keys on exactly that setting, so the
instance would be destroyed and rebuilt every night at 03:00, erasing the
accumulated history that is the testbed's entire reason to exist. The one flag
that unlocks seeding is also the flag that schedules demolition.

`testbed_mode` unlocks the chains and is invisible to `demo-cycle`.

## Provisioning runbook

A site is four layers and they drift if not synced together
([provisioning-and-updates.md](provisioning-and-updates.md)).

### 1. Schema

```bash
supabase db push --project-ref <nordbrygg-ref>
```

### 2. Edge functions

```bash
supabase functions deploy chat-completion  --no-verify-jwt --project-ref <ref>
supabase functions deploy get-page         --no-verify-jwt --project-ref <ref>
supabase functions deploy mcp-server        --no-verify-jwt --project-ref <ref>
supabase functions deploy agent-execute     --no-verify-jwt --project-ref <ref>
# …and the rest; see the provisioning runbook for the full list.
```

Do **not** deploy or schedule `demo-cycle` here. Nothing should reset this
instance.

### 3. Skills

```bash
npm run skills:json
DATABASE_URL='postgresql://postgres:<pw>@db.<ref>.supabase.co:5432/postgres' \
  npm run sync:skills -- --apply
```

### 4. Settings

```sql
-- The instance knows its own address (never hardcode it anywhere else).
UPDATE site_settings
   SET value = jsonb_set(value, '{siteUrl}', '"https://nordbrygg.flowwink.com"')
 WHERE key = 'general';

-- Testbed, not demo. This is the line that keeps demo-cycle away.
INSERT INTO site_settings (key, value)
VALUES ('testbed_mode', '{"enabled": true}'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = excluded.value;

-- Confirm before seeding:
SELECT seed_chain_mode();   -- must return 'testbed'
```

### 5. Seed the business — once

```sql
SELECT seed_stock_locations();
SELECT sandbox_seed_p2p();   -- inbound: three POs, one vendor bill
SELECT sandbox_seed_o2c();   -- outbound: quote → order → picking → invoice
SELECT sandbox_seed_rma();   -- returns: restock, refund, one parked at inspection
```

Each refuses if its predecessor has not run, and each asserts its own invariants.
All three are idempotent — a second call returns `{}` and changes nothing.

**Never call `sandbox_teardown_chains()` or `seed_demo_operations()` here.** They
tear the history down, which is correct nightly on a sandbox and destructive on a
testbed. If the testbed genuinely needs a fresh start, that is a deliberate act
with a date on it, not a scheduled job.

### 6. Verify

```sql
-- The ledger should read as one story.
SELECT m.move_type, m.quantity, m.notes, fl.code AS frm, tl.code AS dst
  FROM stock_moves m
  LEFT JOIN stock_locations fl ON fl.id = m.from_location_id
  LEFT JOIN stock_locations tl ON tl.id = m.to_location_id
 ORDER BY m.created_at;

-- Every unit on the shelf is a unit in the books.
SELECT p.name, p.stock_quantity, sum(l.remaining_qty) AS valued
  FROM products p JOIN stock_valuation_layers l ON l.product_id = p.id
 GROUP BY p.id, p.name, p.stock_quantity
HAVING p.stock_quantity IS DISTINCT FROM sum(l.remaining_qty)::int;
-- Empty is the right answer.
```

## What to watch for, once time starts passing

The point is to let it run and see what the platform does unattended. The states
worth checking back on:

- **Does the overdue invoice escalate?** `F-2026-0288` is seeded 12 days overdue.
  Does `dunning-processor` act on it, and what does it do on day 30, 60, 90?
- **Does the reordering rule fire?** Stock depletes as the testbed is used. The
  rule has three homes (#247) — which one wins in practice?
- **Does the parked RMA get chased?** `RMA-00002` sits at `received`,
  un-inspected, on purpose. Does anything notice?
- **Does the awaiting PO ever land?** The Milano Due import is dated +9 days.
  What happens when the expected delivery date passes with no receipt?
- **What does FlowPilot decide?** Its briefing and heartbeat run against a
  business with real history. Read `agent_events` and the briefings over a week.

Findings from this instance belong in `beta_test_findings` via
`scan_beta_findings` / `resolve_finding`, the same as any other QA — and a live
call is authoritative, an agent's report is not.
