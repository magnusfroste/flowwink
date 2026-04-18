# Content-to-Conversion

> Från idé till publicerad artikel till mätbart resultat. FlowWinks "agent-shines"-process.

**Mognadsnivå:** L4 — Agent-augmented
**Status:** ✅ FlowPilots starkaste autonoma flöde

---

## Moduler som ingår

| Modul | Roll i processen |
|-------|------------------|
| **Pages** | Landningssidor (block-baserade) |
| **Blog** | Artiklar, kategorier, taggar |
| **Knowledge Base** | Self-service support-artiklar |
| **Newsletter** | Distribution till prenumeranter |
| **Paid Growth** | Annonskampanjer för förstärkning |
| **Analytics** | Mätning av trafik, konvertering, SEO |
| **Sales Intelligence** | Konkurrent- och ämnesresearch |

---

## Steg-för-steg flöde (Content Pipeline — 5 steg)

```
1. Research (research_content + competitor_monitor)
       ↓
2. Proposal (generate_content_proposal) → Human approve
       ↓
3. Generate (write_blog_post + landing_page_compose)
       ↓
4. Distribute (send_newsletter + social_post_batch)
       ↓
5. Measure (analyze_analytics + seo_audit_page)
       ↓
   → Loop tillbaka till Research
```

---

## Agent-täckning

| Steg | 👤 Manuell | 🤖 FlowPilot | 🔗 Extern agent |
|------|-----------|-------------|-----------------|
| Konkurrent-research | ✅ | ✅ (`competitor_monitor`, `research_content`) | 🔗 Delegering möjlig |
| Content brief | ✅ | ✅ (`seo_content_brief`) | — |
| Förslag-generering | — | ✅ (`generate_content_proposal`) | 🔗 Audit via peer |
| Artikelskrivning | ✅ | ✅ (`write_blog_post`) | 🔗 Review via peer |
| Landningssida-komposition | ✅ | ✅ (`landing_page_compose`) | — |
| Sociala inlägg | ✅ | ✅ (`social_post_batch`, `generate_social_post`) | — |
| Newsletter-utskick | ✅ | ✅ (`send_newsletter`) | — |
| Annonskreativ | ✅ | ✅ (`ad_creative_generate`) | — |
| Performance-analys | ✅ | ✅ (`analyze_analytics`, `ad_performance_check`) | — |
| KB gap-analys | — | ✅ (`kb_gap_analysis`) | — |

---

## Kända luckor (saknas för L5)

- ❌ A/B-testning av rubriker/CTAs (infrastruktur saknas)
- ❌ Multi-language content management
- ❌ Editorial calendar med deadlines / approvals
- ❌ Influencer / partnership outreach
- ⚠️ Bildgenerering kräver extern AI (Lovable AI / OpenAI)

---

## Webhook-events

`blog.published`, `newsletter.sent`

---

## Bäst för

Inbound marketing-driven SMB. Konsultbyråer, SaaS-startups, B2B-tjänster där content är primär lead-källa.

## Inte för

Brand-tunga D2C-varumärken som behöver Figma-driven design + komplex DAM, eller PR-tunga organisationer.
