---
name: Chat routing mode settings key
description: site_settings row for chat config lives under key 'chat' (not 'chat_settings'); routingMode must be passed end-to-end from useChat to chat-completion
type: feature
---
Chat widget routing (ai_first / human_first / ai_only / human_only) lives in `site_settings.value.routingMode` under key **`'chat'`** — NOT `'chat_settings'`. Any edge function that loads chat config from DB must use `eq('key', 'chat')`.

End-to-end contract:
- `src/hooks/useChat.tsx` MUST include `routingMode` in the `settings` payload sent to `chat-completion` (otherwise edge func falls back to DB lookup).
- `supabase/functions/chat-completion/index.ts` gates AI invocation on routingMode (line ~329, ~348). `human_first` + agents online (`support_agents.status in ('online','away')`) → conversation moved to `waiting_agent` + system handoff message, AI skipped.
- `human_first` + no agents online → falls through to AI (graceful degradation).

Historical bug (2026-06): edge func read wrong key `'chat_settings'`, fallback never matched, AI always answered even when admin had set human_first.
