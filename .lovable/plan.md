
# FlowPilot Autonomy Architecture

## Status: ✅ Refactored (March 2026)

### Modular Architecture

The monolithic `agent-reason.ts` (3000+ lines) has been decomposed into focused submodules while maintaining backward compatibility through re-exports:

```
supabase/functions/_shared/
├── agent-reason.ts      ← Façade: re-exports + core logic (prompt compiler, tools, handlers)
├── types.ts             ← Shared type definitions (PromptMode, ReasonConfig, TokenUsage, etc.)
├── ai-config.ts         ← AI provider resolution (OpenAI, Gemini, Lovable, Local)
├── concurrency.ts       ← Lane-based locking via agent_locks table
├── token-tracking.ts    ← Budget enforcement for autonomous runs
└── trace.ts             ← Correlation IDs (trace_id) for full run observability
```

### Key Architectural Decisions

#### 1. Single Reasoning Loop (DRY)
The heartbeat previously duplicated the entire tool loop from `reason()`. Now:
- `flowpilot-heartbeat` → gathers context → calls `reason()` → logs results
- `agent-operate` → gathers context → runs its own SSE streaming loop (streaming requires different architecture)
- Both share: tool definitions, tool router, skill loading, context pruning

#### 2. Trace IDs (Observability)
Every autonomy run gets a unique `trace_id` (format: `fp_{timestamp}_{random}`):
- Generated at heartbeat start → flows into `reason()` → passed to `executeBuiltInTool()` → forwarded to `agent-execute` calls
- Logged in `agent_activity.input.trace_id` for each heartbeat
- Query: "show me everything that happened in heartbeat run X" → `WHERE input->>'trace_id' = 'fp_xxx'`

#### 3. Backward Compatibility
All existing imports continue to work:
```typescript
// This still works — agent-reason.ts re-exports everything
import { resolveAiConfig, tryAcquireLock, extractTokenUsage } from "../_shared/agent-reason.ts";

// But you can also import directly for clarity
import { tryAcquireLock } from "../_shared/concurrency.ts";
import { generateTraceId } from "../_shared/trace.ts";
```

### Data Flow: Heartbeat Run

```
pg_cron (every 12h)
  → flowpilot-heartbeat (edge function)
    → generateTraceId('hb') → trace_id: hb_xxx
    → tryAcquireLock('heartbeat')
    → [parallel] loadWorkspaceFiles, loadMemories, loadObjectives, loadSiteStats, ...
    → buildSystemPrompt (OpenClaw 6-layer compiler)
    → reason(messages, config) ← SHARED LOOP
      → AI provider (OpenAI/Gemini)
      → tool_calls → executeBuiltInTool(trace_id)
        → built-in? → handle directly
        → skill? → agent-execute(trace_id) → handler
      → loop until no more tool_calls or budget exceeded
    → saveHeartbeatState
    → agent_activity.insert(trace_id)
    → releaseLock('heartbeat')
```

### OpenClaw Prompt Layers

1. **Mode Identity** — heartbeat/operate (hardcoded)
2. **SOUL + IDENTITY** — from DB, evolvable via `soul_update`
3. **AGENTS** — from DB, evolvable via `agents_update` (fallback: `CORE_INSTRUCTIONS`)
4. **CMS Schema** — modules, integrations, block types
5. **GROUNDING RULES** — hardcoded safety layer (cannot be overridden)
6. **Context** — objectives, memory, heartbeat protocol, site maturity

### Files Changed

- `supabase/functions/_shared/agent-reason.ts` — refactored to re-export from submodules
- `supabase/functions/_shared/types.ts` — NEW: shared type definitions
- `supabase/functions/_shared/ai-config.ts` — NEW: AI provider resolution
- `supabase/functions/_shared/concurrency.ts` — NEW: lane-based locking
- `supabase/functions/_shared/token-tracking.ts` — NEW: budget enforcement
- `supabase/functions/_shared/trace.ts` — NEW: correlation IDs
- `supabase/functions/flowpilot-heartbeat/index.ts` — refactored to use `reason()`
