# Pilot Architecture — Deep Dive

> Technical reference for the Pilot reasoning engine. Read [README.md](./README.md) first for the overview.

---

## Data Flow: Surface → Core → Handlers

```
Surface (edge function)
  │
  ├── 1. Auth + input validation
  ├── 2. Load workspace files (soul, identity, agents)
  ├── 3. Load domain context (via domain pack)
  ├── 4. Build system prompt (prompt-compiler.ts)
  ├── 5. Assemble tools (built-in + DB skills)
  │
  └── 6. reason(config) ─────────────────────────────────┐
         │                                                │
         │  Iteration 1..N:                               │
         │  ┌─────────────────────────────┐               │
         │  │ LLM call (OpenAI / Gemini)  │               │
         │  │ ↓                           │               │
         │  │ tool_calls[]?               │               │
         │  │  ├── built-in → handlers.ts │               │
         │  │  └── skill → handler router │               │
         │  │ ↓                           │               │
         │  │ Append tool results         │               │
         │  │ ↓                           │               │
         │  │ Budget check (tokens/iters) │               │
         │  └─────────────────────────────┘               │
         │                                                │
         └── Return: ReasonResult ────────────────────────┘
```

---

## ReasonConfig Interface (Actual)

```typescript
interface ReasonConfig {
  scope: 'internal' | 'external';       // Skill filtering by scope
  maxIterations?: number;                // Default: 6 (operate) / 8 (heartbeat)
  systemPromptOverride?: string;         // Bypass 6-layer prompt compiler
  extraContext?: string;                 // Appended to system prompt
  builtInToolGroups?: BuiltInToolGroup[];// Which tool groups to include
  additionalTools?: any[];              // Extra tool definitions
  tier?: AiTier;                        // 'fast' | 'reasoning'
  lockLane?: string;                    // Concurrency guard lane
  lockOwner?: string;                   // Lock owner identifier
  traceId?: string;                     // Correlation ID for observability
  tokenBudget?: number;                 // Token limit for entire run
  skillCategories?: string[];           // Filter DB skills by category
}
```

**Note:** `reason()` receives a `supabase` client, `conversationId`, and `messages` array as separate parameters alongside this config. The config controls behavior, not data.

---

## Tool Execution Router

`executeBuiltInTool()` is a giant switch that routes tool names to handlers:

```
tool_call.name
  ├── memory_write      → handleMemoryWrite()     ── vector embedding + upsert
  ├── memory_read       → handleMemoryRead()       ── hybrid search (70% vector + 30% keyword)
  ├── decompose_objective → handleDecomposeObjective() ── AI planning call
  ├── advance_plan      → handleAdvancePlan()      ── step execution + chaining
  ├── delegate_task     → handleDelegateTask()     ── A2A with persistent sessions
  ├── reflect           → handleReflect()          ── self-assessment + auto-persist
  ├── workflow_execute  → handleWorkflowExecute()  ── DAG runner with template vars
  ├── skill_*           → handleSkill*()           ── CRUD on agent_skills
  ├── soul_update       → handleSoulUpdate()       ── personality evolution
  ├── agents_update     → handleAgentsUpdate()     ── operational rules evolution
  └── ... (40+ total)
```

**Non-built-in tools** (DB skills) are routed by handler type:
- `edge:function-name` → Supabase Edge Function invocation
- `module:module-name` → Module API operation
- `db:table-name` → Database query
- `webhook:url` → External HTTP call

---

## Prompt Compiler Internals

### Character Budgets

```
MAX_SOUL_CHARS          = 3,000    (~750 tokens)
MAX_AGENTS_CHARS        = 4,000    (~1,000 tokens)
MAX_MEMORY_CHARS        = 4,000    (~1,000 tokens)
MAX_OBJECTIVES_CHARS    = 4,000    (~1,000 tokens)
MAX_CMS_SCHEMA_CHARS    = 2,000    (~500 tokens)
MAX_CROSS_MODULE_CHARS  = 3,000    (~750 tokens)
MAX_ACTIVITY_CHARS      = 2,000    (~500 tokens)
MAX_BOOTSTRAP_TOTAL     = 20,000   (~5,000 tokens)
```

### Truncation

`truncateSection(text, maxChars)` — hard-cuts at limit, appends `…[truncated — use tools to read full data]`.

### Workspace Files

Stored in `agent_memory` with reserved keys:

| Key | OpenClaw Equivalent | Content |
|-----|-------------------|---------|
| `soul` | `SOUL.md` | `{ purpose, values[], tone, philosophy }` |
| `identity` | `IDENTITY.md` | `{ name, role, capabilities[], boundaries[] }` |
| `agents` | `AGENTS.md` | `{ direct_action_rules, self_improvement, memory_guidelines, ... }` |
| `heartbeat_protocol` | `HEARTBEAT.md` | Protocol text (7-step loop) |
| `tool_policy` | `TOOLS.md` | `{ blocked: string[] }` |
| `heartbeat_state` | — | `{ lastHeartbeat, completedCycles, ... }` |

### Prompt Context Isolation

Internal system keys are **excluded** from LLM context in `loadMemories()`:
- `tool_policy`, `expected_skill_hash`, `heartbeat_state`, `heartbeat_protocol`

This prevents infrastructure metadata from polluting the agent's reasoning.

---

## Skill Budget Tiers

As token usage grows, skill definitions are progressively compressed:

| Token Usage | Tier | Behavior |
|-------------|------|----------|
| < 50% | `full` | All tool definitions included as-is |
| 50–75% | `compact` | Descriptions truncated to 80 chars, parameter descriptions removed |
| > 75% | `drop` | Only built-in tools remain, DB skills dropped |

