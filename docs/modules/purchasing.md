---
title: "Purchasing Module"
module_id: "purchasing"
version: "1.0.0"
category: "data"
autonomy: "agent-capable"
generated: true
generated_at: "2026-07-13"
---

# Purchasing

> Procure-to-pay lifecycle: purchase orders, vendor management, and goods receipt

Ships with **14 agent skills**.

## Quick Facts

| Property | Value |
|----------|-------|
| **Module ID** | `purchasing` |
| **Version** | 1.0.0 |
| **Category** | data |
| **Autonomy** | agent-capable |
| **Core** | No |
| **Capabilities** | `data:write`, `data:read` |
| **MCP-exposed skills** | 14 |
| **Owns tables** | — |

## Integrations

**Optional:** `resend`

## Skills

These skills are seeded into `agent_skills` when the module is enabled and exposed via MCP.
External operators (FlowPilot, OpenClaw, Claude Desktop, custom MCP clients) can call them directly.

| Skill | Scope | Description |
|-------|-------|-------------|
| `pay_vendor_invoice` | internal | Record the OUTGOING payment of an approved vendor invoice: posts Dt 2440 leverantörsskuld / Cr bank and marks the invoice paid. Use when: a supplier bill is due/approved and being paid — the final … |
| `register_vendor_invoice` | internal | Register an incoming vendor invoice (AP inbox). Use when: a vendor bill arrives that needs 3-way matching against a PO before payment. NOT for: customer invoices (use create_invoice). |
| `match_po_to_invoice` | internal | 3-way match a vendor invoice against its PO and goods receipts within tolerance. Use when: a registered vendor invoice needs validation before approval. NOT for: customer reconciliation or listing … |
| `flag_invoice_variance` | internal | List vendor invoices flagged with price/quantity variance against their PO that need manual review. Use when: admin wants to see what failed automated 3-way matching. NOT for: inspecting a single i… |
| `list_reorder_candidates` | external | List products at or below their reorder point with preferred vendor info. Use when: reviewing what needs reordering, "vad behöver beställas?". NOT for: actually placing orders (use auto_generate_pu… |
| `manage_vendor` | internal | Create, list, update, or deactivate vendors/suppliers. Use when: admin asks to add a new supplier, update vendor details, or review the vendor list. NOT for: creating purchase orders (use create_pu… |
| `create_purchase_order` | internal | Create a new purchase order (draft) for a vendor with line items. Use when: stock is low and reorder is needed, admin requests a purchase, or purchase_reorder_check suggests items to order. NOT for… |
| `send_purchase_order` | internal | Mark a draft purchase order as sent to the vendor. Use when: admin approves a PO and wants to notify the vendor. NOT for: creating POs (use create_purchase_order). |
| `receive_purchase_order` | internal | Record physical goods receipt against a confirmed/sent PO. Creates goods_receipt + lines, updates received quantities, generates stock_moves (vendor → internal location), optionally captures lot/se… |
| `match_invoice_to_receipt` | internal | Three-way match a vendor invoice against PO and physically received goods. Sets match_status = matched | partial | over_invoiced | under_invoiced | no_receipt | no_po. Configurable tolerance (defau… |
| `auto_approve_vendor_invoice` | internal | Auto-approve a vendor invoice that already has match_status=matched. Sets status=approved + records approver. Use when: invoice matched within tolerance and policy allows auto-approval. NOT for: in… |
| `purchase_reorder_check` | internal | Analyze current stock levels against reorder points and suggest purchase orders for low-stock items. Use when: heartbeat detects low inventory, admin asks for reorder suggestions, or as part of dai… |
| `update_purchase_order` | internal | General-purpose purchase order management. Use when: creating new POs, updating status (draft→sent→confirmed→received), changing expected delivery dates, adding notes, or processing vendor response… |
| `auto_generate_purchase_orders` | external | Group reorder candidates by preferred vendor and auto-create one draft PO per vendor. Use when: nightly reorder run, "create purchase orders". Closes procure-to-pay loop. NOT for: single manual POs… |

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