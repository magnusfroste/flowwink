---
name: FlowWink as Business OS — Three Shells, One Kernel
description: Mental model — FlowWink är ett Business OS. Platform = kernel. Admin UI / FlowChat / MCP = tre shells över samma skills och data. Stärker BOS-positionen.
type: design
---

# FlowWink as Business OS — Three Shells, One Kernel

FlowWink är ett **Business Operating System**. Tänk Linux-analogi:

- **Kernel** = Platform (skills, modules, tables, RLS, event bus, automations, agent_events)
- **Shells** = tre olika sätt att prata med kerneln, alla träffar samma skills:

```
              ┌──────────────────────────────────────────┐
              │  FlowWink Platform (kernel)              │
              │  skills · modules · tables · RLS · bus   │
              └──────────────────────────────────────────┘
                              ▲
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
   ┌────┴─────┐         ┌─────┴──────┐        ┌─────┴──────┐
   │ Admin UI │         │  FlowChat  │        │    MCP     │
   │ (htop)   │         │ (web CLI)  │        │ (stdin/out │
   │          │         │            │        │  for bots) │
   └──────────┘         └────────────┘        └────────────┘
   Klick/formulär       Naturligt språk        JSON tool-calls
   för människor        för människor          för agenter
```

## Shell-mappning

| Klassisk Linux           | FlowWink                                    |
|--------------------------|---------------------------------------------|
| Kommandon (`git commit`) | Skills (`add_lead`, `publish_blog`)         |
| `--help` / man pages     | Skill-metadata (description, Use when, NOT for) + `/admin/developer` |
| Pipes (`grep \| sort`)   | Multi-step reasoning ("hitta X och gör Y")  |
| Tab-completion           | Skill-scoring som väljer rätt skill         |
| Bash-scripts             | Automations (`executor=platform`)           |
| Cron                     | Heartbeats + scheduled automations          |
| SSH-nyckel               | Auth + role permissions                     |
| stdin/stdout             | MCP tool-calls                              |
| `htop` / `k9s`           | Admin UI (visuella skal över samma kommandon) |

## Tre shells, samma kontrakt

- **Admin UI** = klickbart skal för människor som vill se & välja från färdiga formulär.
- **FlowChat** = web-CLI. Naturligt språk → reasoning mappar till skill. Snabbare än att klicka när du vet vad du vill.
- **MCP** = stdin/stdout för agenter (OpenClaw, Claude Desktop, externa claws). Strikt JSON, samma skills.

**FlowPilot är inte ett shell — det är en autonom *operatör* som använder samma shells som en människa skulle.** När hen är ON kör hen FlowChat-grammatiken proaktivt + reasoning ovanpå. När hen är OFF finns dörrarna kvar — bara att ingen står och knackar på dem av sig själv.

## Konsekvenser för utveckling

1. **En sanning, tre dörrar.** Ny skill → automatiskt tillgänglig i alla tre shells. UI byggs först när visualisering tillför mervärde; för agenter och chatt räcker skill-metadatan.
2. **Externa claws är peers, inte gäster.** En marketing-claw via MCP `?groups=marketing` får samma kapacitet som en marknadschef i Admin UI.
3. **Test-strategi följer shells:**
   - UI-test → klick/formulär/UX
   - FlowChat-test → är skill-metadatan tillräckligt bra för att reasoning väljer rätt skill?
   - MCP-test → är skill-schemat strikt nog för en blind extern agent?

   Felklassning: fungerar i FlowChat men inte MCP → schema-bug. Fungerar i MCP men inte FlowChat → metadata-bug.

## Säljpitch

> *"FlowWink är ditt företags Linux. Klicka i UI om du vill, prata med FlowChat om du har bråttom, scripta via MCP om du är agent. Samma kommandon, samma data, tre olika sätt att jobba."*

Detta stärker **Business OS**-positioneringen: FlowWink är inte en SaaS-app med chattbot påklistrad — det är en plattform där människor och agenter delar samma kommandorad.
