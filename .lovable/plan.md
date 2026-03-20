

# Plan: OpenClaw-Aligned Prompt Architecture for FlowPilot

## Problem

FlowPilot hallucinerar data (objectives, skills, etc.) eftersom:
1. `CORE_INSTRUCTIONS` är en hårdkodad konstant — inte redigerbar utan koddeploy
2. Grounding-regler ("använd bara verktyg, hitta inte på data") är tillagda som efterhandskonstruktioner snarare än en arkitektonisk grundpelare
3. Det saknas en explicit `AGENTS.md`-motsvarighet — OpenClaw separerar **vem agenten är** (SOUL.md) från **hur agenten opererar** (AGENTS.md)

## Lösning: Databasdriven AGENTS-konfiguration

Införa en `agent_memory(key='agents')` post som fungerar som den redigerbara `AGENTS.md`. Systemprompt-kompilatorn läser denna och använder den som operativa regler, med hårdkodade `CORE_INSTRUCTIONS` som fallback.

### Steg 1: Skapa AGENTS-dokument i agent_memory

Lägg till en ny `agents`-nyckel i `agent_memory` vid bootstrap (samma mönster som `soul` och `identity`). Innehåller:
- **Operativa regler** (verktygsanvändning, grounding, data integrity)
- **Beteendepolicyer** (direct action priority, self-improvement guidelines)
- **Minnesriktlinjer** (memory guidelines, browser/URL-regler)

### Steg 2: Uppdatera `loadSoulIdentity` → `loadWorkspaceFiles`

Utöka funktionen att även hämta `agents`-nyckeln:
```
.in('key', ['soul', 'identity', 'agents'])
```
Returnera `{ soul, identity, agents }`.

### Steg 3: Refaktorisera `buildSystemPrompt`

Ändra prompt-kompileringen:

```text
Layer 1: Mode-identitet (heartbeat/operate — hårdkodat, kort)
Layer 2: SOUL + IDENTITY (från DB, evolverbar)
Layer 3: AGENTS (från DB, evolverbar — operativa regler)
         └── Fallback: hårdkodad CORE_INSTRUCTIONS om agents saknas
Layer 4: CMS Schema Awareness
Layer 5: GROUNDING RULES (ALLTID hårdkodat — säkerhetslager)
Layer 6: Mode-specifik kontext (objectives, memory, heartbeat protocol)
```

**Kritiskt**: Grounding-regler (data integrity, "aldrig fabricera") förblir hårdkodade och injiceras EFTER agents-kontexten — de kan aldrig skrivas över av agenten.

### Steg 4: Lägg till `agents_update` built-in tool

Nytt verktyg som låter FlowPilot uppdatera sina egna operativa regler (AGENTS-dokumentet), liknande `soul_update`. Fält som kan uppdateras:
- `rules`, `policies`, `guidelines`, `workflows_conventions`

### Steg 5: Bootstrap AGENTS-dokumentet

I FlowPilot bootstrap-hooken, skapa det initiala AGENTS-dokumentet med nuvarande `CORE_INSTRUCTIONS`-innehållet strukturerat som:
```json
{
  "version": "1.0",
  "direct_action_rules": "...",
  "self_improvement": "...",
  "memory_guidelines": "...",
  "browser_rules": "...",
  "workflow_conventions": "...",
  "a2a_conventions": "...",
  "skill_pack_rules": "..."
}
```

### Steg 6: Uppdatera agent-operate.ts

Anpassa destructuring från `loadWorkspaceFiles` istället för `loadSoulIdentity`.

## Tekniska detaljer

- **Fil**: `supabase/functions/_shared/agent-reason.ts`
  - `loadSoulIdentity` → `loadWorkspaceFiles` (hämtar soul, identity, agents)
  - `buildSoulPrompt` → `buildWorkspacePrompt` (bygger SOUL + IDENTITY + AGENTS)
  - `buildSystemPrompt` — ny lagerordning med grounding som separat, oåtkomligt lager
  - Ny funktion `handleAgentsUpdate` + tool-definition `agents_update`
  - `CORE_INSTRUCTIONS` behålls som fallback men delas upp i strukturerade sektioner

- **Fil**: `supabase/functions/agent-operate/index.ts` — uppdatera import/destructuring

- **Fil**: `supabase/functions/flowpilot-heartbeat/index.ts` — uppdatera import/destructuring (om den använder loadSoulIdentity)

- **Ingen databasmigration behövs** — `agent_memory` hanterar redan fritt nyckel-värde

## Resultat

- FlowPilot kan utveckla sina egna operativa regler via `agents_update` (OpenClaw LAW 4)
- Grounding-regler kan aldrig skrivas över av agenten (säkerhet)
- Admin kan redigera AGENTS-dokumentet i Skill Hub utan koddeploy
- Separationen SOUL (vem) vs AGENTS (hur) eliminerar förvirringen som orsakar hallucination

