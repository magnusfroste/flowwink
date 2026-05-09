
# FlowPilot Cockpit — förslag

Mål: `/admin/flowpilot` ska kännas som en **agent-server** (Tesla autopilot / Hermes Operator), inte en chat. Chat finns på `/chat`. Automations ligger på `/admin/automations`. Engine Room slopas — dess innehåll fördelas in i cockpit + Developer + Automations.

## Layout

```text
+---------------------------------------------------------------+
| AdminLayout sidebar  |  FlowPilot cockpit                     |
|                      |                                        |
|  ...moduler...       |  [Status bar] heartbeat • engine • HIL |
|                      |  ────────────────────────────────────  |
|                      |  Tabs: Overview | Objectives |         |
|                      |        Sessions | Memory | Analytics   |
|                      |  ────────────────────────────────────  |
|                      |  <tab content>                         |
+---------------------------------------------------------------+
```

Ingen inbyggd chat-yta. En liten "Open chat" länk till `/chat` finns i status-baren.

## Status-bar (alltid synlig högst upp)

Inspirerat av Hermes "Gateway Status / Active Sessions":

- **Engine** — `Running` / `Idle` / `Disabled` (knapp: Pause / Resume)
- **Heartbeat** — "12s ago", nästa schemalagda i `Xs`, knapp `Run now`
- **Active objectives** — antal aktiva / totalt
- **HIL queue** — antal `pending_approval` (klick → Approvals)
- **Today** — actions, success-rate, tokens, cost
- **Persona** — namn + modell (klick → Memory-tab)

## Tab 1 — Overview (default)

Ren cockpit-vy, inga listor som dubblar Activity:

- **Morning Briefing-kort** (om < 24h gammalt) — annars knapp "Generate briefing"
- **Next 3 priorities** från senaste heartbeat (`HeartbeatState.next_priorities`)
- **Pending HIL-cards** (max 3) — Approve / Reject inline
- **Live activity feed** — senaste 10 raderna från `agent_activity` med **executor-pill** (`flowpilot` / `mcp:peer` / `cron` / `automation` / `chat`). Filter-chips ovanför.
- **Mini-graph** — actions/h senaste 24h

## Tab 2 — Objectives

Ersätter dagens objective-hantering:
- Lista över `agent_objectives` (active / paused / completed / failed)
- Per objective: progress, sista 5 actions, lock-status, success-criteria
- Skapa / pausa / avbryt / forcera heartbeat-iteration

## Tab 3 — Sessions

Direkt motsvarighet till Hermes "Sessions":
- En rad per heartbeat-iteration eller chat-session där FlowPilot agerat
- Replay-vy: prompt → reasoning → tool-calls → result, med token/cost per steg
- Filter på executor + datum

## Tab 4 — Memory & Persona

Samlat ställe för agent-DNA (det Hermes kallar Models / Profiles / Config):
- **Soul** — persona, tone, language (read + edit)
- **Memory** — `agent_memory` browser med kategori-filter (preference / context / fact)
- **Models** — primary + fallback, temperatur, max tokens
- **Trust levels** — översikt över skills med `auto` / `notify` / `approve` (länk till `/admin/developer` för full editing)

## Tab 5 — Analytics

Hermes "Analytics":
- Tokens & cost (dag/vecka/månad)
- Skill success-rate (top 10 + bottom 10)
- Objectives velocity (started vs completed)
- HIL approval-rate och median-tid
- Heartbeat duration p50/p95

## Vad som flyttas/tas bort

| Tidigare | Ny plats |
|---|---|
| Chat-panel i `/admin/flowpilot` | Bort. Använd `/chat`. Liten länk i status-bar. |
| Engine Room sub-route | Bort. Innehåll: heartbeat-kontroller → Status-bar; skill-katalog → `/admin/developer`; automations → `/admin/automations`. |
| ContextPanel (höger side) | Ersätts av Live activity feed i Overview, nu med executor-pill. |
| Objective-create modal | Behålls, flyttas in i Objectives-tab. |

## Vad som ligger kvar utanför cockpit

- **Skills-katalog, MCP-keys, Activity (alla executors)** → `/admin/developer`
- **Automations / Workflows / Events / Health** → `/admin/automations`
- **Chat (visitor + admin skill-execution)** → `/chat`

## Dependency på FlowPilot-modulen

- Modul **AV**: `/admin/flowpilot` visar en upsell-kort + read-only Sessions/Analytics av historik. Status-bar visar `Disabled`. Inga heartbeat-kontroller.
- Modul **PÅ**: full cockpit enligt ovan.

`/chat` och `/admin/automations` påverkas inte av FlowPilot-flaggan (per vår 3-lager-modell).

## Tekniska detaljer

- Ny `FlowPilotStatusBar.tsx` — query mot `agent_activity` (heartbeat) + `agent_objectives` + en ny edge `flowpilot-status` (engine state, next_run).
- Återanvänd `ContextPanel`-query, lägg till executor-pill i row-rendering (samma data, ny kolumn).
- Routing: ta bort `/admin/flowpilot/engine`. Lägg `?tab=` query-param för deep-linkning.
- Inga DB-ändringar krävs i steg 1; allt finns redan (`agent_activity.agent`, `HeartbeatState`, `agent_objectives`, `agent_memory`).

## Leveransordning (om du godkänner planen)

1. Skala bort chat + engine-route från `/admin/flowpilot`, byt till tabs-skelett
2. Bygg Status-bar + Overview-tab (briefing, priorities, HIL, activity m. executor-pill)
3. Flytta över Objectives + Memory/Persona till egna tabs
4. Lägg till Sessions + Analytics
5. Uppdatera `mem://architecture/flowpilot-cockpit-and-engine-room-ui` så Engine Room officiellt är borta

Säg till om något ska bytas/strykas, annars kör jag steg 1–2 först.
