

# OpenClaw Code Review — Analys & Åtgärdsplan

## Sammanfattning av relevanta findings

OpenClaw identifierade 10 problem. Efter verifiering mot kodbasen är **3 genuint kritiska**, **2 delvis korrekta**, och **5 felaktiga eller redan lösta**.

---

## Findings-bedömning

### BEKRÄFTADE (Åtgärda)

| # | Finding | Status | Bedömning |
|---|---------|--------|-----------|
| 2 | Token budget för låg | **Korrekt** | 80k (mature) / 120k (fresh) med 73 skills + context är tight. Bör höjas. |
| 3 | Skill categories för begränsade | **Korrekt** | Heartbeat laddar bara `content, analytics, system, growth`. CRM, communication och search saknas — FlowPilot kan inte autonomt hantera leads, nyhetsbrev eller research. |
| 1 | Skill instructions saknas | **Troligen korrekt** | Kan inte verifiera DB-state härifrån, men bör kontrolleras. Saknade instructions bryter mot LazyLoading-arkitekturen. |

### DELVIS KORREKTA

| # | Finding | Bedömning |
|---|---------|-----------|
| 4 | pgvector ej aktiva | `backfill-embeddings`-funktionen finns redan. Problemet är troligen att den inte körs regelbundet eller att API-nycklar saknas. |
| 8 | Duplicate skills | Redan åtgärdat enligt minne — `web_scrape` togs bort till förmån för `scrape_url`. Bör verifieras. |

### FELAKTIGA

| # | Finding | Varför fel |
|---|---------|-----------|
| 5 | "No outcome tracking" | **FEL.** `evaluate_outcomes` och `record_outcome` är redan steg 1 i heartbeat-protokollet och ingår i `builtInToolGroups` via `reflect`-gruppen. |
| 6 | Skill packs ej installerade | Skill packs är seedade som templates — FlowPilot installerar dem själv vid behov. |
| 10 | A2A bara 1 peer (SoundSpace) | Peeren heter OpenClaw, inte SoundSpace. Och den fungerar redan. |
| 9 | Briefing skickas aldrig | Briefing-email via Resend är redan implementerat med cron. |
| 7 | Workflows ej triggade | Workflows triggas via `execute_automation` i heartbeat. |

---

## Åtgärdsplan (3 steg)

### Steg 1: Höj heartbeat token budget & iterations

**Fil:** `supabase/functions/flowpilot-heartbeat/index.ts` (rad 198-199)

Ändra:
- Fresh: 120k → 180k tokens, 15 → 18 iterations
- Mature: 80k → 120k tokens, 12 → 15 iterations

Motivering: Med fler skill-kategorier (steg 2) behövs mer headroom. 200k är överdrivet — lazy loading + budget-tier degradation hanterar resten.

### Steg 2: Utöka heartbeat skill categories

**Fil:** `supabase/functions/flowpilot-heartbeat/index.ts` (rad 236)

Ändra från:
```
['content', 'analytics', 'system', 'growth']
```
Till:
```
['content', 'analytics', 'system', 'growth', 'crm', 'communication', 'search']
```

Motivering: Utan CRM-skills kan FlowPilot inte kvalificera leads, berika företag, eller skicka nyhetsbrev autonomt. Budget-tier degradation (redan implementerad) skyddar mot token-overflow.

### Steg 3: Schemalägg embedding-backfill

Lägg till en cron-automation eller en check i heartbeat som triggar `backfill-embeddings`-funktionen om det finns `agent_memory`-poster utan embeddings. Alternativt: verifiera att `OPENAI_API_KEY` eller `GEMINI_API_KEY` är satt så att embeddings genereras vid varje `memory_write`.

---

## Vad som INTE behöver ändras

- **Outcome tracking** — redan steg 1 i heartbeat-protokollet
- **Briefing email** — redan implementerat
- **Workflow triggers** — redan via `execute_automation`
- **A2A** — fungerar, OpenClaw bevisar det själv

## Tekniska detaljer

Ändringarna berör 2 rader i `flowpilot-heartbeat/index.ts` plus en potentiell embedding-cron. Inga schema-ändringar, inga nya tabeller, ingen ny edge function behövs.

