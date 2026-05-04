---
name: ai-task-hub
description: Consolidated edge function `ai-task` that replaces thin AI-wrapper edge functions. New AI workflows are added as a TaskSpec, not a new function.
type: feature
---

# AI Task Hub

**Sprint 4 consolidation.** Reduces edge-function sprawl. The codebase had
~30 edge functions that were 50–150 lines of identical boilerplate around a
single LLM call (CORS → resolveAiConfig → fetch → tool_call parse).

## Files
- `supabase/functions/ai-task/index.ts` — router (CORS, auth, AI provider
  resolution, OpenAI/Anthropic adapter, error mapping for 429/402).
- `supabase/functions/ai-task/tasks.ts` — registry of `TaskSpec` entries.

## Contract

```
POST /functions/v1/ai-task
{ "task": "score_candidate", "input": { ... } }
→ { success, task, result, provider_used, provider_fallback }

GET  /functions/v1/ai-task     → { tasks: [{ name, description, tier }] }
```

A `TaskSpec` declares: `name`, `tier` (fast|reasoning|multimodal),
`inputSchema` (zod), `system(input)`, `user(input)`, optional `tool`
(structured output via tool-call), optional `options` (temperature,
max_tokens), optional `parse(raw)`.

## Initial migrations
- `score_candidate` (replaces `score-candidate` edge func)
- `analyze_receipt` (replaces `analyze-receipt` edge func — multimodal, vision fallback)
- `qualify_lead_summary` (the AI summary slice of `qualify-lead`; the deterministic scoring stays in the legacy func)

Legacy edge functions are kept until callers migrate, then deleted.

## Rules (Law 1: no hidden routing)
- The CALLER picks the task name explicitly. No LLM dispatch, no regex
  intent detection inside the hub.
- Pure non-AI workflows do NOT belong here (e.g. `analyze-brand` is just a
  Firecrawl scrape — keep it as a small dedicated edge func, OR call
  Firecrawl from the client).
- Streaming chat keeps using `chat-completion` (different transport).

## When to add a new task vs a new edge function
| Need | Where |
|---|---|
| LLM call with prompt + structured output | `tasks.ts` |
| Streaming response to UI | new edge func (or extend chat-completion) |
| Custom OAuth callback / webhook receiver | new edge func |
| Email send | `email-send` (already centralized) |
| Generic table CRUD | `agent-execute` |
