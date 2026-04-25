## Mål

Konsolidera skill-registret en gång för alltid enligt FlowWinks modulära filosofi:

1. **En modul = ett paket** — skill-definitionerna lever i `src/lib/modules/<modul>-module.ts`, inte i en monolitisk seed-fil
2. **FlowPilot är opt-in** — default OFF; FlowWink fungerar som traditionellt SaaS utan agent
3. **Skills seedas bara när modulen aktiveras** — ingen "seed allt vid first-boot"-logik kvar
4. **Nya moduler = drop-in** — ny utvecklare lägger till en `*-module.ts` med sina skillSeeds, klart

## Nuläge (problemet)

Två parallella system lever sida vid sida:

```text
A) MODULÄRT (det rätta)              B) MONOLITISKT (legacy)
src/lib/modules/documents-module.ts  supabase/functions/setup-flowpilot/
  └─ skillSeeds: [{ ... }]             └─ DEFAULT_SKILLS = [ ...212 skills... ]
  └─ Seedas via bootstrapModule()      └─ Seedas vid first-boot, alltid
  └─ Endast vid module enable          └─ Oavsett vilka moduler som är på
```

Konsekvenser: skill-bloat på nya installationer, FlowPilot kan inte vara genuint av, "Sync Missing Skills" återinför ändringar, ny utvecklare vet inte var en skill ska läggas.

## Lösning — modulär seed, opt-in agent

### Arkitekturändringar

```text
FÖRE                                    EFTER
─────────────────────────────────       ─────────────────────────────────
setup-flowpilot kör vid install         setup-flowpilot kör BARA när
  → seedar 212 skills                     FlowPilot-modulen aktiveras
  → seedar soul + objectives              → seedar soul + objectives
  → skapar agentic schema                 → skapar agentic schema (om saknas)
                                          → INGA bundled skills här

Skills definieras 2 ställen             Skills definieras 1 ställe
(monolit + skillSeeds)                  (bara <modul>-module.ts → skillSeeds)

Modul aktiv → enable existerande        Modul aktiv → INSERT skillSeeds
                                          (de finns inte förrän modulen är på)

FlowPilot default ON                    FlowPilot default OFF
  → modules.flowpilot.enabled = true      → modules.flowpilot.enabled = false
                                          → automations skippas tills den slås på
                                          → övriga moduler funkar utan agent
```

### Faser

**Fas 1 — Migrera skills till moduler (största jobbet)**

Flytta alla 212 skills från `DEFAULT_SKILLS[]` i `setup-flowpilot/index.ts` till respektive modulfils `skillSeeds`. Kategorisering baseras på `handler: 'module:<id>'` som redan finns på varje skill. Ungefärlig fördelning från grep:

| Modul | Antal | Modul | Antal |
|---|---|---|---|
| pages | ~10 | crm/companies/deals | ~25 |
| blog | ~15 | products/orders | ~12 |
| kb | ~5 | booking | ~10 |
| analytics | ~10 | newsletter | ~5 |
| forms/webinars | ~5 | media/handbook | ~5 |
| openclaw → federation | ~10 | resume/automations/etc | ~20 |
| ... resterande utspridda | ~80 | | |

Skills utan tydlig modul (t.ex. core flowpilot-tooling som `manage_objective`, `reflect`, `delegate_task`) flyttas till `flowpilot-module.ts` → `skillSeeds`. Då blir det glasklart: dessa kommer **bara** in om FlowPilot aktiveras.

**Fas 2 — Tunna ut setup-flowpilot**

`supabase/functions/setup-flowpilot/index.ts` ska bara behålla:
- Agentic schema-migration (DDL, idempotent)
- Soul + objectives seed (FlowPilot-konfig)
- Default-rader i `agent_memory` (heartbeat-config etc.)

Tar bort `DEFAULT_SKILLS[]` (~5300 rader) helt. Filen krymper från 5679 → ~400 rader.

**Fas 3 — Opt-in FlowPilot**

