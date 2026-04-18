# Business Processes — FlowWink Coverage Map

> **Vad är detta?** En process går oftast tvärs över flera moduler. Den här mappen visar vilka **affärsprocesser** FlowWink stödjer, vilka moduler som ingår, och på vilken **mognadsnivå** de befinner sig.
>
> **Målgrupp (initialt):** Internt — för att hålla koll på vad vi faktiskt kan leverera när vi pratar med kunder. Senare kan utdrag publiceras eller delas som PDF.

---

## Mognadsskala (5 nivåer)

| Nivå | Namn | Betydelse |
|------|------|-----------|
| **L1** | **Stub** | Datamodell finns. Ingen UI, ingen logik. |
| **L2** | **Manual** | Admin kan CRUDa via UI. Ingen automation. |
| **L3** | **Operational** | Happy path fungerar end-to-end. Kunden kan köra processen i produktion. |
| **L4** | **Agent-augmented** | En agent (FlowPilot eller extern) kan exekvera delar av processen autonomt. |
| **L5** | **Production-grade** | Edge cases, godkännanden, audit trail, multi-entity. ERP-mässigt. |

**Tumregel för säljet:**
- L3 = "Ja, vi stödjer det"
- L4 = "Ja, och agenten kan köra delar autonomt"
- L5 = "Ja, även för komplexa fall" (få processer är här idag)

---

## Agent-täckning

För varje process anges **vem som gör vad**:

| Aktör | Beskrivning |
|-------|-------------|
| 👤 **Manuell** | Människa via admin-UI |
| 🤖 **FlowPilot** | Plattformens inbyggda agent |
| 🔗 **Extern agent** | Federerad peer (t.ex. ClawThree, OpenClaw) via A2A/MCP |

---

## Kärnprocesser

| Process | Mognad | Moduler | Doc |
|---------|--------|---------|-----|
| **Lead-to-Customer** | L4 | Forms, Leads, Sales Intelligence, Deals, Companies | [lead-to-customer.md](./lead-to-customer.md) |
| **Quote-to-Cash** | L3 | Deals, Projects, Timesheets, Invoicing, Accounting | [quote-to-cash.md](./quote-to-cash.md) |
| **Procure-to-Pay** | L3 | Purchasing, Inventory, Expenses, Invoicing, Accounting | [procure-to-pay.md](./procure-to-pay.md) |
| **Order-to-Delivery** | L3 | E-commerce, Inventory, SLA, Documents | [order-to-delivery.md](./order-to-delivery.md) |
| **Hire-to-Retire** | L2 | HR, Contracts, Documents, Expenses | [hire-to-retire.md](./hire-to-retire.md) |
| **Content-to-Conversion** | L4 | Pages, Blog, Newsletter, Paid Growth, Analytics | [content-to-conversion.md](./content-to-conversion.md) |
| **Record-to-Report** | L2 | Accounting, Invoicing, Expenses, Analytics | [record-to-report.md](./record-to-report.md) |
| **Support-to-Resolution** | L3 | Tickets, Live Support, Knowledge Base, SLA | [support-to-resolution.md](./support-to-resolution.md) |

---

## Hur vi använder detta i sälj

1. **Discovery:** "Vilka processer kör ni idag?" → matcha mot listan ovan
2. **Coverage:** Visa mognadsnivån ärligt — L3 räcker för de flesta SMB
3. **Gap-analys:** Synliggör vad agenten täcker (L4+) vs. manuell admin (L3)
4. **Roadmap:** Vad som flyttas från L3 → L4 → L5 nästa kvartal

---

*Dokumentationen uppdateras manuellt initialt. När `defineModule()` får `processes` + `maturity`-metadata kan vi auto-generera en `/admin/process-coverage`-sida.*
