

# Refactor: Frikoppla MCP & Skills från FlowPilot

## Mål

FlowWink ska fungera som en ren SaaS där **MCP + Skills-katalog är kärnplattform** (alltid på). FlowPilot blir en *valfri* intern agent som konsumerar samma skills som en extern MCP-klient (OpenClaw, ClawWink, Claude Desktop, etc.). Stänger man av FlowPilot ska alla moduler fortsätta exponera sina skills via MCP — bara den interna autonoma loopen (heartbeats, objectives, evolution) försvinner.

## Problemet med dagens arkitektur

| Var | Hur det är idag | Varför fel |
|---|---|---|
| `/admin/skills` (Engine Room) | Blandar Skills-katalog, MCP-toggle, Activity, Health med Objectives, Automations, Workflows, Evolution, Autonomy Schedule | Admin tvingas in i "FlowPilot-land" bara för att titta på vilka skills MCP exponerar |
| `module-bootstrap.ts` rad 82–86 | `if (!flowpilot.enabled) return` — hoppar över skill-seeding | Stänger man av FlowPilot förlorar man också MCP-skills för externa agenter — exakt motsatsen till önskat beteende |
| `mcp-server/index.ts` `SKILL_CATEGORY_MODULES` | `automation: ["flowpilot"]`, `search: ["flowpilot", ...]` | Två hela kategorier kopplade till FlowPilot-modulen |
| Developer-modulen | Har bara MCP-*Keys* | Saknar resten av MCP-ytan (skills-katalog, activity, exposure) |

## Föreslagen ny struktur

```text
/admin/developer            ← MCP & API-plattform (alltid synlig, modul-oberoende)
  ├─ API Explorer
  ├─ Webhooks
  ├─ Dev Tools
  ├─ MCP Keys
  ├─ MCP Skills            (NY — flyttas från Engine Room)
  │   • Tabell: namn, modul, kategori, scope, MCP-exponerad ✓, enabled ✓
  │   • Filter på modul/kategori, sök, bulk-toggle MCP-exposure
  │   • "Vem kan kalla denna?" — visar MCP-keys + collaborators som har access
  └─ MCP Activity          (NY — flyttas från Engine Room "Activity")
      • Read-only logg av alla MCP-anrop (vem, vilken skill, status, latency)

/admin/federation           ← oförändrad: A2A-peers, MCP Collaborators, Agent Invites
  └─ "Available skills"-länk → /admin/developer?tab=mcp-skills

/admin/flowpilot            ← FlowPilot Cockpit (oförändrad)
  └─ Engine Room blir FlowPilot-only och döps om till "FlowPilot Engine"
      • Objectives, Automations, Workflows, Evolution, Autonomy Schedule
      • Self-Healing, System Integrity (FlowPilot-perspektiv)
      • Visar "Skills används från Developer → MCP Skills"-länk
```

## Konkreta ändringar

### 1. Bootstrap-logiken — frikoppla skills från FlowPilot

`src/lib/module-bootstrap.ts`:
- Ta bort `flowpilotEnabled`-gaten på rad 82–86. Skills och MCP-exposure ska **alltid** seedas när en modul aktiveras.
- Behåll FlowPilot-gate **endast** för `automations` (steg 5) — automations är en ren FlowPilot-feature (cron/event-triggers som FlowPilot kör).
- Resultat: aktiverar man `recruitment` får man 6 skills i `agent_skills` med `mcp_exposed=true`, oavsett om FlowPilot är på.

### 2. MCP-server — bryt FlowPilot-beroendet i kategori-mappningen

`supabase/functions/mcp-server/index.ts` `SKILL_CATEGORY_MODULES`:
- `automation: ["flowpilot"]` → `automation: []` (alltid tillgänglig — externa agenter får automation-skills oavsett FlowPilot)
- `search: ["flowpilot", "browserControl"]` → `search: ["browserControl"]` (search beror inte på FlowPilot)
- Lägg till `agent: ["flowpilot"]` som ny kategori för rena FlowPilot-interna skills (objectives, soul, reflect) — dessa exponeras inte via MCP per default.

### 3. Ny sida: MCP Skills-tab i Developer