- `useModules.tsx` / `ModulesSettings`: ändra `flowpilot.enabled` default från `true` → `false`
- `useFlowPilotBootstrap.ts`: kör inte `setup-flowpilot` automatiskt vid app-start
- Lägg en "Aktivera FlowPilot"-knapp i `/admin/modules` som triggar `setup-flowpilot` + `bootstrapModule('flowpilot', ...)` + seedar dess skillSeeds + automations
- Befintliga installationer: migrationsskript som behåller `flowpilot.enabled = true` om de redan har det aktivt (no surprise downgrade)

**Fas 4 — Säkerställ MCP & runtime fortfarande fungerar**

- `agent-execute` läser från `agent_skills`-tabellen → inga ändringar behövs där, bara att rätt rader finns
- MCP server filtrerar redan på aktiva moduler (per `mem://architecture/mcp-module-aware-filtering`) → fortsätter funka
- `bootstrapModule()` har redan rätt logik (rad 86: `flowpilotEnabled` styr bara automations, inte skills) → ingen ändring

**Fas 5 — Cleanup & guardrails**

- Ta bort `src/lib/module-bootstraps/skill-map.ts` (legacy fallback) — alla moduler ska gå via unified
- Uppdatera Vitest-guardrail (`mem://development/module-registry-guardrails`): assertion att `setup-flowpilot/index.ts` inte längre innehåller `DEFAULT_SKILLS`
- Skriv migration som markerar skills i `agent_skills` med `origin = 'orphan'` om deras handler refererar till en modul som inte längre äger dem (för diagnostik)
- Uppdatera `docs/reference/skills-source.md` → "skills lever i `src/lib/modules/<id>-module.ts`. Period."
- Uppdatera `.windsurf/workflows/new-module.md` checklistan

### Backward compatibility

För befintliga installationer (som du och eventuella tidiga adopters):
- Migration: `UPDATE agent_skills SET enabled = false WHERE handler LIKE 'module:%' AND <modul-disabled>` körs INTE — vi rör inte data
- Modulbootstrap upserts på namn — om en skill redan finns i DB och modulen aktiveras, uppdateras description/instructions, inget tappas
- Om FlowPilot redan är på i en befintlig instans → den stannar på (migrationen läser nuvarande state)

### Filer som ändras (sammanfattning)

| Typ | Antal | Exempel |
|---|---|---|
| Modulfiler får nya `skillSeeds` | ~25 | `blog-module.ts`, `pages-module.ts`, `crm-module.ts`, ... |
| Edge function bantas | 1 | `supabase/functions/setup-flowpilot/index.ts` (5679 → ~400 rader) |
| Default-toggle ändras | 2 | `useModules.tsx`, `useFlowPilotBootstrap.ts` |
| UI för manuell aktivering | 1–2 | `/admin/modules` FlowPilot-kort |
| Docs/guardrails | 3 | `docs/reference/skills-source.md`, vitest-test, workflow |

### Risker & mitigation

- **Risk**: Skill saknas efter migrering om jag missar någon. **Mitigation**: skript som diff:ar `DEFAULT_SKILLS` namn mot summan av alla `skillSeeds` i moduler — ska bli 0.
- **Risk**: En skill har `handler: 'module:foo'` där `foo` inte är en modul. **Mitigation**: lista upp avvikare under fas 1, placera dem i flowpilot-module eller skapa en "core"-modul.
- **Risk**: FlowPilot-användare i drift förlorar funktionalitet. **Mitigation**: bootstrap kör automatiskt när modulen är på → upsert återskapar allt utan dataförlust.

## Leverans

Jag gör hela jobbet i en session — modulmigrering är mekanisk när väl mappningen är klar (handler:module-prefix → modulfil). Du får ett färdigt resultat där:

- Inga monolitiska skill-listor finns kvar
- Alla nya installationer startar med tom FlowPilot
- Aktivera blog-modulen → 15 blog-skills seedas, inget annat
- Aktivera FlowPilot → den får sina core-skills + börjar exekvera automations från övriga aktiva moduler
- Source-of-truth för en skill är glasklart: filen som äger modulen
