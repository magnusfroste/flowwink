---
title: FlowPilot vs ClawOne — Access Gap Analysis
summary: What an external OpenClaw agent lacks compared to native FlowPilot
read_when: Planning to give external agents full parity with FlowPilot
---

# FlowPilot vs ClawOne — Access Gap Analysis

> **Fråga:** Om ClawOne (extern OpenClaw-agent) ska ha exakt samma access som FlowPilot — vad saknas?

---

## Grundläggande distinktion: Två lager, två datakällor

```
┌──────────────────────────────────────────────────────┐
│  FLOWWINK (SaaS-plattformen)                         │
│  ─────────────────────────────                       │
│  pages, products, orders, leads, blog_posts,         │
│  bookings, invoices, employees, projects, KB...      │
│  → Affärsdata. Exponeras redan delvis via MCP.       │
├──────────────────────────────────────────────────────┤
│  FLOWPILOT (Agent-lagret)                            │
│  ─────────────────────────                           │
│  agent_memory (soul, identity, learnings),           │
│  agent_objectives, agent_skills, agent_automations,  │
│  agent_workflows, agent_activity                     │
│  → Agentens interna tillstånd. Privat hjärna.        │
└──────────────────────────────────────────────────────┘
```

**"Semantiskt minne"** (`agent_memory` med pgvector) tillhör **FlowPilot** — inte FlowWink. Det är agentens dagbok, inte plattformens affärsdata.

### Vad ClawOne faktiskt behöver

| Datakategori | Ägare | ClawOne behöver? | Motivering |
|--------------|-------|-----------------|------------|
| Sidor, produkter, ordrar, leads | **FlowWink** (SaaS) | ✅ Ja | Affärsoperationer — samma som en anställd |
| Moduler, integrationer, site health | **FlowWink** (SaaS) | ✅ Ja | Situationsmedvetenhet |
| Soul, identity, agents | **FlowPilot** (Agent) | 👁️ Read-only | Förstå vem den samarbetar med |
| Learnings, preferences (`agent_memory`) | **FlowPilot** (Agent) | ❌ Nej | En agents privata minne — kognitiv integritet |
| Objectives, plans | **FlowPilot** (Agent) | ⚠️ Läsa ja, skriva med approval | Koordinering, inte övertagande |
| Skills, automations, workflows | **FlowPilot** (Agent) | ⚠️ Begränsat | Observera ja, skapa med sandbox |

> **Principen:** ClawOne ska ha full access till **FlowWink** (plattformen den opererar på) men begränsad access till **FlowPilot** (den andra agenten som redan bor där).

---

## Nuläge: Vad MCP Server exponerar idag

| Kanal | Exponerat | Antal |
|-------|-----------|-------|
| **MCP Tools** | DB-skills med `mcp_exposed = true` | ~15–25 av ~60+ |
| **MCP Resources** | modules, health, skills, activity, peers, identity, templates | 7 |
| **REST /rest/tools** | Samma som MCP tools | ~15–25 |

## Gap 1: FlowWink-data (Affärsdata) — Kritiskt

### Problem
Inte alla FlowWink-modulers skills är exponerade via MCP. ClawOne kan t.ex. hantera leads men kanske inte bookings eller HR.

### Lösning
Systematiskt granska alla `agent_skills` och sätta `mcp_exposed = true` på alla skills som opererar på FlowWink-affärsdata:

| Modul | Exempel-skills | MCP-exponerad? |
|-------|---------------|----------------|
| CRM | `manage_lead`, `qualify_lead`, `manage_deal` | ✅ Redan |
| E-commerce | `place_order`, `manage_product` | ✅ Redan |
| Content | `manage_page`, `manage_blog` | ✅ Redan |
| Booking | `manage_booking`, `manage_service` | ❓ Kontrollera |
| HR | `manage_employee`, `manage_leave` | ❓ Kontrollera |
| Projects | `manage_project`, `manage_task` | ❓ Kontrollera |
| Accounting | `manage_invoice`, `manage_expense` | ❓ Kontrollera |
| Documents | `manage_document` | ❓ Kontrollera |
| Contracts | `manage_contract` | ❓ Kontrollera |

**Åtgärd:** Audit alla skills → exponera FlowWink-skills → behåll FlowPilot-skills som interna.

### Risk
Låg — detta är affärsdata med befintlig RLS. Samma säkerhetsmodell som för en inloggad admin.

---

## Gap 2: FlowPilot-state (Agent-tillstånd) — Selektivt

### Vad FlowPilot har som ClawOne INTE bör få

