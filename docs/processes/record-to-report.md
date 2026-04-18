# Record-to-Report

> Från transaktion till finansiell rapport. Bokföring + period-end close.

**Mognadsnivå:** L2 — Manual (delar L3 via templates)
**Status:** ⚠️ Grundläggande dubbel bokföring; saknar period-end automation

---

## Moduler som ingår

| Modul | Roll i processen |
|-------|------------------|
| **Accounting** | Kontoplan (BAS 2024), verifikat, mallar |
| **Invoicing** | Källa för AR-bokningar |
| **Expenses** | Källa för AP/utläggsbokningar |
| **Analytics** | Finansiella nyckeltal-rapporter |
| **Documents** | Verifikationsunderlag-arkiv |

---

## Steg-för-steg flöde

```
Affärshändelse (faktura, utlägg, lönekörning)
       ↓
suggest_accounting_template → matchar mot mall
       ↓
Verifikat skapas (manage_journal_entry)
       ↓
Granskning (manuell)
       ↓
Bokföring sparas
       ↓
[Periodvis] Avstämningar
       ↓
[Periodvis] Period-end close
       ↓
accounting_reports (BR, RR, huvudbok)
```

---

## Agent-täckning

| Steg | 👤 Manuell | 🤖 FlowPilot | 🔗 Extern agent |
|------|-----------|-------------|-----------------|
| Kontoplan-setup | ✅ | ✅ (`manage_chart_of_accounts`) | — |
| Mall-hantering | ✅ | ✅ (`manage_accounting_template`) | — |
| Konteringsförslag | — | ✅ (`suggest_accounting_template`) | — |
| Verifikatregistrering | ✅ | ✅ (`manage_journal_entry`) | — |
| Ingående balanser | ✅ | ✅ (`manage_opening_balances`) | — |
| Avstämningar | ✅ | ⚠️ Delvis (autonomous reconciliation) | — |
| Rapporter | ✅ | ✅ (`accounting_reports`) | — |
| Period-end close | ❌ Saknas | — | — |
| Skatterapportering | ❌ Saknas | — | — |

---

## Kända luckor (saknas för L3+)

- ❌ **Period-end close-workflow** (lock period, justeringar, reversering)
- ❌ Skatterapportering (moms, AGI, K10)
- ❌ SIE-export (för revisor)
- ❌ Bankkoppling / automatisk avstämning mot bankkontoutdrag
- ❌ Multi-currency revaluation
- ❌ Cost center / projektbokföring
- ❌ Konsolidering (multi-entity)

---

## Webhook-events

`invoice.created`, `invoice.paid`, `expense.status_changed`

---

## Bäst för

Mindre bolag som vill ha översikt över sin ekonomi internt, kompletterar med extern revisor/redovisningsbyrå för deklaration.

## Inte för

Bolag som vill ersätta Fortnox/Visma helt — vi är inte ett komplett redovisningssystem ännu. Positionera oss som "operativ ekonomi" snarare än "deklaration".
