# Record-to-Report

> From transaction to financial report. Bookkeeping + period-end close.

**Maturity level:** L2 — Manual (parts L3 via templates)
**Status:** ⚠️ Basic double-entry bookkeeping; lacks period-end automation

---

## Modules involved

| Module | Role in the process |
|--------|---------------------|
| **Accounting** | Chart of accounts (BAS 2024), journal entries, templates |
| **Invoicing** | Source for AR bookings |
| **Expenses** | Source for AP / expense bookings |
| **Analytics** | Financial KPI reports |
| **Documents** | Voucher / supporting document archive |

---

## Step-by-step flow

```
Business event (invoice, expense, payroll run)
       ↓
suggest_accounting_template → matches against template
       ↓
Journal entry created (manage_journal_entry)
       ↓
Review (manual)
       ↓
Booking saved
       ↓
[Periodic] Reconciliations
       ↓
[Periodic] Period-end close
       ↓
accounting_reports (BS, P&L, general ledger)
```

---

## Agent coverage

| Step | 👤 Manual | 🤖 FlowPilot | 🔗 External agent |
|------|----------|-------------|-------------------|
| Chart of accounts setup | ✅ | ✅ (`manage_chart_of_accounts`) | — |
| Template management | ✅ | ✅ (`manage_accounting_template`) | — |
| Booking suggestion | — | ✅ (`suggest_accounting_template`) | — |
| Journal entries | ✅ | ✅ (`manage_journal_entry`) | — |
| Opening balances | ✅ | ✅ (`manage_opening_balances`) | — |
| Reconciliations | ✅ | ⚠️ Partial (autonomous reconciliation) | — |
| Reports | ✅ | ✅ (`accounting_reports`) | — |
| Period-end close | ❌ Missing | — | — |
| Tax reporting | ❌ Missing | — | — |

---

## Known gaps (missing for L3+)

- ❌ **Period-end close workflow** (lock period, adjustments, reversal)
- ❌ Tax reporting (VAT, employer reports, K10)
- ❌ SIE export (for accountants)
- ❌ Bank feed / automatic reconciliation against bank statements
- ❌ Multi-currency revaluation
- ❌ Cost center / project-level bookkeeping
- ❌ Consolidation (multi-entity)

---

## Webhook events

`invoice.created`, `invoice.paid`, `expense.status_changed`

---

## Best for

Smaller companies that want internal visibility into their finances, complementing an external accountant for filings.

## Not for

Companies looking to fully replace Fortnox/Visma — we are not a complete accounting system yet. Position us as "operational finance" rather than "filings".
