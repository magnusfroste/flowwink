---
name: FlowChat vs FlowPilot Roles
description: Vägledande princip — FlowChat är platform "hand" (reaktiv), FlowPilot är operator "hjärna" (proaktiv). Båda kallar samma skills via MCP, men har strikt olika roller.
type: constraint
---

# FlowChat vs FlowPilot — non-overlapping roles

FlowChat (platform-feature) och FlowPilot (operator-modul) får ALDRIG glida in i varandras roller. De är komplementära, inte konkurrenter.

## Rollmatris

|                  | FlowChat (platform)              | FlowPilot (operator)                              |
|------------------|----------------------------------|---------------------------------------------------|
| Roll             | Hand — gör vad du säger nu       | Hjärna — gör saker själv när det behövs           |
| Trigger          | Användarens chatmeddelande       | Heartbeat, events, objectives, scheduler          |
| Tidshorisont     | Sekunder (en konversation)       | Timmar/dagar (loop med reflektion)                |
| Minne            | Konversationen                   | Soul, objectives, agent_memory, reflections       |
| Initiativ        | Reaktiv — väntar på prompt       | Proaktiv — Morning Briefing, autonoma actions     |
| Reasoning        | Kort ReAct (read → skill → svar) | Lång loop (observe → reason → act → reflect)      |
| Beslut utan dig  | Aldrig                           | Inom trust-gränser (auto/notify/approve)          |
| Modul-status     | Alltid på (admin-feature)        | Opt-in operator-modul                             |

## Gemensam grund

- Båda anropar samma `agent_skills` via samma MCP-yta.
- Båda använder `chat-completion` som reasoning-endpoint.
- Skillnaden är **vem som tänkte tanken** — inte vad som händer i DB.

## Hårda gränser (måste vaktas)

1. FlowChat får **inte** ha heartbeats, schemalagda jobs eller bakgrundsloopar.
2. FlowChat får **inte** lagra långtidsminne, objectives eller reflections.
3. FlowChat får **inte** agera proaktivt ("jag märkte att…"). Endast på prompt.
4. FlowPilot får **inte** bygga egna content-pipelines — måste kalla skills (Law 3).
5. Skills lever på platform-lagret. Ingen av dem äger skills exklusivt.

## Värdet FlowPilot adderar (oförändrat)

- Soul & objectives → driver beslut utan prompt
- Heartbeat → körs när ingen tittar
- Reflection & memory → lär över tid
- Trust gating → vet vad den får göra själv
- Cross-skill orchestration över tid (kedjor som spänner timmar)
- Proaktiv UX (Morning Briefing, HIL-cards, peer-delegering)

## Konkret exempel

Samma KB-artikel om en ny lag:

- **FlowChat:** "Användaren bad mig skriva → här är artikeln, klart."
- **FlowPilot:** "Lead-flödet visar GDPR-frågor + ny lag trädde i kraft → utkast till KB + blogg + LinkedIn-post som approval."

Samma `manage_kb_article`-skill. Olika hjärna bakom.
