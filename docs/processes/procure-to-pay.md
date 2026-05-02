# Procure-to-Pay

> From need identification to paid vendor invoice.

**Maturity level:** L3 — Operational (3-way match auto-approve live)
**Status:** ✅ Happy path + auto-approve match works; lacks tiered approval thresholds

---

## Modules involved

| Module | Role in the process |
|--------|---------------------|
| **Purchasing** | Vendors, purchase orders, goods receipt |
| **Inventory** | Stock levels, reorder triggers |
| **Expenses** | Employee expense claims (side flow) |
| **Invoicing** | Incoming vendor invoices (AP) |
| **Accounting** | Booking against accounts payable + cost accounts |
| **Documents** | Storage of PO, delivery note, invoice PDF |

---

## Step-by-step flow

```
[Low stock / Manual need]
       ↓
purchase_reorder_check (auto or manual)
       ↓
Purchase Order created (Purchasing)
       ↓
PO sent to vendor (send_purchase_order)
       ↓
Delivery → Goods Receipt (receive_goods)
       ↓
Stock updated (Inventory)
       ↓
Vendor invoice in → matched against PO + GR
       ↓
Booking (Accounting)
       ↓
Payment
```

---

## Agent coverage

| Step | 👤 Manual | 🤖 FlowPilot | 🔗 External agent |
|------|----------|-------------|-------------------|
| Vendor onboarding | ✅ | ✅ (`manage_vendor`) | — |
| Reorder detection | — | ✅ (`purchase_reorder_check`) | — |
| PO creation | ✅ | ✅ (`create_purchase_order`) | — |
| PO dispatch | ✅ | ✅ (`send_purchase_order`) | — |
| Goods receipt | ✅ | ✅ (`receive_goods`) | — |
| Expense handling | ✅ | ✅ (`manage_expenses`, `analyze_receipt`) | — |
| 3-way match | ⚠️ Manual fallback | ✅ (`match_invoice_to_receipt`, `auto_approve_vendor_invoice`) | 🔗 Delegation possible |
| Expense P2P loop | ✅ | ✅ (`submit_/approve_/book_/mark_expense_report_paid`) | — |

---

## Known gaps (missing for L5)

- ✅ **3-way match auto-approve** — `match_invoice_to_receipt` + `auto_approve_vendor_invoice` live; tolerance config still manual
- ❌ Multi-step approval based on amount thresholds
- ❌ Vendor portal (vendor self-service login)
- ❌ EDI integration for large suppliers
- ❌ Multi-currency vendor invoices

---

## Webhook events

`purchase_order.created`, `purchase_order.received`, `stock.low`, `stock.adjusted`, `expense.submitted`, `expense.status_changed`

---

## Best for

SMBs with physical inventory or recurring purchasing. Consultancies for expense handling.

## Not for

Manufacturing with complex BOM/MRP, or groups with multi-entity intercompany flows.
