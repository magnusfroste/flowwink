---
title: FlowPilot vs ClawOne — Access Gap Analysis
summary: What an external OpenClaw agent lacks compared to native FlowPilot
read_when: Planning to give external agents full parity with FlowPilot
---

# FlowPilot vs ClawOne — Access Gap Analysis

> **Fråga:** Om ClawOne (extern OpenClaw-agent) ska ha exakt samma access som FlowPilot — vad saknas?

---

## Nuläge: Vad MCP Server exponerar idag

| Kanal | Exponerat | Antal |
|-------|-----------|-------|
| **MCP Tools** | DB-skills med `mcp_exposed = true` | ~15–25 av ~60+ |
| **MCP Resources** | modules, health, skills, activity, peers, identity, templates | 7 |
| **REST /rest/tools** | Samma som MCP tools | ~15–25 |

## FlowPilots fulla verktygslåda (37+ built-in tools)

### ❌ Helt otillgängliga via MCP idag

| Kategori | Tools | Vad de gör |
|----------|-------|------------|
| **Memory** | `memory_write`, `memory_read`, `memory_delete` | Läs/skriv/sök i semantiskt minne (pgvector hybrid search) |
| **Objectives** | `objective_update_progress`, `objective_complete`, `objective_delete`, `propose_objective`, `decompose_objective`, `advance_plan` | Skapa, planera och avancera strategiska mål |
| **Self-modification** | `skill_create`, `skill_update`, `skill_delete`, `skill_disable`, `skill_enable`, `skill_instruct`, `skill_read`, `skill_list` | Skapa/ändra egna färdigheter (evolving agent) |
| **Soul evolution** | `soul_update`, `agents_update`, `heartbeat_protocol_update` | Ändra sin egen personlighet, regler och heartbeat-beteende |
| **Reflection** | `reflect` | Självutvärdering + auto-persist av insikter |
| **Automations** | `automation_create`, `automation_list`, `automation_update`, `automation_delete`, `execute_automation` | Skapa/hantera schemalagda automation-regler |
| **Workflows** | `workflow_create`, `workflow_execute`, `workflow_list`, `workflow_update`, `workflow_delete` | DAG-baserade multi-step arbetsflöden |
| **Delegation** | `delegate_task` | A2A-delegation till specialist-agenter (SEO, content, sales) |
| **Skill Packs** | `skill_pack_list`, `skill_pack_install` | Installera förpaketerade färdighetskollektioner |
| **Chaining** | `chain_skills` | Kedja flera skills i sekvens |
| **Outcomes** | `evaluate_outcomes`, `record_outcome` | Utvärdera och registrera resultat av åtgärder |

### ❌ Infrastruktur utan MCP-motsvarighet

| Kapabilitet | FlowPilot | ClawOne via MCP |
|-------------|-----------|-----------------|
| **6-lagers system prompt** | Kompileras från soul + identity + agents + CMS-schema + memories + objectives | ❌ Ingen — ClawOne har sin egen prompt |
| **Heartbeat (proaktivitet)** | 7-stegs autonom loop var 12:e timma | ❌ Kan inte triggas utifrån |
| **Self-healing** | Auto-karantän efter 3 fel, linked automations disabled | ❌ Ingen tillgång |
| **Context pruning** | Automatisk kompaktering vid 60k tokens + fact extraction | ❌ Hanteras internt |
| **Skill budget tiering** | Progressiv tool-komprimering (full → compact → drop) | ❌ Intern optimering |
| **Concurrency locks** | Lane-baserade lås (`try_acquire_agent_lock`) | ❌ Risk för race conditions |
| **Token tracking** | Budgetgränser, pre-budget flush, anti-runaway guards | ❌ ClawOne har egen budget |
| **Integrity checks** | SHA-256 skill hash drift detection, 5-point validation | ❌ Ingen extern access |
| **Trace IDs** | `fp_xxx` genom hela kedjan | ❌ ClawOnes trace-id bryts vid MCP-gränsen |
| **Activity audit** | Alla tool-anrop loggas i `agent_activity` | ⚠️ Bara MCP-anrop loggas, inte ClawOnes interna resonemang |

---

## Gap-kategorier — Vad krävs för paritet?

### Gap 1: Memory (Kritiskt)
**Problem:** ClawOne kan inte läsa eller skriva till FlowWinks semantiska minne.
**Lösning:** Exponera `memory_read`, `memory_write`, `memory_delete` som MCP-tools.
**Risk:** En extern agent som skriver till minnet kan förorena FlowPilots kontext.
**Mitigation:** Separata namespaces (`clawone:*` prefix) eller read-only access med write-approval.

