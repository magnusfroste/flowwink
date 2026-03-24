

# Plan: Close Remaining OpenClaw Gaps

## Current State
Two gaps remain at ⚠️ in `docs/OPENCLAW-LAW.md`:

1. **Protocol Specs (L5)** — OpenClaw uses structured reply tags (`NO_REPLY`, `HEARTBEAT_OK`, action tags) to allow programmatic parsing of agent output. FlowPilot currently uses free-form text + SSE events.

2. **Tool Policy** — OpenClaw has layered allow/deny per tool. FlowPilot has `scope` (internal/public) + `trust_level` (auto/notify/approve) which is functionally sufficient but not formally documented as equivalent.

## What to Build

### 1. Protocol Specs — Reply Directives
Add structured reply directives to the agent prompt and SSE handling:

- **`NO_REPLY` sentinel**: When the heartbeat determines no action is needed, it outputs `NO_REPLY` instead of generating filler text. The heartbeat handler detects this and logs a clean "idle" activity entry.
- **`HEARTBEAT_OK` sentinel**: After successful heartbeat execution, signals clean completion.
- **Action tags**: Structured output markers like `[ACTION:skill_name]` and `[RESULT:status]` that get parsed from agent output and stored in `agent_activity` for better traceability.

**Files changed:**
- `supabase/functions/_shared/agent-reason.ts` — Add protocol directives to `GROUNDING_RULES` and `HEARTBEAT_PROTOCOL` constants. Add a `parseReplyDirectives()` utility function.
- `supabase/functions/flowpilot-heartbeat/index.ts` — Detect `NO_REPLY` / `HEARTBEAT_OK` in agent response, log appropriate activity status.
- `supabase/functions/agent-operate/index.ts` — Strip directive tags before streaming to client.

### 2. Tool Policy — Formalize Existing Model
Document and lightly enhance the existing scope + trust_level system to match OpenClaw's intent:

- Add a `tool_policy` key to `agent_memory` that stores global allow/deny overrides (e.g., temporarily block a skill globally).
- `loadSkillTools()` checks this policy before including tools.
- This completes the gap without over-engineering — the existing `scope` + `trust_level` + `requires` already covers 95% of OpenClaw's tool policy.

**Files changed:**
- `supabase/functions/_shared/agent-reason.ts` — In `loadSkillTools()`, check `agent_memory(key='tool_policy')` for blocked skill names.
- `supabase/functions/setup-flowpilot/index.ts` — Seed default `tool_policy` key (empty allow/deny lists).

### 3. Update Gap Analysis Doc
- `docs/OPENCLAW-LAW.md` — Move both gaps from ⚠️ to ✅ with resolution notes.

## Technical Details

### Reply Directive Constants
```typescript
const REPLY_DIRECTIVES = `
REPLY DIRECTIVES (use these exact strings when applicable):
- Output "NO_REPLY" (alone, no other text) when the heartbeat finds nothing to do.
- Output "HEARTBEAT_OK" as the final line after a successful heartbeat with actions taken.
- Prefix action descriptions with [ACTION:skill_name] for traceability.
`;
```

### Tool Policy Schema
```json
{
  "blocked": ["skill_name_1"],
  "notes": "Blocked due to repeated failures"
}
```

### parseReplyDirectives(content: string)
Returns `{ directive: 'NO_REPLY' | 'HEARTBEAT_OK' | null, cleanContent: string }`.

## Estimated Scope
- 3 edge function files modified
- 1 doc file updated
- ~80 lines of new code

