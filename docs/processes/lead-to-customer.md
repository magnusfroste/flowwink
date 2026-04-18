# Lead-to-Customer

> Från första kontakt till vunnet avtal. Hela top-of-funnel + CRM-pipeline.

**Mognadsnivå:** L4 — Agent-augmented
**Status:** ✅ Production-ready för SMB

---

## Moduler som ingår

| Modul | Roll i processen |
|-------|------------------|
| **Forms** | Fångar inbound leads från webbformulär |
| **Leads** | Lead-records, scoring, pipeline-stadier |
| **Companies** | B2B-företagsregister med firmografisk data |
| **Sales Intelligence** | Prospect research, enrichment, fit-analys |
| **Deals** | Sales pipeline med stadier (qualified → won/lost) |
| **Newsletter** | Nurture-sekvenser till leads som inte är säljklara |

---

## Steg-för-steg flöde

```
[Form submit / Manual entry]
       ↓
   Lead skapas (Leads)
       ↓
   Auto-enrichment (Sales Intelligence + Companies)
       ↓
   Lead scoring + qualification
       ↓
   Konvertera till Deal (Deals)
       ↓
   Pipeline progression
       ↓
   Won → handover till Quote-to-Cash
   Lost → tillbaka till Newsletter nurture
```

---

## Agent-täckning

| Steg | 👤 Manuell | 🤖 FlowPilot | 🔗 Extern agent |
|------|-----------|-------------|-----------------|
| Form-fångst | ✅ | ✅ (`process_signal`) | — |
| Enrichment | ✅ | ✅ (`enrich_company`, `prospect_research`) | ✅ via A2A |
| Lead scoring | ✅ | ✅ (`qualify_lead`) | — |
| Pipeline review | ✅ | ✅ (`lead_pipeline_review`) | — |
| Nurture sequencing | ✅ | ✅ (`lead_nurture_sequence`) | — |
| Deal-konvertering | ✅ | ✅ (`manage_deal`) | — |
| Stale deal-detection | — | ✅ (`deal_stale_check`) | — |

---

## Kända luckor (saknas för L5)

- ❌ Multi-touch attribution (vilken kanal stängde dealen?)
- ❌ Forecasting / pipeline-prognos
- ❌ Dubbletthantering vid lead-merge är basic
- ❌ Round-robin lead assignment till säljare

---

## Webhook-events

`form.submitted`, `lead.created`, `lead.score_updated`, `lead.status_changed`, `deal.won`, `deal.lost`

---

## Bäst för

SMB med inbound + lätt outbound. Konsultbolag, B2B-tjänster, agentbyråer.

## Inte för

Enterprise med komplexa godkännandeprocesser, eller renodlad outbound-SDR-organisation som behöver dialer/sequencer-features.
