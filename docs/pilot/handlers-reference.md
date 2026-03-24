# Pilot Handler Reference

> Quick reference for all 40+ built-in tool handlers. Each entry: **what it does**, **when the agent uses it**, and **key behavior**.

---

## Memory

### `handleMemoryWrite(supabase, { key, value, category })`
Upserts to `agent_memory`. Auto-generates vector embedding (OpenAI or Gemini fallback). Categories: `preference`, `context`, `fact`.

### `handleMemoryRead(supabase, { key?, category?, semantic_query? })`
Hybrid search: 70% pgvector cosine similarity + 30% pg_trgm keyword matching via `search_memories_hybrid()`. Returns top matches with relevance scores.

### `handleMemoryDelete(supabase, { key })`
Hard-deletes from `agent_memory` by key.

---

## Objectives

### `handleObjectiveUpdateProgress(supabase, { objective_id, progress })`
Merges progress object into `agent_objectives.progress`. Used after completing plan steps.

### `handleObjectiveComplete(supabase, { objective_id })`
Sets status to `completed`, records `completed_at` timestamp.

### `handleObjectiveDelete(supabase, { objective_id })`
Deletes objective and all linked `agent_objective_activities`.

### `checkoutObjective(supabase, objectiveId, lockOwner)`
Acquires an exclusive lock on an objective (prevents parallel heartbeats from working the same goal). Uses `locked_by` + `locked_at` fields with 30-min stale threshold.

### `releaseObjective(supabase, objectiveId, lockOwner)`
Releases the lock after work is complete.

---

## Planning

### `handleDecomposeObjective(supabase, { objective_id })`
AI-powered plan generation. Calls LLM to break an objective into 3–7 ordered steps. Each step: `{ id, action, skill_name?, skill_args?, status }`. Stored in `objectives.progress.plan`.

### `handleAdvancePlan(supabase, { objective_id, chain? })`
Executes the next `pending` step in the plan. With `chain=true` (default), auto-advances up to `MAX_CHAIN_DEPTH` (4) consecutive steps. Updates step status to `done` or `failed`.

### `handleProposeObjective(supabase, { goal, reason, constraints?, success_criteria? })`
Creates a new objective. Used proactively by the agent during heartbeat when data patterns suggest a new goal.

---

## Skills (Self-Modification)

### `handleSkillCreate(supabase, { name, description, handler, category?, scope?, trust_level?, tool_definition })`
Inserts into `agent_skills`. Handler types: `edge:fn`, `module:name`, `db:table`, `webhook:url`.

### `handleSkillUpdate(supabase, { skill_name, updates })`
Partial update by name. Can modify description, handler, tool_definition, etc.

### `handleSkillList(supabase, { category?, scope?, include_disabled? })`
Returns filtered skill list with metadata (no full instructions — those are lazy-loaded).

### `handleSkillDisable / handleSkillEnable / handleSkillDelete`
Toggle or remove skills. Disable is soft (sets `enabled=false`), delete is hard.

### `handleSkillInstruct(supabase, { skill_name, instructions })`
Writes rich instructions (the "SKILL.md" equivalent). This is the agent's primary way to accumulate domain knowledge.

### `handleSkillRead(supabase, { skill_name })`
Lazy-loads full instructions + handler + metadata for a skill. Called before execution per OpenClaw's "list metadata, read on demand" pattern.

---

## Self-Evolution

### `handleSoulUpdate(supabase, { field, value })`
Updates `agent_memory(key='soul')`. Fields: `purpose`, `values`, `tone`, `philosophy`. This is personality evolution.

### `handleAgentsUpdate(supabase, { field, value })`
Updates `agent_memory(key='agents')`. Fields: `direct_action_rules`, `self_improvement`, `memory_guidelines`, `browser_rules`, `workflow_conventions`, `a2a_conventions`, `skill_pack_rules`, `custom_rules`.

### `handleHeartbeatProtocolUpdate(supabase, { action, protocol? })`
- `get` → returns current protocol
- `set` → saves new protocol text
- `reset` → restores `DEFAULT_HEARTBEAT_PROTOCOL`

---

## Automations

### `handleAutomationCreate(supabase, { name, trigger_type, trigger_config, skill_name, skill_arguments?, enabled? })`
Creates in `agent_automations`. Trigger types: `cron`, `event`, `signal`. **Disabled by default** for safety. Cron expressions auto-compute `next_run_at`.

### `handleAutomationList / handleAutomationUpdate / handleAutomationDelete`
Standard CRUD. Update supports partial fields. Delete by ID or name.

### `handleExecuteAutomation(supabase, { automation_id })`
Runs an enabled automation: loads linked skill, executes handler, updates `last_triggered_at` and `run_count`, computes next `next_run_at` for cron triggers.

---

## Workflows

### `handleWorkflowCreate(supabase, { name, description?, steps, trigger_type? })`
Creates a multi-step DAG. Steps support:
- `condition: { step, field, operator, value }` — conditional execution
- `on_failure: 'stop' | 'continue'` — error handling
- Template vars: `{{stepId.result.field}}` — data passing between steps

### `handleWorkflowExecute(supabase, { workflow_id })`
Runs all steps sequentially. Evaluates conditions, resolves templates, executes skills via handler router. Returns per-step results.

### `handleWorkflowList / handleWorkflowUpdate / handleWorkflowDelete`
Standard CRUD.

---

## A2A Delegation

### `handleDelegateTask(supabase, { peer_type, task, context? })`
Routes a subtask to a specialist sub-agent. Built-in specialists:
- `seo` — keyword analysis, meta optimization, Core Web Vitals
- `content` — editorial strategy, audience alignment
- `sales` — lead qualification, pipeline analysis
- `analytics` — trend identification, anomaly detection
- `email` — subject lines, segmentation, deliverability

Each gets a dedicated system prompt. Sessions persist via `a2a_activity` log.

---

## Reflection & Outcomes

### `handleReflect(supabase, { focus? })`
AI-powered self-assessment over the past 7 days. Analyzes `agent_activity` for patterns. Focus areas: `errors`, `usage`, `automations`, `objectives`. **Auto-persists** learnings to `agent_memory`.

### `handleEvaluateOutcomes(supabase, {})`
Finds recent activities without outcome scores. Returns them for the agent to evaluate.

### `handleRecordOutcome(supabase, { activity_id, status, outcome_data? })`
Scores a past action: `success`, `partial`, `neutral`, `negative`, `too_early` (<48h). Stored in `agent_activity.outcome_status`.

---

## Self-Healing

### `runSelfHealing(supabase)`
Scans `agent_activity` for skills with ≥3 consecutive failures. Quarantines (disables) the skill and any linked automations. Returns a report string injected into heartbeat context.

---

## Skill Packs

### `handleSkillPackList(supabase, {})`
Lists available packs from `agent_skill_packs` table.

### `handleSkillPackInstall(supabase, { pack_id })`
Installs all skills from a pack. Skips existing skills (by name). Marks pack as installed.

---

## Chaining

### `handleChainSkills(supabase, { skills })`
Executes multiple skills sequentially with data passing between them. Max depth: `MAX_CHAIN_DEPTH` (4). Each step's output becomes input context for the next.

---

## Embedding Generation

### `generateEmbedding(supabase, text)`
Generates a 768-dimensional vector embedding. Auto-fallback:
1. OpenAI `text-embedding-3-small`
2. Gemini `text-embedding-004`

Returns `null` if no provider is available (graceful degradation — memory still works, just without semantic search).

---

*See also: [README](./README.md) · [Architecture](./architecture.md)*