Skapar **`src/components/admin/developer/McpSkillsPanel.tsx`** som återanvänder befintliga hooks (`useSkills`, `useToggleMcpExposed`, `useBulkToggleSkills`) men med en **modul-orienterad vy**:
- Grupperade per modul (inte per kategori) — admin tänker "vad kan recruitment-modulen göra?", inte "vilka content-skills finns?"
- Kolumner: Skill, Modul, Scope, Handler, **MCP-exponerad** (toggle), Enabled (toggle)
- Search + filter på modul/kategori
- "Test in API Explorer"-knapp per skill (deeplink till befintlig API Explorer)

Lägger till `<TabsTrigger value="mcp-skills">` i `DeveloperPage.tsx`.

### 4. Flytta Activity → Developer

Skapar **`McpActivityPanel.tsx`** som visar `agent_activity` filtrerad på `agent='mcp'` (externa anrop). FlowPilot-aktivitet stannar i Cockpit.

### 5. Engine Room → FlowPilot Engine

Döper om `/admin/skills` till `/admin/flowpilot/engine` (behåller redirect från gamla URL:n):
- Tar bort tabbarna **Skills** och **Activity** (flyttade till Developer)
- Behåller Objectives, Automations, Health, Workflows, Evolution, Autonomy
- Lägger till informationsruta överst: *"Skills och MCP-exponering hanteras i Developer → MCP Skills. FlowPilot konsumerar samma skills som externa agenter."*

### 6. Federation — länka till Developer

`FederationPage.tsx` MCP Collaborators-tab: lägg till länk *"Manage exposed skills →"* som går till `/admin/developer?tab=mcp-skills`.

### 7. Guardrail-test

Uppdatera `src/lib/__tests__/recruitment-module.e2e.test.ts` + lägg till nytt test `mcp-flowpilot-decoupling.test.ts`:
- Verifierar att `bootstrapModule('recruitment', { flowpilot: { enabled: false }, ... })` **fortfarande** seedar 6 skills med `mcp_exposed=true`.
- Verifierar att `automation`-kategorin i mcp-server inte längre kräver flowpilot.

## Filer som ändras

**Edit:**
- `src/lib/module-bootstrap.ts` (ta bort flowpilot-gate på skills, behåll på automations)
- `supabase/functions/mcp-server/index.ts` (omkategorisering)
- `src/pages/admin/DeveloperPage.tsx` (lägg till 2 tabbar)
- `src/pages/admin/SkillHubPage.tsx` (ta bort Skills+Activity-tabbar, lägg till banner)
- `src/App.tsx` (redirect /admin/skills → /admin/flowpilot/engine)
- `src/pages/admin/FederationPage.tsx` (länk till Developer)
- `src/lib/__tests__/recruitment-module.e2e.test.ts` (test med flowpilot off)

**Create:**
- `src/components/admin/developer/McpSkillsPanel.tsx`
- `src/components/admin/developer/McpActivityPanel.tsx`
- `src/lib/__tests__/mcp-flowpilot-decoupling.test.ts`
- `docs/architecture/mcp-as-platform.md` (dokumentera principen + best practice)

**Memory:**
- Spara `mem://architecture/mcp-as-platform-not-flowpilot-feature` med kärnregeln: *MCP/Skills-katalogen är kärnplattform. FlowPilot är en valfri konsument, inte ägare. Bootstrap seedar alltid skills oavsett FlowPilot-status.*

## Resultat — best practice-flödet

| Användarval | Vad händer |
|---|---|
| **Aktiverar `recruitment`-modul** | 6 skills seedas med `mcp_exposed=true`. Synliga direkt i `/admin/developer` → MCP Skills. Externa MCP-klienter ser dem omedelbart. |
| **Stänger av FlowPilot** | Skills finns kvar. MCP fungerar fullt ut. Bara automations/objectives/heartbeat pausas. Admin kan köra hela företaget via OpenClaw/ClawWink/Claude Desktop. |
| **Vill byta intern agent** | Ingen skill-migration behövs. Plugga in valfri MCP-klient mot `mcp-server`-endpointen — alla skills är redan exponerade. |
| **Vill se "vad kan plattformen göra?"** | En enda sida: `/admin/developer` → MCP Skills, grupperad per modul. Inga FlowPilot-koncept i sikte. |

