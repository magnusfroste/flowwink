
# OpenClaw-Aligned Prompt Architecture for FlowPilot

## Status: ✅ Implementerad

### Vad som gjordes

**Layered Prompt Architecture** — systemprompt-kompilatorn (`buildSystemPrompt`) följer nu OpenClaw-principen med 6 explicita lager:

1. **Layer 1: Mode Identity** — heartbeat/operate (hårdkodat, kort)
2. **Layer 2: SOUL + IDENTITY** — från DB, evolverbar via `soul_update`
3. **Layer 3: AGENTS** — från DB, evolverbar via `agents_update` (fallback: `CORE_INSTRUCTIONS`)
4. **Layer 4: CMS Schema Awareness** — moduler, integrationer, block types
5. **Layer 5: GROUNDING RULES** — ALLTID hårdkodat säkerhetslager (kan ej skrivas över)
6. **Layer 6: Mode-specifik kontext** — objectives, memory, heartbeat protocol

### Nya funktioner

- **`loadWorkspaceFiles()`** — hämtar soul, identity OCH agents i ett DB-anrop
- **`buildWorkspacePrompt()`** — bygger SOUL + IDENTITY + AGENTS prompt
- **`agents_update` tool** — FlowPilot kan uppdatera sina egna operativa regler
- **`handleAgentsUpdate()`** — upsert mot `agent_memory(key='agents')`
- **Bootstrap seeding** — initialt AGENTS-dokument skapas vid första admin-session

### Backward-kompatibilitet

- `loadSoulIdentity()` och `buildSoulPrompt()` finns kvar som deprecated wrappers
- `agent-reason/index.ts` (re-export) opåverkat
- Test-filen (`run-autonomy-tests`) fungerar via deprecated API

### Filer ändrade

- `supabase/functions/_shared/agent-reason.ts` — prompt compiler, workspace loader, agents tool
- `supabase/functions/agent-operate/index.ts` — uppdaterade imports/destructuring
- `supabase/functions/flowpilot-heartbeat/index.ts` — uppdaterade imports/destructuring
- `src/hooks/useFlowPilotBootstrap.ts` — seedar AGENTS-dokument
