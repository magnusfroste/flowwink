---
title: Capability File Schema
description: The machine-readable format that drives the Odoo-parity scorecard.
category: reference
---

# Capability File Schema

Each module that we track for Odoo parity has **one** file here:
`docs/parity/capabilities/<module>.json`.

These files are the **single source of truth** for the parity score. The
human-readable matrix (`docs/parity/parity-matrix.md`) is *generated* from them by
`scripts/parity-report.ts` — never edit the matrix by hand.

A capability is a single, verifiable unit of functionality. When a dev agent
ships a capability, the **only** parity bookkeeping required is to flip that
capability's `status` in this file. CI recomputes the score from the diff.

## Format

```jsonc
{
  "module": "products",                       // matches src/lib/modules/<module>-module.ts
  "odoo_app": "Sales / Inventory",            // the Odoo app(s) we benchmark against
  "current_maturity": "L3",                   // mirrors the L1–L5 in the module manifest
  "target_maturity": "L4",
  "capabilities": [
    {
      "id": "variants",                       // stable slug, never reused
      "name": "Product variants (attributes → SKUs)",
      "odoo": true,                           // does Odoo's app have this? Only odoo:true counts toward parity %
      "status": "missing",                    // done | partial | missing
      "weight": 3,                            // 1 = normal · 2 = important · 3 = foundational/critical
      "epic": "EPIC-01",                      // optional: the epic that delivers it
      "verify": "src/lib/modules/products-module.ts exposes manage_variant; product_variants table exists",
      "notes": "Blocks e-commerce, POS and inventory simultaneously."
    }
  ]
}
```

## Scoring

For one module, over capabilities where `odoo == true`:

```
score_weight  = done → 1.0 · partial → 0.5 · missing → 0.0
parity_pct    = Σ(weight × score_weight) / Σ(weight) × 100
```

Capabilities with `odoo: false` are FlowWink differentiators (e.g. AI enrichment).
They are listed for completeness and shown in the matrix, but **excluded** from the
parity denominator — we do not penalise ourselves for features Odoo lacks.

## Rules for dev agents

1. **Never delete a capability id.** Mark it `done`; history stays auditable.
2. **`status: partial`** requires a one-line `notes` saying what is still missing.
3. **`status: done`** requires the `verify` field to be true *right now* — a reviewer
   (human or agent) must be able to confirm it from the code, not from intent.
   Per the **dual-surface law**, `done` also means the capability exists as **both**
   an MCP skill (in `skillSeeds`, `mcp_exposed=true`) **and** a human admin UI.
   Ship only one surface → cap at `partial`.
4. Adding a brand-new gap you discovered? Append a capability with `status: missing`.
   Breadth grows by never leaving a known gap unrecorded.
5. **`done` is reserved for Stage 3 of the pipeline** ([`../pipeline.md`](../pipeline.md)):
   only an agent that ran the capability through the real runtime (per
   [`../verification-loop.md`](../verification-loop.md)) may set `done`. Agents
   without runtime access (cloud/CI) may flip `missing` → `partial` at most.
