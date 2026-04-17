---
title: Context Engine
summary: How Pilot compiles prompts, manages token budgets, and tiers skill definitions
read_when: Working on prompt compilation, token management, or skill loading
---

# Context Engine

> **OpenClaw pattern:** 9-layer prompt architecture assembled from workspace files
> **Pilot implementation:** 6-layer prompt compiler (`prompt-compiler.ts`) with dynamic skill budget tiering

---

## The 6-Layer Prompt Compiler

`buildSystemPrompt()` assembles the system prompt in strict order. Each layer has a character cap to prevent prompt bloat.

```
┌────────────────────────────────────────────────────────┐
│ Layer 1: MODE IDENTITY                                 │
│ Hardcoded per surface (heartbeat / operate / chat)     │
│ "You are running in AUTONOMOUS HEARTBEAT mode..."      │
├────────────────────────────────────────────────────────┤
│ Layer 2: SOUL + IDENTITY                    ≤3,000 ch  │
│ From agent_memory keys: soul, identity                 │
│ Persona, values, tone, philosophy                      │
├────────────────────────────────────────────────────────┤
│ Layer 3: AGENTS (operational rules)         ≤4,000 ch  │
│ From agent_memory key: agents                          │
│ Fallback: CORE_INSTRUCTIONS (hardcoded)                │
├────────────────────────────────────────────────────────┤
│ Layer 4: DOMAIN CONTEXT                     ≤2,000 ch  │
│ Injected by domain pack (e.g. CMS schema)              │
│ Generic core knows nothing about the domain            │
├────────────────────────────────────────────────────────┤
│ Layer 5: GROUNDING RULES                    (fixed)    │
│ Hardcoded safety — CANNOT be overridden                │
│ Data integrity, tool execution, reply directives       │
├────────────────────────────────────────────────────────┤
│ Layer 6: MODE CONTEXT                       ≤variable  │
│ Memories ≤4,000 · Objectives ≤4,000                    │
│ Activity ≤2,000 · Stats ≤3,000                         │
│ Heartbeat state, healing report, protocol              │
└────────────────────────────────────────────────────────┘
```

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

`truncateSection(text, maxChars)` hard-cuts at the limit and appends:
```
…[truncated — use tools to read full data]
```

This signals to the LLM that more data exists and tools should be used to access it.

## Chat Mode (Separate Path)

Chat mode (`mode === 'chat'`) uses a simplified prompt:
1. Custom system prompt (or default)
2. Soul prompt
3. Language matching instruction
4. Data integrity rules

No objectives, no heartbeat protocol, no domain context — visitors get a focused, lightweight prompt.

## Skill Budget Tiering

As token usage grows during a `reason()` session, skill definitions are progressively compressed to stay within budget:

| Token Usage | Tier | Behavior |
|-------------|------|----------|
| < 50% budget | `full` | All tool definitions with full descriptions |
| 50–75% budget | `compact` | Descriptions truncated to 80 chars, parameter docs removed |
| > 75% budget | `drop` | Only top-20 most recently used skills remain |

```typescript
resolveSkillBudgetTier(tokenBudget, tokensUsed) → 'full' | 'compact' | 'drop'
```

The tier is **re-evaluated on every iteration** of the ReAct loop. When it changes, `loadSkillTools()` is called again with the new tier, dynamically shrinking the tool set mid-session.

### Compact Mode

`compactToolDefinition()` strips non-essential metadata:
- Function descriptions truncated to 80 characters
- All parameter `description` fields removed
- Schema structure preserved (names, types, required)

### Drop Mode

Only the 20 most recently used skills (by `agent_activity` in the last 14 days) are kept. This prevents the LLM from being overwhelmed when the token budget is nearly exhausted.

## Lazy Instruction Loading (OpenClaw LAW 3)

**Problem:** 73+ skills × ~2,000 chars instructions each = ~146,000 chars of instructions. This exceeds any reasonable context window.

**Solution:** Instructions are loaded on-demand, not upfront.

### Phase 1: Tool Assembly

`loadSkillTools()` loads only lightweight metadata from `agent_skills`:
- `name`, `tool_definition` (JSON schema), `scope`, `requires`, `category`
- **NOT** `instructions` — saving ~97% of tokens per skill

Cost: ~10 tokens per skill (name + schema) vs ~500 tokens (with instructions).

### Phase 2: On-Demand Loading

When the LLM actually calls a skill, `fetchSkillInstructions()` loads the full instructions:

```typescript
fetchSkillInstructions(supabase, ['generate_blog_post'], alreadyLoaded)
```

The instructions are appended as a system message:
```
SKILL CONTEXT (instructions for skills you just used):
### generate_blog_post
When to use: User asks for blog content...
```

The LLM sees these on the **next iteration**, informing follow-up decisions.

### Phase 3: Cache

A `SkillCache` object prevents repeated DB queries within a single session:

```typescript
interface SkillCache {
  skills: any[];    // Gated, unblocked skills
  scope: string;
  categories?: string[];
}
```

Skills are loaded once via `loadSkillsRaw()`, then re-formatted on tier changes via `loadSkillTools()`.

## Skill Gating

Before skills reach the LLM, they pass through `filterGatedSkills()`:

```
skill.requires = [
  { type: 'module', id: 'invoicing' },      // Is module enabled?
  { type: 'integration', key: 'stripe' },    // Is integration active?
  { type: 'skill', name: 'generate_blog' },  // Is dependency enabled?
]
```

If any requirement fails, the skill is excluded from the tool set. This prevents the agent from seeing tools it can't use.

## Tool Policy

Admins can block specific skills globally via the `tool_policy` memory key:

```json
{ "blocked": ["dangerous_skill", "experimental_skill"] }
```

Blocked skills are filtered out in `loadSkillsRaw()` before any other processing.

## Resource Meter

After each iteration, the agent receives a resource meter in its context:

```
[Resource meter] Tokens: 45,000/80,000 (56%) | Iteration: 3/6 | Errors: 0
```

Combined with the GROUNDING RULES instruction about resource awareness, this enables the agent to self-regulate its token usage.

---

*See also: [Architecture](./architecture.md) · [Memory](./memory.md) · [Compaction](./compaction.md)*
