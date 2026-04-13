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

## The Moat Paradox — Öppenhet som konkurrensfördel

### Frågan alla SaaS-leverantörer ställer sig

> "Om vi exponerar alla våra operationer via MCP — förlorar vi vår moat?"

### Vad marknaden visar (Q1 2026)

De stora gör det redan:

| Leverantör | MCP-strategi | Intern agent |
|-----------|-------------|-------------|
| **Salesforce** | Agentforce MCP Beta (jan 2026) — alla CRM-operationer exponerade | Agentforce/Einstein behåller djupet |
| **Microsoft** | Foundry + Dynamics via MCP | Copilot som intern orkestrator |
| **SAP** | ERP-operationer via MCP | Joule som intern agent |
| **FlowWink** | 126 skills, 42% exponerade (mål: ~90%) | FlowPilot som intern operatör |

MCP SDK har **97 miljoner** månatliga nedladdningar (feb 2026). Det är inte en trend — det är infrastruktur.

### Vad som commoditiseras vs vad som förblir moat

```
┌─────────────────────────────────────────────────────┐
│  COMMODITISERAS (MCP öppnar detta)                  │
│  ──────────────────────────────────                 │
│  • CRUD-operationer (skapa lead, uppdatera order)   │
│  • Data-läsning (rapporter, dashboards)             │
│  • Enkel automation (mail vid event)                │
│  • Standardintegrationer mellan system              │
├─────────────────────────────────────────────────────┤
│  FÖRBLIR MOAT (MCP exponerar inte detta)            │
│  ──────────────────────────────────                 │
│  • Djup domänlogik (CPQ-prissättning, lead-scoring, │
│    produktionsplanering, compliance-regler)          │
│  • Data gravity (10 år av CRM-historik)             │
│  • Proaktivitet (heartbeats, autonoma loopar)       │
│  • Kontextuellt minne (soul, objectives, learnings) │
│  • Branschspecifik compliance & audit               │
└─────────────────────────────────────────────────────┘
```

### Paradoxen: Ju mer du öppnar, desto mer lock-in skapar du

**Stripe-effekten:** Stripe blev det mest inlåsande betalningssystemet genom att vara det *enklaste* API:t att integrera mot — inte genom att vara stängt.

Samma mönster gäller MCP:

1. ClawOne integrerar mot FlowWinks `qualify_lead` + `place_order` + `manage_invoice`
2. ClawOnes workflows blir **beroende av FlowWinks domänlogik**
3. Att byta ut FlowWink kräver att alla workflows skrivs om
4. **Lock-in genom adoption, inte genom stängsel**

```
Stängt SaaS:   "Du kan inte gå för vi håller ditt data"     → Frustration
Öppet SaaS:    "Du vill inte gå för allt fungerar så bra"   → Lojalitet
```

### Tre moat-lager i Agent-eran

| Lager | Vad det skyddar | Exempel |
|-------|----------------|---------|
| **1. Plattforms-API (MCP)** | Adoption + integration gravity | FlowWink skills exponerade = fler konsumenter = mer lock-in |
| **2. Domänlogik** | Affärsregler som inte syns i API:t | `qualify_lead` returnerar en score — men scoringmodellen är intern |
| **3. Intern agent** | Proaktivitet + kontext + minne | FlowPilot agerar utan trigger, med 4 nivåer av minne och soul |

### Varför FlowWinks position är unik

```
Salesforce → Öppen via MCP → Agentforce behåller djupet → Proprietärt + dyrt
SAP        → Öppen via MCP → Joule behåller djupet     → Proprietärt + dyrt
FlowWink   → Öppen via MCP → FlowPilot behåller djupet → Open source + self-hosted
```

FlowWinks moat är *inte* vendor lock-in (det är open source). Moaten är:

1. **Community + modulekosystem** — fler moduler = mer värde = svårare att lämna
2. **Operatörens kontext** — FlowPilots soul, memory och objectives är unika per installation
3. **Federationsstandard** — A2A + MCP gör FlowWink till en nod i ett agentnätverk
4. **Self-hosted suveränitet** — ditt data, din agent, dina regler

### Vad det betyder strategiskt

> **Stäng inte dörren. Bygg en bättre tröskel.**

Varje skill som exponeras via MCP är en integrationspunkt som gör FlowWink svårare att ersätta. Varje extern agent som lär sig operera via FlowWinks API är en konsument som förstärker plattformens position.

Att *inte* exponera skills via MCP är att välja Oracles strategi från 2005: stäng in allt och hoppas att ingen hittar ett alternativ. Att exponera allt är att välja Stripes strategi: gör det så enkelt att ingen *vill* hitta ett alternativ.

---

*Se även: [Access Gap Analysis](./flowpilot-vs-clawone-access-gap.md) · [Embedded vs Orchestrated](./embedded-vs-orchestrated-autonomy.md)*
