---
name: Chat routing mode settings key
description: Chat routingMode lives under site_settings key 'chat'; human_first handoff is an internal system note, not an AI reply
type: feature
---
Chat widget routing (ai_first / human_first / ai_only / human_only) lives in `site_settings.value.routingMode` under key **`'chat'`** — NOT `'chat_settings'`. Any edge function that loads chat config from DB must use `eq('key', 'chat')`.

End-to-end contract:
- `src/hooks/useChat.tsx` MUST include `routingMode` in the `settings` payload sent to `chat-completion` (otherwise edge func falls back to DB lookup).
- `supabase/functions/chat-completion/index.ts` gates AI invocation on routingMode (line ~329, ~348). `human_first` + agents online (`support_agents.status in ('online','away')`) → conversation moved to `waiting_agent` + system handoff message, AI skipped.
- `human_first` + no agents online → falls through to AI (graceful degradation).
- The human-first handoff row is `chat_messages.role='system'` / `source='system'` and is an internal routing/audit note. It must not be presented as an AI Assistant answer. Visitor chat should not render it as a normal assistant message; live-support/admin UI may show it as a neutral internal routing note.

Historical bug (2026-06): edge func read wrong key `'chat_settings'`, fallback never matched, AI always answered even when admin had set human_first.
