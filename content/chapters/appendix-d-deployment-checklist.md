---
title: "Appendix D: Deployment Checklist"
description: "The go-live checklist for autonomous agent deployments — everything you need to verify before handing the agent the keys."
order: 103
icon: "clipboard-document-list"
appendix: true
---

# Appendix D: Deployment Checklist

> **This checklist covers a production deployment of FlowPilot on Flowwink. Adapt it for your own agent deployment. The goal is not to slow you down — it's to prevent the class of failures that only appear when the agent is running autonomously at 02:00.**

---

## Phase 1: Infrastructure

### Supabase Instance

- [ ] Project created, region selected close to users
- [ ] All migrations applied (`supabase db push` or migration runner)
- [ ] RLS enabled on all tables (verify in Dashboard → Table Editor)
- [ ] `agent_locks` table exists with correct schema
- [ ] `agent_activity` table exists and queryable
- [ ] `pgvector` extension enabled (for semantic memory search)
- [ ] `pg_trgm` extension enabled (for full-text memory search)
- [ ] Connection pooling configured (PgBouncer in transaction mode for edge functions)

### Edge Functions

- [ ] All edge functions deployed (`supabase functions deploy --no-verify-jwt`)
- [ ] `flowpilot-heartbeat` function deployed and returns 200
- [ ] `flowpilot-operate` function deployed and returns 200
- [ ] `agent-execute` function deployed and returns 200
- [ ] Function logs accessible in Supabase Dashboard

### Cron Jobs

- [ ] `flowpilot-heartbeat` cron configured (default: `0 0,12 * * *`)
- [ ] `automation-dispatcher` cron configured (`* * * * *`)
- [ ] `publish-scheduled-pages` cron configured (`* * * * *`)
- [ ] Cron timezone set correctly for the business (not defaulting to UTC)

---

## Phase 2: Secrets & Credentials

- [ ] `OPENAI_API_KEY` (or preferred provider key) set in Edge Function secrets
- [ ] `ANTHROPIC_API_KEY` set (if using Claude as reasoning tier)
- [ ] Email provider API key configured (if using newsletter/email skills)
- [ ] All third-party integration API keys added to `integrations` table
- [ ] No secrets hardcoded in skill definitions or agent memory
- [ ] API key rotation plan documented

---

## Phase 3: Agent Identity

### Workspace Files (in `agent_memory`)

- [ ] `SOUL.md` entry exists — agent personality, tone, values, boundaries
- [ ] `AGENTS.md` entry exists — capabilities, constraints, integration context
- [ ] `HEARTBEAT.md` entry exists — autonomous operating checklist
- [ ] All three files reviewed by a human (not just generated and accepted)
- [ ] Agent name and voice consistent across all three files

### Skills

- [ ] Initial skill pack installed (Content Marketing + CRM Nurture recommended)
- [ ] All skills have non-empty `instructions` field (no schema-only skills)
- [ ] `requires_approval` set correctly for high-risk skills
- [ ] Trust tiers reviewed: `auto`/`notify`/`approve` assigned intentionally
- [ ] Gating conditions correct (skills requiring API keys properly gated)
- [ ] At least one test execution per skill pack (verify skills actually work)

---

## Phase 4: Safety & Governance

### Approval Workflow

- [ ] Admin notification channel configured (email/webhook for `approve`-tier events)
- [ ] Activity Feed tested — pending approvals visible
- [ ] Approve/reject flow tested end-to-end
- [ ] `tool_policy` initial state documented (none = defaults apply)

### Budget Controls

- [ ] Token budget per heartbeat run configured (`budget.limit`)
- [ ] Model tier defaults set (fast model for routine, reasoning for complex)
- [ ] Monthly cost estimate calculated (see [Token Economy →](07b-token-economy.md))
- [ ] Alert threshold set (notify when monthly spend exceeds N)

### RLS Verification

- [ ] Run RLS audit: can anonymous users read `agent_skills`? (Should: No)
- [ ] Run RLS audit: can anonymous users read `agent_memory`? (Should: No)
- [ ] Run RLS audit: can anonymous users write `agent_activity`? (Should: No)
- [ ] Visitor chat scope: can only read public content + create bookings/leads

---

## Phase 5: First Heartbeat

- [ ] Trigger heartbeat manually (don't wait for cron on first run)
- [ ] Watch logs in real-time during first run
- [ ] Verify `agent_activity` has entries after the run
- [ ] Verify trace ID is consistent across all activities in one run
- [ ] Check heartbeat report: all 7 steps logged (self-heal, propose, plan, advance, automate, reflect, remember)
- [ ] No skills quarantined after first run (if they are — investigate before continuing)
- [ ] Token usage within expected range

---

## Phase 6: Monitoring Setup

- [ ] Engine Room dashboard accessible and showing data
- [ ] Token spend widget working
- [ ] Skill health view showing success rates
- [ ] Activity Feed showing recent actions with correct status
- [ ] Lock table queryable (verify no stuck locks)
- [ ] Weekly review schedule set (when will a human review agent activity?)

---

## Phase 7: Graduated Autonomy Rollout

Follow the trust-building phases from [Human-in-the-Loop →](09-human-in-the-loop.md):

**Week 1–2: Observer mode**
- [ ] All skills set to `requires_approval = true`
- [ ] Agent runs heartbeats, admin reviews everything
- [ ] Note: which actions is the agent proposing? Are they sensible?

**Week 3–4: Assistant mode**
- [ ] Low-risk skills (research, analysis, drafting) set to `auto` or `notify`
- [ ] High-risk skills (sends, payments, settings) remain `approve`
- [ ] Admin still reviews all `notify` events

**Month 2+: Operator mode**
- [ ] Trust-appropriate tiers applied based on observed behavior
- [ ] `tool_policy` removed or minimized
- [ ] Review frequency reduced to weekly

---

## Go/No-Go Criteria

Before handing the agent full autonomous operation:

| Check | Requirement |
|-------|-------------|
| First 10 heartbeats completed | All succeeded or failed gracefully |
| No unexpected `approve` queue backlog | Admin has reviewed and actioned all pending |
| Token cost within budget | Monthly projection within acceptable range |
| At least one human has read SOUL.md | Someone knows what the agent values |
| Failure recovery tested | Kill a skill intentionally, verify quarantine works |
| Admin knows how to pause the agent | `tool_policy` with `blocked_skills: ["*"]` or heartbeat disable |

---

## Emergency Procedures

**Immediate pause:**
```json
// Set in agent_memory, key: tool_policy
{
  "blocked_skills": ["*"],
  "reason": "Emergency pause — investigating incident"
}
```

**Disable heartbeat cron:**
Via Supabase Dashboard → Database → Cron Jobs → Disable `flowpilot-heartbeat`

**Review recent actions:**
```sql
SELECT skill_name, status, input, output, created_at
FROM agent_activity
WHERE created_at > now() - interval '24 hours'
ORDER BY created_at DESC;
```

**Clear stuck lock:**
```sql
DELETE FROM agent_locks WHERE lane = 'heartbeat';
```

---

*A deployment checklist is a form of respect — for the people who will interact with the agent, and for the business data it will touch. The agent runs autonomously. You are responsible for what it does.*
