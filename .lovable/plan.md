

# FlowPilot Autonomy Upgrade — Implementation Plan

## Overview

Implement 5 missing OpenClaw features: CMS Schema Awareness, Persistent Heartbeat State, Goal-Aware Execution, Token Tracking, and Atomic Task Checkout.

---

## 1. Database Migration

Add columns to existing tables:

```sql
-- Atomic Task Checkout: locking on agent_objectives
ALTER TABLE agent_objectives ADD COLUMN locked_by text DEFAULT NULL;
ALTER TABLE agent_objectives ADD COLUMN locked_at timestamptz DEFAULT NULL;

-- Token Tracking: on agent_activity
ALTER TABLE agent_activity ADD COLUMN token_usage jsonb DEFAULT NULL;
```

No new tables needed — heartbeat state uses existing `agent_memory` with key `heartbeat_state`.

---

## 2. `agent-reason.ts` — New Functions

### 2a. `loadCMSSchema(supabase)` (~40 lines)
Queries `site_settings` for enabled modules + integrations, returns a structured prompt section:
- Active modules (blog, newsletter, CRM, ecommerce, booking, resume, kb, webinars, forms, pages, global blocks, media)
- Block types available (hero, text, image, cta, contact, faq, etc.)
- Integration status (Stripe, Resend, Firecrawl, Unsplash — from `site_settings.integrations`)
- Table counts for key modules (pages, blog_posts, leads, products, etc.)

### 2b. `loadHeartbeatState(supabase)` / `saveHeartbeatState(supabase, state)`
- Load from `agent_memory` where `key = 'heartbeat_state'`
- State shape: `{ last_run, objectives_advanced, next_priorities, pending_actions, token_usage, iteration_count }`
- Save after heartbeat completes

### 2c. Token tracking in reasoning loop
- After each AI response, extract `usage.prompt_tokens` + `usage.completion_tokens`
- Accumulate in a `tokenUsage` object
- Add budget check: default 50,000 tokens per heartbeat session
- Return token usage in `ReasonResult`

### 2d. `checkoutObjective(supabase, objectiveId)` / `releaseObjective(supabase, objectiveId)`
- Atomic checkout: `UPDATE agent_objectives SET locked_by='heartbeat', locked_at=now() WHERE id=$1 AND (locked_by IS NULL OR locked_at < now() - interval '30 minutes')`
- Release: `UPDATE agent_objectives SET locked_by=NULL, locked_at=NULL WHERE id=$1`
- `loadObjectives` filters out locked objectives

---

## 3. `PromptCompilerInput` Updates

Add new field:
```typescript
cmsSchemaContext?: string;
heartbeatState?: string;
tokenBudget?: number;
```

`buildSystemPrompt` injects CMS schema after Layer 2 (Soul), and heartbeat state into heartbeat mode context.

---

## 4. `flowpilot-heartbeat/index.ts` Changes

1. Add `loadCMSSchema` and `loadHeartbeatState` to the parallel context load
2. Pass `cmsSchemaContext` and `heartbeatState` to `buildSystemPrompt`
3. After reasoning loop: `saveHeartbeatState` with results
4. Token tracking: accumulate from AI responses, include in activity log
5. Wrap objective work with checkout/release

---

## 5. `agent-execute/index.ts` — Goal-Aware Execution

Accept optional `objective_context` in `ExecuteRequest`:
```typescript
objective_context?: {
  goal: string;
  step: string;
  why: string;
}
```

Log it to `agent_activity.input` so every skill execution carries the "why". Skill handlers can access it for smarter decisions.

Update `handleAdvancePlan` in `agent-reason.ts` to pass objective context when calling `agent-execute`.

---

## Files Changed

| File | Changes |
|---|---|
| DB migration | `locked_by`, `locked_at` on `agent_objectives`; `token_usage` on `agent_activity` |
| `supabase/functions/_shared/agent-reason.ts` | `loadCMSSchema`, heartbeat state load/save, token tracking, atomic checkout, goal-context in `advance_plan`, updated `PromptCompilerInput` + `buildSystemPrompt` |
| `supabase/functions/flowpilot-heartbeat/index.ts` | Integrate all 5 features into the heartbeat loop |
| `supabase/functions/agent-execute/index.ts` | Accept `objective_context`, log it |
| `src/types/agent.ts` | Add `token_usage`, `locked_by`, `locked_at` to TypeScript types |

Estimated: ~250 lines new code across 3 edge functions + 1 migration.

