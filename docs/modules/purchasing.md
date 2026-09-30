---
title: "Purchasing Module"
module_id: "purchasing"
version: "1.0.0"
category: "data"
autonomy: "agent-capable"
generated: true
generated_at: "2026-09-30"
description: Procure-to-pay lifecycle: purchase orders, vendor management, and goods receipt
---

# Purchasing

> Procure-to-pay lifecycle: purchase orders, vendor management, and goods receipt

Ships with **22 agent skills**.

## Quick Facts

| Property | Value |
|----------|-------|
| **Module ID** | `purchasing` |
| **Version** | 1.0.0 |
| **Category** | data |
| **Autonomy** | agent-capable |
| **Core** | No |
| **Capabilities** | `data:write`, `data:read` |
| **MCP-exposed skills** | 22 |
| **Owns tables** | — |

## Integrations

**Optional:** `resend`

## Skills

These skills are seeded into `agent_skills` when the module is enabled and exposed via MCP.
External operators (FlowPilot, OpenClaw, Claude Desktop, custom MCP clients) can call them directly.

| Skill | Scope | Description |
|-------|-------|-------------|
| `pay_vendor_invoice` | internal | Record the OUTGOING payment of an approved vendor invoice: posts Dt leverantörsskuld / Cr bank and marks the invoice paid. Use when: a supplier bill is due/approved and being paid — the final P2P s… |
| `register_vendor_invoice` | internal | Register an incoming vendor invoice (AP inbox). Use when: a vendor bill arrives that needs 3-way matching against a PO before payment. NOT for: customer invoices (use manage_invoice). |
| `match_po_to_invoice` | internal | 3-way match a vendor invoice against its PO and goods receipts within tolerance. Use when: a registered vendor invoice needs validation before approval. NOT for: customer reconciliation or listing … |
| `flag_invoice_variance` | internal | List vendor invoices flagged with price/quantity variance against their PO that need manual review. Use when: admin wants to see what failed automated 3-way matching. NOT for: inspecting a single i… |
| `list_reorder_candidates` | external | List products below their reordering rule, with the resolved vendor and price. THE replenishment engine: it counts VIRTUAL stock (on hand − reserved + incoming purchase orders), so goods already on… |
| `amend_purchase_order` | internal | Change an existing purchase order and record the revision in one step: quantities, prices, added or removed lines, delivery date, notes. Use when: the vendor changes a price, you need more or fewer… |
| `list_po_revisions` | internal | List the amendment history of one purchase order: revision number, reason, before/after totals and snapshots. Use when: "what changed on this PO?", auditing why a total differs from the first versi… |
| `vendor_scorecard` | internal | Vendor performance: on-time delivery %, order count, invoice variance rate and the manual rating, per vendor. Use when: choosing between suppliers, reviewing a vendor before renewing, "which vendor… |
| `rate_vendor` | internal | Set or clear the manual rating (0–5) and rating notes on a vendor. Use when: a buyer records a judgement the numbers do not show (responsiveness, quality of support). NOT for: the computed delivery… |
| `open_vendor_dispute` | internal | Open a dispute on a vendor invoice: wrong price, damaged or missing goods, a duplicate bill. Holds the payment — pay_vendor_invoice refuses a bill under open dispute. Use when: a supplier bill is w… |
| `resolve_vendor_dispute` | internal | Close a vendor invoice dispute, and when the vendor credits part of the bill, issue and book that credit memo in the same step. Use when: the vendor agreed to a credit, the bill turned out right af… |
| `issue_vendor_credit_memo` | internal | Register a credit memo received from a vendor and book it. Use when: a supplier sends a credit note — returned goods, a price correction, a goodwill credit — against a specific bill (p_vendor_invoi… |
| `apply_vendor_credit_memo` | internal | Book a vendor credit memo that was registered without being applied (status issued). Use when: a memo was issued with p_apply:false or created in the admin panel and should now reduce the debt. NOT… |
| `manage_vendor` | internal | Create, list, update, or deactivate vendors/suppliers. Use when: admin asks to add a new supplier, update vendor details, or review the vendor list. NOT for: creating purchase orders (use create_pu… |
| `create_purchase_order` | internal | Create a new purchase order (draft) for a vendor with line items. Use when: stock is low and reorder is needed, admin requests a purchase, or purchase_reorder_check suggests items to order. NOT for… |
| `send_purchase_order` | internal | Mark a draft purchase order as sent to the vendor. Use when: admin approves a PO and wants to notify the vendor. NOT for: creating POs (use create_purchase_order). |
| `receive_purchase_order` | internal | Record physical goods receipt against a confirmed/sent PO. Creates goods_receipt + lines, updates received quantities, generates stock_moves (vendor → internal location), optionally captures lot/se… |
| `match_invoice_to_receipt` | internal | Three-way match a vendor invoice against PO and physically received goods. Measures the bill against what is STILL billable — the received (or ordered, per the bill control policy) value on the PO … |
| `auto_approve_vendor_invoice` | internal | Auto-approve a vendor invoice, re-running the three-way match first and approving only if it still comes out matched. Sets status=approved + records approver. Use when: a registered bill should be … |
| `purchase_reorder_check` | internal | Analyze stock against the reordering rules and suggest (or auto-create draft) purchase orders for low-stock items. Stock means VIRTUAL stock — on hand − reserved + incoming purchase orders — so a p… |
| `update_purchase_order` | internal | General-purpose purchase order management. Use when: creating new POs, updating status (draft→sent→confirmed→received), changing expected delivery dates, adding notes, or processing vendor response… |
| `auto_generate_purchase_orders` | external | Group reorder candidates by resolved vendor and auto-create one draft PO per vendor. Every line comes from list_reorder_candidates, so quantities are computed from VIRTUAL stock (on hand − reserved… |

## Module API Contract

**Actions:** `create_po`, `list_pos`, `list_vendors`, `get_vendor`

**Input fields:** `action`, `vendor_id`, `po_id`, `lines`, `product_id`, `quantity`, `unit_cost_cents`, `notes`

**Output fields:** `success`, `po_id`, `po_number`, `message`

## Used in Processes

This module participates in the following end-to-end business processes:

- [procure-to-pay](../processes/procure-to-pay.md)

## File Map

| Purpose | Path |
|---------|------|
| Module definition | `src/lib/modules/purchasing-module.ts` |
| Hook | `src/hooks/usePurchasing.ts` |

## Contributing

To enhance this module, see [Contributing Guide](../contributing/contributing.md).

Key rules:
- Follow `ModuleDefinition<I, O>` contract pattern
- All schema changes require idempotent migrations
- Skills must be self-describing ([Law 2](../concepts/openclaw-law.md))
- Blocks are interfaces, not pipelines ([Law 3](../concepts/openclaw-law.md))
- New skills must pass the [Agent Contract Integrity](../../mem/architecture/agent-contract-integrity.md) checklist (`bun run lint:skills`)

---

*This file is auto-generated by `scripts/generate-module-docs.ts`. Do not edit manually — re-run the script after changing the module definition.*