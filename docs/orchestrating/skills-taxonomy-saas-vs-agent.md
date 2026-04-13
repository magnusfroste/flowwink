---
title: Skills Taxonomy — SaaS vs Agent
summary: Are FlowWink skills platform capabilities or agent enablers? And what should be MCP-exposed?
read_when: Deciding which skills to expose via MCP, understanding skill architecture
---

# Skills Taxonomy — SaaS vs Agent

> **Fråga:** De skills vi skapat — är det FlowWink SaaS-egenskaper eller skapade vi dem för att FlowPilot skulle bli autonom?

## Svaret: Båda — och det är poängen

Skills i FlowWink har en **dubbel natur**. De är *inte* skapade enbart för FlowPilots autonomi. De representerar **plattformens API-yta**, paketerad som verktyg som *råkar* anropas av en agent.

```
┌─────────────────────────────────────────────────┐
│  Skill = FlowWink API Operation                 │
│  ─────────────────────────────                  │
│  manage_leads    = CRM API                      │
│  place_order     = Commerce API                 │
│  manage_page     = CMS API                      │
│  manage_booking  = Booking API                  │
│  ─────────────────────────────                  │
│  Anropare kan vara:                             │
│    1. FlowPilot (intern agent)                  │
│    2. ClawOne (extern agent via MCP)            │
│    3. UI-admin (via React-komponenter)          │
│    4. Webhook/Automation (via signal-dispatcher) │
│    5. Tredje part (via REST /rest/invoke)        │
└─────────────────────────────────────────────────┘
```

### Den kritiska insikten

**Skills ÄR FlowWinks SaaS-egenskaper.** Det som gör dem "agentiska" är inte skill-koden — det är att FlowPilot har en *reasoning loop* som väljer rätt skill baserat på kontext. Skill-koden själv är deterministisk affärslogik.

Det här är exakt vad OpenClaw-modellen och Odoo-modellen har gemensamt: **moduler exponerar operationer, agenter konsumerar dem.**

---

## Nuläge: 126 aktiva skills — hur fördelade?

| Kategori | Totalt | MCP-exponerade | Procent |
|----------|--------|---------------|---------|
| CRM | 31 | 13 | 42% |
| Content | 28 | 10 | 36% |
| Commerce | 20 | 12 | 60% |
| System | 15 | 6 | 40% |
| Communication | 11 | 2 | 18% |
| Analytics | 8 | 7 | 88% |
| Growth | 5 | 2 | 40% |
| Automation | 5 | 1 | 20% |
| Search | 3 | 0 | 0% |
| **Totalt** | **126** | **53** | **42%** |

### Tre skill-typer vid närmare analys

| Typ | Exempel | Agentberoende? | Bör exponeras via MCP? |
|-----|---------|---------------|----------------------|
| **CRUD/Affärslogik** | `manage_leads`, `place_order`, `manage_page`, `manage_booking` | Nej — ren plattforms-API | ✅ Ja — alla anropare bör ha access |
| **AI-assisterad** | `write_blog_post`, `qualify_lead`, `generate_content_proposal`, `research_content` | Delvis — kräver LLM men inte FlowPilots kontext | ✅ Ja — ClawOne har egen LLM |
| **FlowPilot-intern** | `reflect`, `soul_update`, `heartbeat_protocol_update` | Ja — agentens kognitiva processer | ❌ Nej — privat |

---

## Specifik analys: Skills som INTE exponeras men BÖR

### Content (18 av 28 ej exponerade)

| Skill | Handler | Varför den bör exponeras |
|-------|---------|------------------------|
| `create_page_block` | `module:pages` | Sidbyggande — grundläggande CMS-operation |
| `manage_blog_categories` | `module:blog` | Kategorihantering — standard CMS |
| `manage_newsletters` | `module:newsletter` | Newsletter-hantering — kommunikationskanal |
| `write_blog_post` | `module:blog` | Innehållsskapande — kärn-CMS |
| `migrate_url` | `edge:migrate-page` | Import — plattformsverktyg |
| `research_content` | `db:content_research` | Research — affärsvärde |
| `generate_content_proposal` | `db:content_proposals` | Content planning |

### CRM (18 av 31 ej exponerade)

