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

## Phase 2: FlowPilot "Operate" Mode — NEXT

### TODO
- [ ] Add mode switcher to CopilotPage: Migration | Operate | Automate
- [ ] Create OperateChat component — chat interface that uses agent-execute
- [ ] Refactor copilot-action to load tool definitions from agent_skills table
- [ ] Activity feed sidebar showing recent agent actions
- [ ] Agent memory read/write from FlowPilot conversations

## Phase 3: Public Chat Gets Skills

### TODO
- [ ] Integrate agent-execute into chat-completion edge function
- [ ] Filter skills by scope=external/both for public chat
- [ ] Add skill execution results to chat message rendering

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
