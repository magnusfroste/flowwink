# Hire-to-Retire

> Hela medarbetarlivscykeln — från anställning till offboarding.

**Mognadsnivå:** L2 — Manual (med agent-stöd för checklists)
**Status:** ⚠️ Grundläggande HR-funktioner; saknar payroll och performance management

---

## Moduler som ingår

| Modul | Roll i processen |
|-------|------------------|
| **HR** | Employee-records, leave-hantering, onboarding-checklists |
| **Contracts** | Anställningsavtal, livscykel |
| **Documents** | HR-dokument (avtal, intyg, policies) |
| **Expenses** | Utläggshantering för anställda |
| **Resume** | Konsultprofiler / talent-matching |

---

## Steg-för-steg flöde

```
Kandidat → Hire decision
       ↓
Employee skapas (HR)
       ↓
Anställningsavtal genereras (Contracts) → signering
       ↓
Onboarding checklist startas (HR)
       ↓
Dokument arkiveras (Documents — relaterade till employee_id)
       ↓
[Pågående] Leave-requests, expense-claims
       ↓
[Pågående] Contract renewals (årsvis)
       ↓
Offboarding → kontrakt avslutas, åtkomst stängs
```

---

## Agent-täckning

| Steg | 👤 Manuell | 🤖 FlowPilot | 🔗 Extern agent |
|------|-----------|-------------|-----------------|
| Employee-registrering | ✅ | ✅ (`manage_employee`) | — |
| Avtalshantering | ✅ | ✅ (`manage_contract`) | — |
| Onboarding-checklist | ✅ | ✅ (`onboarding_checklist`) | — |
| Leave-requests | ✅ | ✅ (`manage_leave`) | — |
| Contract renewal-check | — | ✅ (`contract_renewal_check`) | — |
| Performance reviews | ❌ Saknas | — | — |
| Payroll | ❌ Saknas | — | — |

---

## Kända luckor (saknas för L3+)

- ❌ **Payroll-integration** (Fortnox Lön, Visma, Hogia)
- ❌ Performance management / PDP / 1:1-anteckningar
- ❌ Compensation planning
- ❌ Time-off accrual rules (semesterdagar enligt kollektivavtal)
- ❌ Org chart / reporting structure
- ❌ Anställningsavtal-mallar med svenska kollektivavtal

---

## Webhook-events

`employee.created`, `leave.requested`, `leave.status_changed`, `contract.created`, `contract.signed`, `contract.status_changed`, `expense.submitted`

---

## Bäst för

Mindre konsultbolag (< 30 anställda) som vill ha enkel HR-data + dokumentarkiv på ett ställe.

## Inte för

Bolag som behöver fullt HR-system med lön, performance management, eller kollektivavtalslogik. Komplettera med Fortnox/Visma för payroll.
