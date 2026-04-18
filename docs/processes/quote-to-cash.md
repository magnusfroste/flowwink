# Quote-to-Cash

> From won deal to paid invoice. The bread and butter of consultancies.

**Maturity level:** L3 — Operational (parts L4)
**Status:** ✅ Works end-to-end for service businesses

---

## Modules involved

| Module | Role in the process |
|--------|---------------------|
| **Deals** | Source — a won deal triggers project start |
| **Projects** | Projects + tasks (Kanban) |
| **Timesheets** | Time logging against projects/tasks |
| **Invoicing** | Invoice generation from timesheets |
| **Accounting** | Booking invoices against the chart of accounts (BAS 2024) |
| **Contracts** | Underlying agreements that govern price/terms |

---

## Step-by-step flow

```
Deal won (Deals)
       ↓
Project created (Projects) — manually or via automation
       ↓
Tasks defined
       ↓
Consultants log time (Timesheets)
       ↓
Month-end → invoice_from_timesheets
       ↓
Invoice created (Invoicing)
       ↓
Booking happens (Accounting via suggest_accounting_template)
       ↓
Payment → reconciliation
       ↓
Overdue check → reminders
```

---

## Agent coverage

| Step | 👤 Manual | 🤖 FlowPilot | 🔗 External agent |
|------|----------|-------------|-------------------|
| Project setup | ✅ | ✅ (`manage_project`) | — |
| Task management | ✅ | ✅ (`manage_project_task`) | — |
| Time logging | ✅ | ✅ (`log_time`) | — |
| Invoice from time | ✅ | ✅ (`invoice_from_timesheets`) | — |
| Booking suggestion | — | ✅ (`suggest_accounting_template`) | — |
| Overdue reminders | ✅ | ✅ (`invoice_overdue_check`, automation) | — |
| Reconciliation | ✅ | ⚠️ Partial | — |

---

## Known gaps (missing for L5)

- ❌ Quote/proposal module (offer before deal won)
- ❌ Versioned price lists
- ❌ Recurring billing / subscriptions (partly via Stripe integration)
- ❌ Multi-currency at the invoice level
- ❌ Approval workflow for invoices above X
- ⚠️ Reconciliation requires manual matching for ambiguous cases

---

## Webhook events

`deal.won`, `project.created`, `task.completed`, `timesheet.submitted`, `invoice.created`, `invoice.paid`, `invoice.overdue`

---

## Best for

Consulting firms, agencies, freelancer teams billing hourly or fixed-price per project.

## Not for

Pure SaaS with MRR focus (use Stripe subscriptions directly), or manufacturers with complex project costing.