| Built-in Tool | Syfte | Exponera? | Motivering |
|---------------|-------|-----------|------------|
| `memory_write` | Skriv till agentens minne | ❌ | Förorenar FlowPilots kontext |
| `memory_read` | Sök i agentens minne | ❌ | Privat kognitiv data |
| `memory_delete` | Radera minnen | ❌ | Destruktivt mot annan agent |
| `soul_update` | Ändra personlighet | ❌ | Identitetssuveränitet |
| `agents_update` | Ändra operativa regler | ❌ | Intern styrning |
| `heartbeat_protocol_update` | Ändra autonom loop | ❌ | Infrastruktur |
| `reflect` | Självutvärdering | ❌ | Intern process |

### Vad som KAN exponeras (med gating)

| Built-in Tool | Syfte | Exponera som | Gating |
|---------------|-------|-------------|--------|
| `propose_objective` | Föreslå nytt mål | MCP tool | `requires_approval: true` |
| `decompose_objective` | Bryta ner mål i steg | MCP tool (read-only variant) | Bara på egna förslag |
| `skill_create` | Skapa ny färdighet | MCP tool | `enabled: false` + `trust_level: untrusted` |
| `automation_create` | Skapa automation | MCP tool | `enabled: false` + rate limit |
| `workflow_execute` | Köra arbetsflöde | MCP tool | Bara befintliga, godkända workflows |
| `delegate_task` | Delegera till specialist | MCP tool | Samma begränsningar som FlowPilot |

---

## Gap 3: Concurrency & Safety — Kritiskt

### Problem
Utan concurrency-lås kan ClawOne och FlowPilot kollidera (t.ex. båda uppdaterar samma lead samtidigt).

### Lösning
Exponera `acquire_operation_lock` som MCP-tool — wrapper kring `try_acquire_agent_lock`:

```
ClawOne → MCP: acquire_lock(lane: "lead_123", ttl: 60)
  → FlowPilot blockeras automatiskt från samma lane
  → ClawOne utför operation
  → MCP: release_lock(lane: "lead_123")
```

**Utan detta = data races. P0-prioritet.**

---

## Gap 4: Observabilitet — Viktigt

### Problem
ClawOne kan inte se vad FlowPilot gör eller planerar.

### Lösning (MCP Resources — redan delvis på plats)

| Resource | Status | Innehåll |
|----------|--------|----------|
| `flowwink://activity` | ✅ Finns | Senaste 20 FlowPilot-åtgärder |
| `flowwink://identity` | ✅ Finns | Soul + identity (read-only) |
| `flowwink://health` | ✅ Finns | Site-statistik |
| `flowwink://objectives` | ❌ Saknas | Aktiva mål + progress |
| `flowwink://heartbeat/status` | ❌ Saknas | Senaste heartbeat, nästa körning |
| `flowwink://automations` | ❌ Saknas | Aktiva automations + senaste triggers |

---

## Reviderad prioriteringsordning

| Prioritet | Gap | Lager | Åtgärd |
|-----------|-----|-------|--------|
| 🔴 P0 | FlowWink-skills audit | FlowWink | `mcp_exposed = true` på alla affärsdata-skills |
| 🔴 P0 | Concurrency locks | Infrastruktur | MCP-tool wrapper kring `try_acquire_agent_lock` |
| 🟡 P1 | Objectives (läsa + föreslå) | FlowPilot | MCP resource + tool med approval |
| 🟡 P1 | Observabilitet (resources) | FlowPilot | 3 nya MCP resources |
| 🟠 P2 | Skill CRUD (sandboxed) | FlowPilot | MCP-tools med trust sandbox |
| 🟠 P2 | Automations/Workflows | FlowPilot | MCP-tools med rate limits |
| 🔒 Aldrig | Memory write/delete | FlowPilot | Privat — kognitiv integritet |
| 🔒 Aldrig | Soul/Identity write | FlowPilot | Privat — identitetssuveränitet |

---

## Den korrigerade filosofin

> **Tidigare (fel):** "Ge ClawOne samma access som FlowPilot har"
> **Nu (rätt):** "Ge ClawOne full access till FlowWink-plattformen + observatörsroll gentemot FlowPilot"

ClawOne och FlowPilot är **två separata agenter** med **delad arbetsplats** (FlowWink). De behöver:

1. **Samma verktyg** för att operera på affärsdata (FlowWink-skills) ✅
2. **Koordineringsmekanismer** för att inte kollidera (locks, objectives) ⚠️
3. **Ömsesidig observabilitet** för att förstå varandras tillstånd (resources) ⚠️
4. **Separata hjärnor** med respekterad kognitiv integritet (memory, soul) 🔒

**Analogin uppdaterad:** Två konsulter på samma företag. Båda har tillgång till alla system (FlowWink). Men de läser inte varandras anteckningar (memory) och de ändrar inte varandras personlighet (soul). De koordinerar via delade mål (objectives) och respekterar varandras arbetsuppgifter (locks).

---

*Se även: [Embedded vs Orchestrated Autonomy](./embedded-vs-orchestrated-autonomy.md) · [Architecture](../pilot/architecture.md)*