| Skill | Handler | Varför den bör exponeras |
|-------|---------|------------------------|
| `add_lead` | `module:crm` | Lead capture — grundläggande CRM |
| `book_appointment` | `module:booking` | Bokning — kärnoperation |
| `check_availability` | `module:booking` | Tillgänglighet — read-only |
| `qualify_lead` | `edge:qualify-lead` | Lead scoring — affärskritisk |
| `manage_deal` | redan exponerad | ✅ |
| `lead_pipeline_review` | `module:crm` | Pipeline-vy — analytics |
| `contact_finder` | `edge:contact-finder` | Prospektering |
| `crm_task_create/update` | `db:crm_tasks` | Uppgiftshantering |

### Commerce (8 av 20 ej exponerade)

| Skill | Handler | Varför den bör exponeras |
|-------|---------|------------------------|
| `update_purchase_order` | `db:purchase_orders` | Inköp — affärsprocess |
| `manage_supplier` | `db:suppliers` | Leverantörshantering |
| `manage_stock_operations` | `db:product_stock` | Lager — operativ |

### Communication (9 av 11 ej exponerade)

| Skill | Handler | Varför den bör exponeras |
|-------|---------|------------------------|
| `send_email_template` | `edge:send-email` | E-post — kärnkommunikation |
| `send_transactional_email` | `edge:send-email` | Transaktionell e-post |
| `manage_email_templates` | `module:email` | Mallhantering |

### Search (0 av 3 exponerade)

| Skill | Handler | Varför den bör exponeras |
|-------|---------|------------------------|
| `web_search` | `edge:web-search` | Informationshämtning |
| `browser_fetch` | `edge:browser-fetch` | Webbscraping |

---

## Vad communityn säger — vart vi är på väg

### Trenden: "Tools are APIs, Agents are Consumers"

Från OpenClaw, Anthropic MCP, och Google A2A-ekosystemen ser vi samma mönster:

1. **Salesforce** exponerar *alla* CRM-operationer som MCP-tools (inte bara de som deras Einstein-agent använder)
2. **Shopify** exponerar alla Commerce-operationer via MCP
3. **Linear/Notion/Jira** exponerar alla projekt-operationer

**Principen:** Plattformens API-yta = MCP-yta. Inte "agentens verktyg" utan "plattformens förmågor".

### FlowWinks position

Vi har byggt skills med *rätt arkitektur* (handler-abstraktion, modulkoppling, tool_definition) men behandlat `mcp_exposed` som "vad FlowPilot behöver dela" istället för "vad plattformen erbjuder".

**Paradigmskifte:**

```
Gammalt tänk:  Skills → FlowPilots verktyg → exponera selektivt via MCP
Nytt tänk:     Skills → FlowWinks API-yta → exponera ALLT via MCP
                                           → FlowPilot är bara EN konsument
```

### Vad det betyder praktiskt

| Kategori | Nuvarande MCP% | Mål-MCP% | Undantag |
|----------|----------------|----------|----------|
| CRM | 42% | **~90%** | Interna optimeringar (`cart_recovery_check`) |
| Content | 36% | **~85%** | AI-generering kan begränsas av kostnad |
| Commerce | 60% | **~90%** | Stock-operationer bör ha approval |
| System | 40% | **~70%** | Infrastruktur-skills förblir interna |
| Communication | 18% | **~80%** | E-post bör exponeras med rate limits |
| Analytics | 88% | **~95%** | Redan bra |
| Search | 0% | **~100%** | Inga skäl att dölja sök |

### Skills som ALDRIG bör exponeras

| Skill | Motivering |
|-------|-----------|
| `reflect` | FlowPilots kognitiva process |
| `soul_update` / `agents_update` | Identitetssuveränitet |
| `heartbeat_protocol_update` | Intern infrastruktur |
| `publish_scheduled_content` | Cron-trigger, inte manuellt anrop |
| `cart_recovery_check` | Intern optimering |
| `deal_stale_check` | Intern housekeeping |

---

## Slutsats

> **Skills är FlowWink. Inte FlowPilot.**

FlowPilot är den första *konsumenten* av FlowWinks skills — men inte den enda. Genom att exponera skills via MCP transformeras FlowWink från "SaaS med inbyggd agent" till "SaaS med öppet API som vilken agent som helst kan operera på".

Det är skillnaden mellan:
- **Odoo utan API** → bara interna användare kan operera
- **Odoo med API** → integrationer, automatiseringar, och externa agenter kan alla delta

FlowWink har redan byggt API:t (skills). Nu handlar det om att öppna dörren (`mcp_exposed = true`).

---

*Se även: [Access Gap Analysis](./flowpilot-vs-clawone-access-gap.md) · [Embedded vs Orchestrated](./embedded-vs-orchestrated-autonomy.md)*
