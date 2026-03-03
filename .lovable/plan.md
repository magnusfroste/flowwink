# FlowPilot Agentic Architecture

## Phase 1: Skill Registry + Unified Tool Engine ✅ DONE

### Completed
- **Database tables**: `agent_skills`, `agent_memory`, `agent_activity` with RLS policies
- **Enums**: `agent_scope`, `agent_skill_category`, `agent_activity_status`, `agent_type`, `agent_memory_category`
- **11 built-in skills** seeded: migrate_url, create_page_block, write_blog_post, send_newsletter, create_campaign, add_lead, search_web, book_appointment, check_order, update_settings, analyze_analytics
- **`agent-execute` edge function**: Unified skill executor with scope validation, approval checks, handler routing (edge/module/db/webhook), and activity logging
- **TypeScript types**: `src/types/agent.ts` with full type coverage

### Verified
- Direct execution works (analyze_analytics returns real page view data)
- Scope validation works (internal skills blocked from chat agent)
- Approval gating works (send_newsletter returns 202 pending_approval)

## Phase 2: FlowPilot "Operate" Mode ✅ DONE

### Completed
- Mode switcher (Operate | Migrate) in CopilotPage header using Tabs
- OperateChat component — chat with quick actions, skill badges, and inline results
- ActivityFeed sidebar — shows recent actions with status, duration, approve button
- `agent-operate` edge function — AI router that picks skills via tool calling, executes via agent-execute, summarizes results
- `useAgentOperate` hook — manages messages, skills, activity, and approval flow

### TODO (refinement)
- [ ] Refactor copilot-action to load tool definitions from agent_skills table
- [ ] Agent memory read/write from FlowPilot conversations

## Phase 3: Public Chat Gets Skills ✅ DONE

### Completed
- **chat-completion** loads external/both skills from `agent_skills` table as OpenAI-compatible tools
- Skills are routed through `agent-execute` edge function (scope validation, approval gating, activity logging)
- `agentSkillNames` map tracks which tool calls are agent skills vs built-in tools
- System prompt dynamically extended with skill usage instructions
- Works for both OpenAI and local AI providers (when tool calling is supported)
- Approval-gated skills return friendly "pending approval" messages to visitors

## Phase 4: Automation Layer

### TODO
- [ ] Create agent_automations table (schedule/event/signal triggers)
- [ ] Cron-based skill execution
- [ ] Signal integration from webhook events
- [ ] Proactive suggestions (heartbeat system)

## Architecture Reference

```
skill.handler routing:
  edge:function-name  →  supabase.functions.invoke()
  module:name         →  Direct DB operations (blog, crm, booking, etc.)
  db:table            →  DB read/write (settings, analytics)
  webhook:n8n         →  External webhook POST
```

## Key Files
| File | Purpose |
|------|---------|
| `supabase/functions/agent-execute/index.ts` | Unified skill executor |
| `src/types/agent.ts` | TypeScript types for skill engine |
| `src/lib/module-registry.ts` | Existing module registry (14 modules) |
| `supabase/functions/copilot-action/index.ts` | Current FlowPilot (to be refactored) |
| `supabase/functions/chat-completion/index.ts` | Current public chat (to integrate skills) |