### Gap 2: Objectives & Planning (Kritiskt)
**Problem:** ClawOne kan inte föreslå, planera eller avancera strategiska mål.
**Lösning:** Exponera `propose_objective`, `decompose_objective`, `advance_plan` som MCP-tools.
**Risk:** Extern agent kan skapa motstridiga objectives.
**Mitigation:** `requires_approval: true` på alla objective-mutations från externa agenter.

### Gap 3: Self-Modification (Farligt)
**Problem:** ClawOne kan inte skapa eller ändra skills.
**Lösning:** Exponera `skill_create`, `skill_update` via MCP.
**Risk:** Extern agent som skapar arbiträra skills = potentiell säkerhetslucka.
**Mitigation:** Alla externt skapade skills startar med `enabled: false` + `trust_level: untrusted` + `requires_approval: true`.

### Gap 4: Soul/Identity Evolution (Känsligt)
**Problem:** ClawOne kan inte ändra FlowPilots personlighet eller operativa regler.
**Fråga:** *Bör* en extern agent kunna ändra systemets identitet?
**Rekommendation:** ❌ Exponera INTE. Soul-evolution bör vara exklusivt intern. Exponera istället som read-only MCP-resource.

### Gap 5: Heartbeat & Proaktivitet (Arkitektoniskt)
**Problem:** ClawOne kan inte trigga eller styra FlowPilots heartbeat.
**Lösning A:** Exponera `trigger_heartbeat` som MCP-tool (startar en heartbeat-cykel on-demand).
**Lösning B:** Exponera heartbeat-status som MCP-resource (`flowwink://heartbeat/status`).
**Rekommendation:** B (observera) + begränsad A (trigga med approval).

### Gap 6: Automations & Workflows (Viktigt)
**Problem:** ClawOne kan inte skapa eller köra automations/workflows.
**Lösning:** Exponera CRUD + execute som MCP-tools.
**Risk:** Extern agent skapar en automation som kör varje minut.
**Mitigation:** Rate limits + `enabled: false` default + max frequency cap.

### Gap 7: Concurrency & Safety (Infrastruktur)
**Problem:** Utan lås kan ClawOne och FlowPilot kollidera.
**Lösning:** MCP-tool `acquire_operation_lock` som wrapper kring `try_acquire_agent_lock`.
**Kritiskt:** Utan detta = data races vid parallell operation.

---

## Sammanfattning: Implementeringsordning

| Prioritet | Gap | Åtgärd | Komplexitet |
|-----------|-----|--------|-------------|
| 🔴 P0 | Memory read/write | MCP-tools med namespace isolation | Medel |
| 🔴 P0 | Concurrency locks | MCP-tool wrapper | Låg |
| 🟡 P1 | Objectives & Planning | MCP-tools med approval gating | Medel |
| 🟡 P1 | Automations CRUD | MCP-tools med rate limits | Medel |
| 🟡 P1 | Workflows execute | MCP-tool | Låg |
| 🟠 P2 | Skill CRUD | MCP-tools med trust sandbox | Hög |
| 🟠 P2 | Heartbeat trigger | MCP-tool med approval | Låg |
| ⚪ P3 | Delegation (A2A) | MCP-tool → delegate_task | Medel |
| 🔒 Never | Soul/Identity write | Förblir intern — read-only resource | N/A |

---

## Den filosofiska frågan

> **Ska ClawOne ha samma access = samma autonomi?**

Nej. Samma **access** ≠ samma **autonomi**. FlowPilots autonomi kommer från:

1. **Kontext** — 6-lagers prompt med full CMS-medvetenhet
2. **Proaktivitet** — Heartbeat som agerar utan trigger
3. **Kontinuitet** — Persistent minne som byggs över tid
4. **Identitet** — Soul som definierar beteende och värderingar

ClawOne kan få samma **verktygsaccess** via MCP utan att få samma autonomi. Den använder verktygen med sin *egen* kontext, sitt *eget* resonemang, sin *egen* soul. 

**Analogin:** Att ge någon nycklarna till ditt hus ger dem inte din kunskap om var sakerna ligger.

---

*Se även: [Embedded vs Orchestrated Autonomy](./embedded-vs-orchestrated-autonomy.md) · [Architecture](../pilot/architecture.md)*
