# Quote-to-Cash

> Från vunnen affär till betald faktura. Konsultbolagets brödsmör.

**Mognadsnivå:** L3 — Operational (delar L4)
**Status:** ✅ Fungerar end-to-end för tjänsteföretag

---

## Moduler som ingår

| Modul | Roll i processen |
|-------|------------------|
| **Deals** | Källan — vunnen deal triggar projektstart |
| **Projects** | Projekt + tasks (Kanban) |
| **Timesheets** | Tidrapportering mot projekt/tasks |
| **Invoicing** | Fakturagenerering från tidrapporter |
| **Accounting** | Bokning av fakturor mot kontoplan (BAS 2024) |
| **Contracts** | Underliggande avtal som styr pris/villkor |

---

## Steg-för-steg flöde

```
Deal won (Deals)
       ↓
Project skapas (Projects) — manuellt eller via automation
       ↓
Tasks definieras
       ↓
Konsulter loggar tid (Timesheets)
       ↓
Månadsslut → invoice_from_timesheets
       ↓
Faktura skapas (Invoicing)
       ↓
Bokning sker (Accounting via suggest_accounting_template)
       ↓
Betalning → reconciliation
       ↓
Overdue check → påminnelser
```

---

## Agent-täckning

| Steg | 👤 Manuell | 🤖 FlowPilot | 🔗 Extern agent |
|------|-----------|-------------|-----------------|
| Projektuppsättning | ✅ | ✅ (`manage_project`) | — |
| Task management | ✅ | ✅ (`manage_project_task`) | — |
| Tidrapportering | ✅ | ✅ (`log_time`) | — |
| Faktura från tid | ✅ | ✅ (`invoice_from_timesheets`) | — |
| Konteringsförslag | — | ✅ (`suggest_accounting_template`) | — |
| Overdue-påminnelser | ✅ | ✅ (`invoice_overdue_check`, automation) | — |
| Reconciliation | ✅ | ⚠️ Delvis | — |

---

## Kända luckor (saknas för L5)

- ❌ Quote/proposal-modul (offert innan deal won)
- ❌ Pris-listor med versioning
- ❌ Recurring billing / subscriptions (delvis i Stripe-integrationen)
- ❌ Multi-currency på fakturanivå
- ❌ Approval workflow för fakturor över X kr
- ⚠️ Reconciliation kräver manuell matchning för osäkra fall

---

## Webhook-events

`deal.won`, `project.created`, `task.completed`, `timesheet.submitted`, `invoice.created`, `invoice.paid`, `invoice.overdue`

---

## Bäst för

Konsultbyråer, agencies, freelancer-team som fakturerar på timme eller fast pris per projekt.

## Inte för

Renodlad SaaS med MRR-fokus (använd Stripe-subscriptions direkt), eller tillverkningsbolag med komplex projektkalkyl.
