---
name: FlowChat — internal operator chat surface
description: /admin/flowchat is the platform-layer internal chat (admin sidebar + sessions panel + OperateChat engine). Lives independently of the FlowPilot module flag — Tesla model: chat works even when Autopilot is off. Autonomous skill executions and signal ingest no longer write to chat_messages.
type: feature
---

## Three chat surfaces

| Route | Scope | Layout | Engine |
|---|---|---|---|
| `/chat` | visitor | PublicNavigation + sessions | chat-completion (visitor skills) |
| `/admin/flowchat` | internal operator | AdminLayout + sessions | useAgentOperate / OperateChat (internal skills, /commands, ReAct) |
| `/admin/cowork` | workspace RAG | AdminLayout | workspace-chat (read-only, citations) |
| `/admin/flowpilot` | autopilot cockpit | AdminLayout edge-to-edge | when FlowPilot module enabled |

## Tesla analogy

- **Platform** = the car (always on)
- **FlowChat** = built-in chat with the car — works regardless of Autopilot
- **FlowPilot** = Autopilot (heartbeat, briefings, autonomous loop) — opt-in module

FlowChat is NOT gated by `requiresFlowPilot`. It uses the same `useAgentOperate`
hook the FlowPilot cockpit uses, but the page itself is platform.

## Noise separation (chat is dialogue, not exec log)

Two chat_messages.insert call sites were removed because they polluted
`Session — May X` conversations with hundreds of autonomous log rows:

1. `supabase/functions/agent-execute/index.ts` — `trustLevel === 'notify'`
   used to inject `✅ Executed X autonomously` into the latest active admin
   conversation. Removed. Activity is already in `agent_activities` and
   `/admin/activities`.
2. `supabase/functions/signal-ingest/index.ts` — high/critical signals used
   to inject `🚨 Signal: X` into the latest active admin conversation.
   Removed. Signals are visible in activities + dispatcher still routes to
   automations.

Morning briefing (`flowpilot-briefing/index.ts`) is INTENTIONALLY kept —
it's an invitation to dialogue, not a log line.

## Sessions sidebar filter

`useAgentOperate.loadConversations` now uses an inner-join on
`chat_messages` with `role='user'` so only conversations containing real
user messages appear in the sidebar. Stale auto-created `Session — *`
buckets that contain only briefings or old autonomous logs disappear from
the list without being deleted.

## Files

- `src/pages/admin/FlowChatPage.tsx` (new)
- `src/components/admin/AdminLayout.tsx` — `isCopilotMode` extended to `/admin/flowchat`
- `src/components/admin/adminNavigation.ts` — added FlowChat to Main group, no moduleId
- `src/App.tsx` — route `/admin/flowchat`
- `src/hooks/useAgentOperate.ts` — `loadConversations` filtered + deduped
