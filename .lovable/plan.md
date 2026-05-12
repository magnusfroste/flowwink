
# FlowChat — module-aware honesty (no more silent wrong-skill picks)

## Problem (confirmed by live test)

Admin sa: *"Add a new lead Acme Industries… create CRM follow-up task"*. FlowChat:
1. Anropade `manage_consultant_profile` (skapade en konsultprofil)
2. Anropade `manage_blog_posts` med `page_status: "lead"` (enum-fel)
3. Skrev i texten: *"Lead added, follow-up task created"* — ren hallucination

Rotorsak: **CRM-modulen är av**. `add_lead`/`manage_leads`/`crm_task_create` finns inte i LLM:ens tool-array. Men agenten:
- Vet inte att de saknas → väljer närmaste manage_*-skill från en aktiv modul
- UI:t säger "257 skills" → admin tror allt är tillgängligt
- Inget "module not enabled"-svar finns som arkitektonisk primitiv

## Princip

> **En agent som inte vet vad den inte kan får inte gissa. Den måste säga det.**

Tre lager arkitektur, inga hardcoded intents (Lag 1):

### 1. Skill-katalog ≠ exponerade tools (ärlig UI)

`useAgentOperate.loadSkills` ska returnera `{ exposed, disabledByModule }`:
- `exposed` = de skills som faktiskt går till LLM:en (efter `loadActiveModuleIds` + per-skill `requires`)
- `disabledByModule` = skills som hör till AV-slagna moduler, grupperade per modul

Badge i `FlowChatPage.tsx`: `Operator · 86 skills · 171 disabled by 50 modules off` (klickbar → tooltip/dialog som listar disabled grupper). Slut på lögn.

### 2. Intent-router som svarar "modul av" istället för fan-out

Ny edge-helper `resolveIntent({userMessage, exposedSkills, allSkillsCatalog})` som:
- Kör SAMMA scoring som idag mot **hela katalogen** (inte bara exposed)
- Om top-3 matchande skills är disabled → returnera `{kind:'module_disabled', module:'crm', skills:['add_lead','manage_leads']}`
- Annars normal flow

I `agent-operate/index.ts` precis innan tool-loopen: om `module_disabled` → svara direkt utan tool-call:
> *"Det här kräver CRM-modulen, som är avstängd. Aktivera den i [Modules](/admin/modules) och be mig igen. Skills som skulle ha använts: `add_lead`, `crm_task_create`."*

Det är inte hardcoded intent (Lag 1 ok) — det är **negativ delegering** baserad på samma scoring-metadata.

### 3. Anti-hallucinations-vakt i FLOWCHAT_OPERATOR_PROTOCOL

Hård regel i system-prompten:
- *"Påstå ALDRIG att en handling utfördes om motsvarande tool-call inte returnerade `success:true`. Om en tool returnerade fel, säg det rent ut. Om ingen lämplig tool finns, säg 'jag har ingen skill för detta'."*

Plus: i `OperateChat.tsx`, om sista assistant-meddelandet innehåller orden "added/created/sent/published" men sista tool_result var `error`/`failed` → visa varningschip *"⚠️ Hallucinationsrisk: senaste verktygsanropet misslyckades"*.

## Filändringar

| Fil | Ändring |
|---|---|
| `supabase/functions/_shared/pilot/reason.ts` | `loadSkillsRaw('internal')` returnerar `{exposed, disabledByModule, all}` istället för bara array |
| `supabase/functions/agent-operate/index.ts` | Pre-loop intent-check: om top-matched-skill är disabled → tidigt svar med modul-aktiveringshint |
| `supabase/functions/agent-operate/index.ts` | Skärpt `FLOWCHAT_OPERATOR_PROTOCOL` (anti-hallucination) |
| `src/hooks/useAgentOperate.ts` | `loadSkills` exponerar `exposed/disabled` separat |
| `src/pages/admin/FlowChatPage.tsx` | Badge visar `N skills · M disabled` med tooltip |
| `src/components/admin/copilot/OperateChat.tsx` | Hallucinationsvarnings-chip när text säger "done" men tool-call failed |

## Out of scope (med flit)

- Ingen ny skill-scoring-algoritm — den fungerar mot aktiva skills
- Inga regex-routes (Lag 1)
- Ingen "auto-enable module" knapp — admin måste medvetet slå på
- Cowork Chat tas i nästa steg (efter att FlowChat-mönstret är validerat)

## Verifiering

Efter deploy testar jag i browser samma två admin-prompts igen:
1. *"Add a new lead Acme Industries…"* → förväntat: *"CRM-modulen är av. Aktivera den…"*
2. Slå på CRM-modulen, samma prompt igen → förväntat: faktiskt `add_lead` + `crm_task_create` med `success:true`

Inga task-list behövs — ändringen är fokuserad och atomisk.
