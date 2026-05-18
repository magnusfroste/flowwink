---
name: FlowChat vs FlowPilot Roles
description: FlowChat = chat-ytan (alltid på, reaktiv, kör chat-completion-loopen). FlowPilot = autonom agent-lager OVANPÅ FlowChat (soul/objectives/heartbeat/reflection/trust). Inte parallella hjärnor — samma loop, FlowPilot driver den utan prompt.
type: constraint
---

# FlowChat vs FlowPilot — layering, inte konkurrens

**FlowPilot är agent-lagret som körs OVANPÅ FlowChat.** Inte en separat hjärna. Samma `chat-completion`-loop, samma skills, samma MCP — skillnaden är vem som triggade turen.

## Tesla-modellen

| Lager | Vad | Status |
|---|---|---|
| Platform | skills, MCP, automations, event bus, DB | Alltid på |
| **FlowChat** | chat-ytan (`/admin/flowchat`, `/chat`), ReAct via `chat-completion` | Alltid på |
| **FlowPilot** | soul, objectives, heartbeat, memory, reflection, trust gating, proaktiv UX | Opt-in modul |

- FlowChat OFF är inte ett tillstånd — chatten är en del av plattformen.
- FlowPilot OFF = FlowChat funkar fullt ut (du kan chatta, skills körs, svar kommer). Du tappar bara autonomin.
- FlowPilot ON = samma chat-loop, men en kollega driver den även när ingen skriver.

## Rollmatris

|                  | FlowChat (alltid på)            | FlowPilot (opt-in, ovanpå)                        |
|------------------|---------------------------------|---------------------------------------------------|
| Initierar tur    | Människa som skriver            | Heartbeat, events, objectives, scheduler          |
| Tidshorisont     | Sekunder (en konversation)      | Timmar/dagar (loop med reflektion)                |
| Minne            | Konversationen                  | Soul, objectives, agent_memory, reflections       |
| Initiativ        | Reaktiv — väntar på prompt      | Proaktiv — Morning Briefing, autonoma actions     |
| Beslut utan dig  | Aldrig                          | Inom trust-gränser (auto/notify/approve)          |

## Hårda gränser (måste vaktas)

1. FlowChat får **inte** ha heartbeats, schemalagda jobs eller bakgrundsloopar. Det är FlowPilots lager.
2. FlowChat får **inte** lagra långtidsminne, objectives eller reflections.
3. FlowChat får **inte** agera proaktivt ("jag märkte att…"). Endast på prompt.
4. FlowPilot får **inte** bygga egen reasoning-pipeline — den driver SAMMA `chat-completion`-loop som FlowChat (Law 3).
5. Skills lever på platform-lagret. Ingen av dem äger skills exklusivt.

## Konkret

Samma KB-artikel om en ny lag:

- **FlowChat:** Användare skriver → `chat-completion` väljer `manage_kb_article` → klart.
- **FlowPilot:** Heartbeat hittar GDPR-frågor i lead-flödet + ny lag → driver SAMMA chat-loop för utkast till KB + blogg + LinkedIn → approval per trust gating.

Samma loop. Samma skill. Olika initiator.

## Implikation för smoke tests

- "Smoke skills" = testar plattformens skill-lager (existens, schema, handler, RLS).
- "FlowChat sanity" = testar reasoning-lagret via `chat-completion` (skill selection + arg-extraction från fria prompts).
- "FlowPilot autonomy" = separat lager ovanpå (heartbeat, objectives, reflection, trust gating).

Se även: `mem://architecture/flowpilot-as-optional-operator-layer`, `mem://features/internal-flowchat-and-noise-separation`, `mem://architecture/platform-modules-operators-layering`.
