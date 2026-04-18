# Procure-to-Pay

> Från behovsidentifiering till betald leverantörsfaktura.

**Mognadsnivå:** L3 — Operational
**Status:** ✅ Happy path fungerar; saknar approval-flöden

---

## Moduler som ingår

| Modul | Roll i processen |
|-------|------------------|
| **Purchasing** | Vendors, purchase orders, goods receipt |
| **Inventory** | Lagernivåer, reorder-trigger |
| **Expenses** | Anställdas utlägg (sidoflöde) |
| **Invoicing** | Inkommande leverantörsfakturor (AP) |
| **Accounting** | Bokning mot leverantörsskuld + kostnadskonto |
| **Documents** | Lagring av PO, följesedel, faktura-PDF |

---

## Steg-för-steg flöde

```
[Lågt lager / Manuellt behov]
       ↓
purchase_reorder_check (auto eller manuell)
       ↓
Purchase Order skapas (Purchasing)
       ↓
PO skickas till vendor (send_purchase_order)
       ↓
Leverans → Goods Receipt (receive_goods)
       ↓
Lager uppdateras (Inventory)
       ↓
Vendor invoice in → matchning mot PO + GR
       ↓
Bokning (Accounting)
       ↓
Betalning
```

---

## Agent-täckning

| Steg | 👤 Manuell | 🤖 FlowPilot | 🔗 Extern agent |
|------|-----------|-------------|-----------------|
| Vendor onboarding | ✅ | ✅ (`manage_vendor`) | — |
| Reorder-detection | — | ✅ (`purchase_reorder_check`) | — |
| PO-skapande | ✅ | ✅ (`create_purchase_order`) | — |
| PO-utskick | ✅ | ✅ (`send_purchase_order`) | — |
| Goods receipt | ✅ | ✅ (`receive_goods`) | — |
| Utläggshantering | ✅ | ✅ (`manage_expenses`, `analyze_receipt`) | — |
| 3-way match | ⚠️ Manuell | ❌ | 🔗 Möjlig delegering |

---

## Kända luckor (saknas för L5)

- ❌ **3-way match approval workflow** (PO ↔ GR ↔ Invoice automatiskt)
- ❌ Multi-step approval baserat på beloppsgränser
- ❌ Vendor portal (vendor loggar in själv)
- ❌ EDI-integration för stora leverantörer
- ❌ Multi-currency vendor invoices

---

## Webhook-events

`purchase_order.created`, `purchase_order.received`, `stock.low`, `stock.adjusted`, `expense.submitted`, `expense.status_changed`

---

## Bäst för

SMB med fysiskt lager eller återkommande inköp. Konsultbyråer för utläggshantering.

## Inte för

Tillverkning med komplex BOM/MRP, eller koncerner med multi-entity intercompany-flöden.