`resolveSkillBudgetTier(tokenUsage, budget)` → `'full' | 'compact' | 'drop'`

---

## Context Pruning Pipeline

When conversation history approaches `SUMMARY_THRESHOLD` (60k tokens):

```
1. preCompactionFlush(oldMessages, supabase)
   └── AI extracts up to 5 discrete facts from old messages
   └── Persists each as agent_memory entry with vector embedding

2. pruneConversationHistory(messages, supabase)
   └── AI generates a summary of old messages
   └── Replaces old messages with [SUMMARY] message
   └── Keeps recent N messages intact
```

Both functions live in `reason.ts` (lines ~458–530).

---

## Reply Directives (Protocol Layer 5)

The LLM can emit special strings that surfaces interpret:

| Directive | Meaning | Used by |
|-----------|---------|---------|
| `NO_REPLY` | Nothing to do — heartbeat should exit silently | Heartbeat |
| `HEARTBEAT_OK` | Actions taken, heartbeat complete | Heartbeat |
| `[ACTION:skill_name]` | Traceability prefix (stripped before display) | All |
| `[RESULT:success\|partial\|failed]` | Structured outcome tag | All |

`parseReplyDirectives(content)` → `{ directive, cleanContent }`

---

## A2A Delegation

Agent-to-agent delegation uses persistent sessions:

```
handleDelegateTask({ peer_type, task, context })
  │
  ├── Resolve specialist prompt (seo, content, sales, analytics, email)
  ├── Build mini-conversation with task + context
  ├── Call LLM with specialist system prompt
  ├── Log to a2a_activity table
  └── Return specialist response
```

Built-in specialist types: `seo`, `content`, `sales`, `analytics`, `email`.

Sessions are **persistent** — each specialist remembers prior delegations via the activity log.

---

## Self-Healing Flow

```
runSelfHealing(supabase)
  │
  ├── Query agent_activity for recent failures per skill
  ├── For each skill with ≥ SELF_HEAL_THRESHOLD (3) consecutive errors:
  │   ├── Disable the skill (quarantine)
  │   ├── Disable linked automations
  │   └── Log quarantine event
  └── Return healing report string
```

---

## Workflow DAG Runner

```
handleWorkflowExecute(supabase, { workflow_id })
  │
  ├── Load workflow definition (steps[])
  ├── For each step:
  │   ├── Evaluate condition (if present)
  │   │   └── {step, field, operator, value} → eq|neq|gt|lt|contains|truthy
  │   ├── Resolve template vars: {{stepId.result.field}}
  │   ├── Execute skill via loadSkillTools() + handler router
  │   ├── Store step result
  │   └── On failure: stop (default) or continue
  └── Return aggregate results
```

---

## AI Provider Routing

`resolveAiConfig(supabase, tier)` returns `{ apiKey, apiUrl, model }` based on:

1. `site_settings.system_ai` preferences (provider, model overrides)
2. Available API keys (auto-detect from env)
3. Tier: `fast` or `reasoning`

**Priority:** OpenAI → Gemini → Local → n8n

**Model migration maps** (transparent to callers):
- OpenAI: `gpt-4o` → `gpt-4.1`, `gpt-4o-mini` → `gpt-4.1-mini`, `gpt-3.5-turbo` → `gpt-4.1-nano`
- Gemini: `gemini-1.5-pro` → `gemini-2.5-pro`, `gemini-1.5-flash` → `gemini-2.5-flash`

Each provider uses the OpenAI-compatible API format so the reasoning loop is model-agnostic.

---

## Integrity & Drift Detection

`integrity.ts` provides two functions used by `setup-flowpilot` and `instance-health`:

### `computeSkillHash(skills)`
Deterministic SHA-256 hash of all skill names + first 200 chars of instructions. Stored in `agent_memory(key='expected_skill_hash')` after bootstrap. Compared at runtime to detect drift.

### `runIntegrityChecks(supabase)`
Runs 5 validation checks:
1. Skills have instructions
2. Skills have descriptions
3. Tool definitions are valid JSON with `function.name` and `function.parameters`
4. Critical memory keys exist (`soul`, `identity`, `agents`)
5. Enabled automations reference existing skills

Returns `{ score: 0-100, issues: string[], totalChecks, passedChecks }`.

---

## Observability

### Trace IDs

`generateTraceId('fp')` → `fp_m2x7k9_abc123`

Format: `{prefix}_{timestamp_base36}_{random}`. Flows through:
heartbeat → reason loop → tool calls → activity logs

### Token Tracking

`extractTokenUsage(response)` → `{ prompt_tokens, completion_tokens, total_tokens }`
`accumulateTokens(running, delta)` → merged totals
`isOverBudget(usage, budget)` → boolean

### Activity Audit

Every tool execution is logged to `agent_activity`:
```
{ skill_name, status, input, output, duration_ms, token_usage, conversation_id }
```

---

## Safety Guards

| Guard | Threshold | Behavior |
|-------|-----------|----------|
| **Wall-clock timeout** | 120s (heartbeat) | Hard abort |
| **Anti-runaway** | 2+ consecutive tool errors | Session abort |
| **Token budget** | Configurable (default 80k) | Stop reasoning |
| **Pre-budget flush** | 80% budget used | Extract + save facts, then focus on completion |
| **Iteration cap** | 6 (operate) / 8 (heartbeat) | Stop after N tool rounds |

---

*See also: [README](./README.md) · [Handler Reference](./handlers-reference.md)*
