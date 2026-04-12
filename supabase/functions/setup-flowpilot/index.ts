import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// =============================================================================
// FlowPilot Agentic Layer Schema
// =============================================================================

const AGENTIC_SCHEMA = `
-- ═══════════════════════════════════════════════════════════════════════════════
-- FLOWPILOT AGENTIC LAYER — Self-hosted bootstrap (v2 — complete)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Enums
DO $$ BEGIN CREATE TYPE public.agent_type AS ENUM ('flowpilot', 'chat'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE public.agent_scope AS ENUM ('internal', 'external', 'both'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE public.agent_skill_category AS ENUM ('content', 'crm', 'communication', 'automation', 'search', 'analytics', 'system', 'commerce'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE public.agent_memory_category AS ENUM ('preference', 'context', 'fact'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE public.agent_objective_status AS ENUM ('active', 'completed', 'paused', 'failed'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE public.agent_activity_status AS ENUM ('success', 'failed', 'pending_approval'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE public.automation_trigger_type AS ENUM ('cron', 'event', 'signal'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE public.skill_origin AS ENUM ('bundled', 'managed', 'agent', 'user'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE public.skill_trust_level AS ENUM ('auto', 'notify', 'approve'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE public.activity_outcome_status AS ENUM ('success', 'partial', 'neutral', 'negative', 'too_early'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Agent Skills
CREATE TABLE IF NOT EXISTS public.agent_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  handler TEXT NOT NULL,
  instructions TEXT,
  category agent_skill_category NOT NULL DEFAULT 'content',
  scope agent_scope NOT NULL DEFAULT 'internal',
  tool_definition JSONB NOT NULL DEFAULT '{}'::jsonb,
  requires_approval BOOLEAN NOT NULL DEFAULT false,
  enabled BOOLEAN NOT NULL DEFAULT true,
  trust_level skill_trust_level NOT NULL DEFAULT 'auto',
  origin skill_origin NOT NULL DEFAULT 'bundled',
  requires JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Agent Memory
CREATE TABLE IF NOT EXISTS public.agent_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  category agent_memory_category NOT NULL DEFAULT 'context',
  created_by agent_type NOT NULL DEFAULT 'flowpilot',
  embedding vector(768),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Agent Activity (audit log)
CREATE TABLE IF NOT EXISTS public.agent_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent agent_type NOT NULL DEFAULT 'flowpilot',
  skill_id UUID REFERENCES public.agent_skills(id),
  skill_name TEXT,
  input JSONB DEFAULT '{}'::jsonb,
  output JSONB DEFAULT '{}'::jsonb,
  status agent_activity_status NOT NULL DEFAULT 'success',
  error_message TEXT,
  conversation_id UUID,
  duration_ms INTEGER,
  token_usage JSONB,
  outcome_status activity_outcome_status,
  outcome_data JSONB,
  outcome_evaluated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Agent Objectives
CREATE TABLE IF NOT EXISTS public.agent_objectives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal TEXT NOT NULL,
  status agent_objective_status NOT NULL DEFAULT 'active',
  constraints JSONB NOT NULL DEFAULT '{}'::jsonb,
  success_criteria JSONB NOT NULL DEFAULT '{}'::jsonb,
  progress JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  completed_at TIMESTAMPTZ,
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Agent Objective ↔ Activity (join table)
CREATE TABLE IF NOT EXISTS public.agent_objective_activities (
  objective_id UUID NOT NULL REFERENCES public.agent_objectives(id) ON DELETE CASCADE,
  activity_id UUID NOT NULL REFERENCES public.agent_activity(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (objective_id, activity_id)
);

-- Agent Automations
CREATE TABLE IF NOT EXISTS public.agent_automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  trigger_type automation_trigger_type NOT NULL DEFAULT 'cron',
  trigger_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  skill_id UUID REFERENCES public.agent_skills(id),
  skill_name TEXT,
  skill_arguments JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_triggered_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  run_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Agent Locks (concurrency guard)
CREATE TABLE IF NOT EXISTS public.agent_locks (
  lane TEXT PRIMARY KEY,
  locked_by TEXT NOT NULL,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '5 minutes'
);

-- Agent Workflows (multi-step chains)
CREATE TABLE IF NOT EXISTS public.agent_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  trigger_type TEXT NOT NULL DEFAULT 'manual',
  trigger_config JSONB,
  enabled BOOLEAN NOT NULL DEFAULT true,
  run_count INTEGER NOT NULL DEFAULT 0,
  last_run_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Agent Skill Packs (bundled capabilities)
CREATE TABLE IF NOT EXISTS public.agent_skill_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  version TEXT NOT NULL DEFAULT '1.0.0',
  skills JSONB NOT NULL DEFAULT '[]'::jsonb,
  installed BOOLEAN NOT NULL DEFAULT false,
  installed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- RLS
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.agent_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_objectives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_objective_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_skill_packs ENABLE ROW LEVEL SECURITY;

-- agent_skills
DROP POLICY IF EXISTS "Admins can manage skills" ON public.agent_skills;
CREATE POLICY "Admins can manage skills" ON public.agent_skills FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Authenticated can view enabled skills" ON public.agent_skills;
CREATE POLICY "Authenticated can view enabled skills" ON public.agent_skills FOR SELECT TO authenticated USING (enabled = true);

-- agent_memory
DROP POLICY IF EXISTS "Admins can manage agent memory" ON public.agent_memory;
CREATE POLICY "Admins can manage agent memory" ON public.agent_memory FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Authenticated can view agent memory" ON public.agent_memory;
CREATE POLICY "Authenticated can view agent memory" ON public.agent_memory FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "System can insert agent memory" ON public.agent_memory;
CREATE POLICY "System can insert agent memory" ON public.agent_memory FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "System can update agent memory" ON public.agent_memory;
CREATE POLICY "System can update agent memory" ON public.agent_memory FOR UPDATE USING (true);

-- agent_activity
DROP POLICY IF EXISTS "Admins can view agent activity" ON public.agent_activity;
CREATE POLICY "Admins can view agent activity" ON public.agent_activity FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins can update agent activity" ON public.agent_activity;
CREATE POLICY "Admins can update agent activity" ON public.agent_activity FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "System can insert agent activity" ON public.agent_activity;
CREATE POLICY "System can insert agent activity" ON public.agent_activity FOR INSERT WITH CHECK (true);

-- agent_objectives
DROP POLICY IF EXISTS "Admins can manage objectives" ON public.agent_objectives;
CREATE POLICY "Admins can manage objectives" ON public.agent_objectives FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Authenticated can view objectives" ON public.agent_objectives;
CREATE POLICY "Authenticated can view objectives" ON public.agent_objectives FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "System can insert objectives" ON public.agent_objectives;
CREATE POLICY "System can insert objectives" ON public.agent_objectives FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "System can update objectives" ON public.agent_objectives;
CREATE POLICY "System can update objectives" ON public.agent_objectives FOR UPDATE USING (true);

-- agent_objective_activities
DROP POLICY IF EXISTS "Admins can manage objective activities" ON public.agent_objective_activities;
CREATE POLICY "Admins can manage objective activities" ON public.agent_objective_activities FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Authenticated can view objective activities" ON public.agent_objective_activities;
CREATE POLICY "Authenticated can view objective activities" ON public.agent_objective_activities FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "System can insert objective activities" ON public.agent_objective_activities;
CREATE POLICY "System can insert objective activities" ON public.agent_objective_activities FOR INSERT WITH CHECK (true);

-- agent_automations
DROP POLICY IF EXISTS "Admins can manage automations" ON public.agent_automations;
CREATE POLICY "Admins can manage automations" ON public.agent_automations FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Authenticated can view automations" ON public.agent_automations;
CREATE POLICY "Authenticated can view automations" ON public.agent_automations FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "System can update automations" ON public.agent_automations;
CREATE POLICY "System can update automations" ON public.agent_automations FOR UPDATE USING (true);

-- agent_locks
DROP POLICY IF EXISTS "System can manage locks" ON public.agent_locks;
CREATE POLICY "System can manage locks" ON public.agent_locks FOR ALL USING (true);

-- agent_workflows
DROP POLICY IF EXISTS "Admins can manage workflows" ON public.agent_workflows;
CREATE POLICY "Admins can manage workflows" ON public.agent_workflows FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "System can manage workflows" ON public.agent_workflows;
CREATE POLICY "System can manage workflows" ON public.agent_workflows FOR ALL USING (true);

-- agent_skill_packs
DROP POLICY IF EXISTS "Admins can manage skill packs" ON public.agent_skill_packs;
CREATE POLICY "Admins can manage skill packs" ON public.agent_skill_packs FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "System can manage skill packs" ON public.agent_skill_packs;
CREATE POLICY "System can manage skill packs" ON public.agent_skill_packs FOR ALL USING (true);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Database Functions (required for agent operation)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Atomic objective checkout (prevents race conditions)
CREATE OR REPLACE FUNCTION public.checkout_objective(p_objective_id uuid, p_locked_by text DEFAULT 'heartbeat')
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rows_affected integer;
BEGIN
  UPDATE agent_objectives SET locked_by = p_locked_by, locked_at = now()
  WHERE id = p_objective_id AND (locked_by IS NULL OR locked_at < now() - interval '30 minutes');
  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  RETURN rows_affected > 0;
END; $$;

-- Concurrency lock (prevents parallel heartbeat runs)
CREATE OR REPLACE FUNCTION public.try_acquire_agent_lock(p_lane text, p_locked_by text DEFAULT 'agent', p_ttl_seconds integer DEFAULT 300)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rows_affected integer;
BEGIN
  DELETE FROM agent_locks WHERE expires_at < now();
  INSERT INTO agent_locks (lane, locked_by, locked_at, expires_at)
  VALUES (p_lane, p_locked_by, now(), now() + (p_ttl_seconds || ' seconds')::interval)
  ON CONFLICT (lane) DO UPDATE SET locked_by = p_locked_by, locked_at = now(),
    expires_at = now() + (p_ttl_seconds || ' seconds')::interval
  WHERE agent_locks.expires_at < now();
  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  RETURN rows_affected > 0;
END; $$;

CREATE OR REPLACE FUNCTION public.release_agent_lock(p_lane text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN DELETE FROM agent_locks WHERE lane = p_lane; END; $$;
`;

// =============================================================================
// Default Skill Seed Data
// =============================================================================

const DEFAULT_SKILLS = [
  {
    name: 'write_blog_post',
    description: 'Create a draft blog post with title, topic, tone, and optional pre-written content. If content is provided it will be used directly; otherwise AI generates it. Use when: writing a new article; generating blog content from a topic; creating a draft for review. NOT for: managing existing posts (manage_blog_posts); generating multi-channel content (generate_content_proposal).',
    handler: 'module:blog',
    category: 'content',
    scope: 'internal',
    requires_approval: false,
    instructions: `## write_blog_post
### What
Creates a draft blog post in the CMS with title, topic, tone, and content.
### When to use
- User asks to write/create/draft a blog post
- Content pipeline workflow step (after research_content + generate_content_proposal)
- NOT for updating existing posts (use manage_blog_posts with action='update')
### Parameters
- **title**: Required. The blog post title.
- **topic**: Required. Brief or topic description used for AI generation if no content provided.
- **content**: Always provide full markdown. Do NOT leave empty expecting AI generation — quality is much lower. Use ## for headings, paragraphs, bullets. Do NOT include the title as H1.
- **tone**: Defaults to 'professional'. Options: professional, casual, technical, storytelling.
- **language**: ISO code (en, sv). Defaults to site language.
### Edge cases
- If no content provided, handler generates via AI — but quality is lower than agent-written content.
- Title must be unique; duplicates get a numeric suffix.
- Always creates as 'draft' status — use manage_blog_posts to publish.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'write_blog_post',
        description: 'Create a draft blog post with title, topic, tone, and optional pre-written content. If content is provided it will be used directly; otherwise AI generates it. Use when: writing a new article; generating blog content from a topic; creating a draft for review. NOT for: managing existing posts (manage_blog_posts); generating multi-channel content (generate_content_proposal).',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Blog post title' },
            topic: { type: 'string', description: 'Topic or brief for the post' },
            content: { type: 'string', description: 'Full blog post content in markdown format. Use ## for headings, paragraphs, and bullet points. Do NOT include the title as H1.' },
            tone: { type: 'string', enum: ['professional', 'casual', 'technical', 'storytelling'], description: 'Writing tone' },
            language: { type: 'string', description: 'Language code (en, sv, etc.)' },
          },
          required: ['title', 'topic'],
        },
      },
    },
  },
  {
    name: 'add_lead',
    description: 'Add a new lead to the CRM. Use when: capturing a new prospect; a visitor submits contact info; importing leads from external sources. NOT for: updating existing leads (manage_leads); qualifying leads (qualify_lead).',
    handler: 'module:crm',
    category: 'crm',
    scope: 'both',
    requires_approval: false,
    instructions: `## add_lead
### What
Adds a new lead to the CRM system.
### When to use
- Visitor provides contact info in chat
- Form submission contains a new email
- Manual lead entry requested by admin
- NOT for updating existing leads (use manage_leads)
### Parameters
- **email**: Required. Must be a valid email address.
- **name**: Optional but recommended for personalization.
- **phone**: Optional.
- **source**: Where the lead came from: 'chat', 'form', 'manual', 'import'.
### Edge cases
- Duplicate emails: handler may reject or merge — check response.
- Always set source accurately for attribution tracking.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'add_lead',
        description: 'Add a new lead to the CRM. Use when: capturing a new prospect; a visitor submits contact info; importing leads from external sources. NOT for: updating existing leads (manage_leads); qualifying leads (qualify_lead).',
        parameters: {
          type: 'object',
          properties: {
            email: { type: 'string', description: 'Lead email' },
            name: { type: 'string', description: 'Lead name' },
            phone: { type: 'string', description: 'Phone number' },
            source: { type: 'string', description: 'Lead source (chat, form, manual)' },
          },
          required: ['email'],
        },
      },
    },
  },
  {
    name: 'book_appointment',
    description: 'Create a booking for a customer. Use when: a customer wants to schedule an appointment; confirming a service reservation; creating a booking from a chat conversation. NOT for: checking availability (check_availability); managing existing bookings (manage_bookings).',
    handler: 'module:booking',
    category: 'crm',
    scope: 'both',
    requires_approval: false,
    instructions: `## book_appointment
### What
Creates a booking for a customer at a specific date and time.
### When to use
- Visitor asks to book/schedule an appointment in chat
- Admin creates a booking manually
- Automated booking from a workflow
### Parameters
- **customer_name**: Required.
- **customer_email**: Required for confirmation email.
- **date**: Required, YYYY-MM-DD format.
- **time**: Required, HH:MM format (24h).
- **service_id**: Optional. If omitted, uses default service.
### Edge cases
- Always call check_availability first to verify the slot is open.
- Booking confirmation email is sent automatically.
- Double bookings are rejected by the handler.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'book_appointment',
        description: 'Create a booking for a customer. Use when: a customer wants to schedule an appointment; confirming a service reservation; creating a booking from a chat conversation. NOT for: checking availability (check_availability); managing existing bookings (manage_bookings).',
        parameters: {
          type: 'object',
          properties: {
            customer_name: { type: 'string' },
            customer_email: { type: 'string' },
            date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
            time: { type: 'string', description: 'Time in HH:MM format' },
            service_id: { type: 'string', description: 'Optional service ID' },
          },
          required: ['customer_name', 'customer_email', 'date', 'time'],
        },
      },
    },
  },
  {
    name: 'analyze_analytics',
    description: 'Get page view analytics for a given period. Use when: reviewing website traffic; analyzing page performance; generating traffic reports. NOT for: analyzing chat feedback (analyze_chat_feedback); generating business digests (weekly_business_digest).',
    handler: 'db:page_views',
    category: 'analytics',
    scope: 'internal',
    requires_approval: false,
    instructions: `## analyze_analytics
### What
Retrieves page view analytics for a given time period.
### When to use
- User asks about traffic, views, or site performance
- Part of weekly_business_digest or reporting workflows
- When evaluating content performance
### Parameters
- **period**: 'today', 'week', 'month', 'quarter'. Defaults to 'week'.
### Edge cases
- Returns aggregated data — for per-page breakdown, check the response structure.
- New sites may have no data — handle gracefully.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'analyze_analytics',
        description: 'Get page view analytics for a given period. Use when: reviewing website traffic; analyzing page performance; generating traffic reports. NOT for: analyzing chat feedback (analyze_chat_feedback); generating business digests (weekly_business_digest).',
        parameters: {
          type: 'object',
          properties: {
            period: { type: 'string', enum: ['today', 'week', 'month', 'quarter'], description: 'Time period' },
          },
        },
      },
    },
  },
  {
    name: 'send_newsletter',
    description: 'Create a newsletter draft. Use when: starting a new email campaign; composing content for an upcoming newsletter; setting up subscriber update structure. NOT for: sending the newsletter (execute_newsletter_send); managing existing newsletters (manage_newsletters).',
    handler: 'module:newsletter',
    category: 'communication',
    scope: 'internal',
    requires_approval: true,
    instructions: `## send_newsletter
### What
Creates a newsletter draft (does NOT send immediately). Requires approval.
### When to use
- User asks to create/draft a newsletter
- Part of content pipeline: research → write → newsletter
- NOT for sending — use execute_newsletter_send after approval
### Parameters
- **subject**: Required. Newsletter subject line.
- **content**: Required. HTML content for the newsletter body.
- **schedule_at**: Optional ISO datetime. If set, newsletter is scheduled for future send.
### Edge cases
- Always creates as draft. Sending requires execute_newsletter_send (separate approval gate).
- HTML must be well-formed for email rendering.
- Check subscriber count with manage_newsletter_subscribers before drafting.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'send_newsletter',
        description: 'Create a newsletter draft. Use when: starting a new email campaign; composing content for an upcoming newsletter; setting up subscriber update structure. NOT for: sending the newsletter (execute_newsletter_send); managing existing newsletters (manage_newsletters).',
        parameters: {
          type: 'object',
          properties: {
            subject: { type: 'string', description: 'Newsletter subject line' },
            content: { type: 'string', description: 'HTML content' },
            schedule_at: { type: 'string', description: 'ISO datetime to schedule (optional)' },
          },
          required: ['subject', 'content'],
        },
      },
    },
  },
  {
    name: 'create_objective',
    description: 'Create a new high-level objective for FlowPilot to work toward. Use when: defining a new strategic goal; initiating a new project; setting a long-term target for operations. NOT for: creating CRM tasks (crm_task_create); managing automations (manage_automations).',
    handler: 'module:objectives',
    category: 'automation',
    scope: 'internal',
    requires_approval: false,
    instructions: `## create_objective
### What
Creates a new high-level objective for FlowPilot's autonomous operation.
### When to use
- Admin defines a new business goal
- Heartbeat identifies a gap that needs a structured plan
- System integrity issues require a tracked fix
### Parameters
- **goal**: Required. Clear, measurable goal text.
- **constraints**: Optional guardrails (e.g., no_destructive_actions, deadline, max budget).
- **success_criteria**: Optional measurable criteria for completion.
### Edge cases
- Check existing objectives first to avoid duplicates (query agent_objectives table).
- Objectives drive heartbeat behavior — be specific in goal text.
- Keep active objectives to <5 to maintain focus.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'create_objective',
        description: 'Create a new high-level objective for FlowPilot to work toward. Use when: defining a new strategic goal; initiating a new project; setting a long-term target for operations. NOT for: creating CRM tasks (crm_task_create); managing automations (manage_automations).',
        parameters: {
          type: 'object',
          properties: {
            goal: { type: 'string', description: 'The objective goal text' },
            constraints: { type: 'object', description: 'Guardrails for the objective' },
            success_criteria: { type: 'object', description: 'How to measure completion' },
          },
          required: ['goal'],
        },
      },
    },
  },
  {
    name: 'search_web',
    description: 'Search the web for information. Supports Firecrawl and Jina providers. Use when: researching a topic; finding current information; answering questions requiring web data. NOT for: scraping a specific URL (scrape_url); fetching login-walled content (browser_fetch).',
    handler: 'edge:web-search',
    category: 'search',
    scope: 'internal',
    requires_approval: false,
    instructions: `# Web Search — Provider Knowledge

## Providers Available
- **Firecrawl** (paid): Premium search quality, includes scraped content from results, best for deep research where you need full page content alongside results. Costs credits per search.
- **Jina Search** (free tier available): Fast, lightweight web search. Free tier has rate limits. Good for quick lookups, trend checks, and simple queries.

## When to Use Which
| Scenario | Provider | Why |
|----------|----------|-----|
| Quick fact check | jina | Free, fast, sufficient |
| Prospect/company research | firecrawl | Richer results with scraped content |
| Content trend research | jina | Volume of searches, cost-efficient |
| Deep competitive analysis | firecrawl | Needs full page content |
| General knowledge lookup | auto | Let the system decide |

## Decision Framework
1. **Default to auto** — the system tries free providers first, then paid
2. **Use preferred_provider='jina'** when you want speed and cost savings
3. **Use preferred_provider='firecrawl'** when result quality and depth matter more than cost
4. If a free search returns poor/empty results, retry with firecrawl before giving up

## Parameters
- query: Search query (required)
- limit: Max results (default 5)
- preferred_provider: 'auto' | 'firecrawl' | 'jina' (default 'auto')`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'search_web',
        description: 'Search the web for information. Supports Firecrawl and Jina providers. Use when: researching a topic; finding current information; answering questions requiring web data. NOT for: scraping a specific URL (scrape_url); fetching login-walled content (browser_fetch).',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            limit: { type: 'number', description: 'Max results (default 5)' },
            preferred_provider: { type: 'string', enum: ['auto', 'firecrawl', 'jina'], description: 'Provider selection: auto (free first), firecrawl (paid, deep), jina (fast, free)' },
          },
          required: ['query'],
        },
      },
    },
  },
  {
    name: 'scrape_url',
    description: 'Scrape a single URL and extract content as markdown. Supports Firecrawl and Jina Reader. Use when: extracting content from a public webpage; converting web pages to markdown; needing text from an accessible URL. NOT for: accessing login-walled sites (browser_fetch); searching multiple pages (search_web).',
    handler: 'edge:web-scrape',
    category: 'search',
    scope: 'internal',
    requires_approval: false,
    instructions: `# Web Scrape — Provider Knowledge

## Providers Available
- **Firecrawl** (paid): Full JS rendering, handles SPAs, dynamic content, anti-bot bypassing. Best for modern web apps, LinkedIn pages, JS-heavy sites. Costs credits per scrape.
- **Jina Reader** (free tier available): Converts URLs to clean markdown. Works great for static content, blogs, documentation, news articles. Free tier has rate limits.

## When to Use Which
| Scenario | Provider | Why |
|----------|----------|-----|
| Blog post / article | jina | Free, clean markdown output |
| LinkedIn page | firecrawl | Needs JS rendering + anti-bot |
| Documentation page | jina | Static content, free is fine |
| SPA / dynamic web app | firecrawl | JS rendering required |
| Company about page | auto | Try free first |
| Landing page analysis | firecrawl | Better at extracting full layout |

## Decision Framework
1. **Default to auto** — tries free first, falls back to paid
2. **Use preferred_provider='jina'** for static content (blogs, docs, news)
3. **Use preferred_provider='firecrawl'** for JS-heavy sites, SPAs, LinkedIn, or when jina returns empty/garbage
4. If content looks truncated or broken, retry with firecrawl

## Parameters
- url: URL to scrape (required)
- max_length: Max content length in chars (default 10000)
- preferred_provider: 'auto' | 'firecrawl' | 'jina' (default 'auto')`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'scrape_url',
        description: 'Scrape a single URL and extract content as markdown. Supports Firecrawl and Jina Reader. Use when: extracting content from a public webpage; converting web pages to markdown; needing text from an accessible URL. NOT for: accessing login-walled sites (browser_fetch); searching multiple pages (search_web).',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'URL to scrape' },
            max_length: { type: 'number', description: 'Max content chars (default 10000)' },
            preferred_provider: { type: 'string', enum: ['auto', 'firecrawl', 'jina'], description: 'Provider: auto (free first), firecrawl (JS rendering, paid), jina (fast, free)' },
          },
          required: ['url'],
        },
      },
    },
  },
  {
    name: 'migrate_url',
    description: 'Migrate an external webpage into FlowWink-ready blocks with brand extraction and page discovery. Use when: user pastes a URL to migrate, importing content from an external website, rebuilding an existing site in FlowWink. NOT for: creating pages from scratch (use manage_page), adding blocks manually (use create_page_block), scraping for data extraction only (use scrape_url).',
    handler: 'edge:migrate-page',
    category: 'content',
    scope: 'internal',
    requires_approval: false,
    instructions: `# Website Migration — Multi-Step Orchestration

## CRITICAL RULE
After calling migrate_url, you MUST IMMEDIATELY call manage_page with the returned blocks.
Do NOT only summarize or ask follow-up if page creation has not happened yet.

## Flow (execute tools, don't just describe)
1. Call migrate_url with URL
2. Call manage_page with action='create' using returned title + blocks
3. Confirm page created (capture page_id/slug)
4. Offer to migrate discovered otherPages

## Required behavior
- If migrate_url returns blocks: create page directly
- If migrate_url returns otherPages: list them and ask if user wants bulk migration
- Preserve source language unless user asks otherwise
- Never fabricate blocks; use extracted content only`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'migrate_url',
        description: 'Migrate an external webpage into FlowWink-ready blocks with brand extraction and page discovery. Use when: user pastes a URL to migrate, importing content from an external website, rebuilding an existing site in FlowWink. NOT for: creating pages from scratch (use manage_page), adding blocks manually (use create_page_block), scraping for data extraction only (use scrape_url).',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'The full URL to migrate (e.g. https://example.com)' },
            pageType: { type: 'string', enum: ['page', 'blog', 'kb'], description: 'Target page type (default: page)' },
            slug: { type: 'string', description: 'Optional target slug override' },
            title: { type: 'string', description: 'Optional target title override' },
          },
          required: ['url'],
        },
      },
    },
  },
  {
    name: 'lookup_order',
    description: 'Look up order status by order ID or customer email. Use when: a customer inquires about their order; verifying order progress; retrieving order details for support. NOT for: managing orders (manage_orders); browsing products (browse_products).',
    handler: 'module:orders',
    category: 'crm',
    scope: 'both',
    requires_approval: false,
    instructions: `## lookup_order
### What
Looks up order status by order ID or customer email.
### When to use
- Visitor asks about their order status in chat
- Admin needs to check a specific order
- CRM workflow needs order context
### Parameters
- **order_id**: Direct lookup by UUID.
- **email**: Lookup all orders for a customer email.
- At least one parameter should be provided.
### Edge cases
- Returns multiple orders when searching by email — present the most recent first.
- Sensitive data: only share order details with the order owner in visitor chat.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'lookup_order',
        description: 'Look up order status by order ID or customer email. Use when: a customer inquires about their order; verifying order progress; retrieving order details for support. NOT for: managing orders (manage_orders); browsing products (browse_products).',
        parameters: {
          type: 'object',
          properties: {
            order_id: { type: 'string', description: 'Order ID' },
            email: { type: 'string', description: 'Customer email' },
          },
        },
      },
    },
  },
  {
    name: 'qualify_lead',
    description: 'AI-powered lead qualification and scoring. Analyzes lead activities, company data, and engagement to produce a score and summary. Use when: evaluating a lead quality; automating lead scoring; prioritizing sales pipeline. NOT for: adding new leads (add_lead); managing lead records (manage_leads).',
    handler: 'edge:qualify-lead',
    category: 'crm',
    scope: 'internal',
    requires_approval: false,
    instructions: `## qualify_lead
### What
AI-powered lead qualification that analyzes activities, company data, and engagement to produce a score and summary.
### When to use
- New lead enters the CRM (can be triggered by automation on lead.created signal)
- Admin asks to evaluate/score a lead
- Before creating a deal from a lead
### Parameters
- **leadId**: Required. The lead UUID to qualify.
### Edge cases
- Requires AI provider to be configured. Falls back gracefully if unavailable.
- Score is 0-100. Save the result for future reference.
- Chain with enrich_company if the lead has a company domain.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'qualify_lead',
        description: 'AI-powered lead qualification and scoring. Analyzes lead activities, company data, and engagement to produce a score and summary. Use when: evaluating a lead quality; automating lead scoring; prioritizing sales pipeline. NOT for: adding new leads (add_lead); managing lead records (manage_leads).',
        parameters: {
          type: 'object',
          properties: {
            leadId: { type: 'string', description: 'The lead UUID to qualify' },
          },
          required: ['leadId'],
        },
      },
    },
  },
  {
    name: 'enrich_company',
    description: 'Enrich a company record with industry, size, website info via domain scraping and AI analysis. Use when: needing more details about a prospect; automatically populating company data; improving lead scoring. NOT for: researching individual prospects (prospect_research); basic company CRUD (manage_company).',
    handler: 'edge:enrich-company',
    category: 'crm',
    scope: 'internal',
    requires_approval: false,
    instructions: `## enrich_company
### What
Enriches a company record with industry, size, website info via domain scraping and AI analysis.
### When to use
- New company created in CRM with only a name/domain
- Admin asks to research a company
- Part of prospect_research pipeline
### Parameters
- **companyId**: Company UUID from the database.
- **domain**: Company domain (e.g., acme.com). Used for scraping.
### Edge cases
- Requires either companyId or domain. Both is ideal.
- Domain scraping may fail for very small companies or blocked sites.
- Results are saved directly to the company record.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'enrich_company',
        description: 'Enrich a company record with industry, size, website info via domain scraping and AI analysis. Use when: needing more details about a prospect; automatically populating company data; improving lead scoring. NOT for: researching individual prospects (prospect_research); basic company CRUD (manage_company).',
        parameters: {
          type: 'object',
          properties: {
            companyId: { type: 'string', description: 'Company UUID' },
            domain: { type: 'string', description: 'Company domain (e.g. acme.com)' },
          },
        },
      },
    },
  },
  {
    name: 'research_content',
    description: 'Deep AI research on a topic — audience insights, content angles, hooks, competitive landscape, and recommended structure. Use when: planning content strategy; understanding a topic before writing; needing competitive analysis. NOT for: writing a blog post (write_blog_post); generating multi-channel content (generate_content_proposal).',
    handler: 'db:content_research',
    category: 'content',
    scope: 'internal',
    requires_approval: false,
    instructions: `## research_content
### What
Deep AI research on a topic — audience insights, content angles, hooks, competitive landscape, and recommended structure.
### When to use
- First step in content pipeline before writing
- Admin asks for topic research or content ideas
- Autonomous content planning during heartbeat
### Parameters
- **topic**: Required. The subject to research.
- **target_audience**: Optional but improves relevance significantly.
- **industry**: Optional context for industry-specific insights.
- **target_channels**: Required. Array of channels: 'blog', 'newsletter', 'linkedin', 'x'.
### Edge cases
- AI-intensive operation — costs tokens. Use judiciously in autonomous mode.
- Chain: research_content → generate_content_proposal → write_blog_post.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'research_content',
        description: 'Deep AI research on a topic — audience insights, content angles, hooks, competitive landscape, and recommended structure. Use when: planning content strategy; understanding a topic before writing; needing competitive analysis. NOT for: writing a blog post (write_blog_post); generating multi-channel content (generate_content_proposal).',
        parameters: {
          type: 'object',
          properties: {
            topic: { type: 'string', description: 'Topic to research' },
            target_audience: { type: 'string', description: 'Target audience description' },
            industry: { type: 'string', description: 'Industry context' },
            target_channels: { type: 'array', items: { type: 'string' }, description: 'Channels: blog, newsletter, linkedin, x' },
          },
          required: ['topic', 'target_channels'],
        },
      },
    },
  },
  {
    name: 'generate_content_proposal',
    description: 'Generate multi-channel content (blog, newsletter, LinkedIn, X) from a topic with brand voice and tone control. Use when: a user requests new content for multiple platforms; needing a content strategy for a given topic; planning a campaign that spans several channels. NOT for: writing a single blog post draft (write_blog_post); performing deep research on a topic (research_content).',
    handler: 'db:content_proposals',
    category: 'content',
    scope: 'internal',
    requires_approval: true,
    instructions: `## generate_content_proposal
### What
Generates multi-channel content (blog, newsletter, LinkedIn, X) from a topic with brand voice control. Requires approval.
### When to use
- After research_content, to create actual content drafts
- Admin requests content for multiple channels
- Content pipeline workflow step
### Parameters
- **topic**: Required. Content topic or brief.
- **target_channels**: Required. Array: 'blog', 'newsletter', 'linkedin', 'x'.
- **brand_voice**: Optional. Description of brand voice.
- **tone_level**: 1-5 (1=formal, 5=casual). Default 3.
### Edge cases
- Requires approval before content is published.
- Output includes variants for each channel — review before publishing.
- If brand voice is not set, reads from soul document.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'generate_content_proposal',
        description: 'Generate multi-channel content (blog, newsletter, LinkedIn, X) from a topic with brand voice and tone control. Use when: a user requests new content for multiple platforms; needing a content strategy for a given topic; planning a campaign that spans several channels. NOT for: writing a single blog post draft (write_blog_post); performing deep research on a topic (research_content).',
        parameters: {
          type: 'object',
          properties: {
            topic: { type: 'string', description: 'Content topic' },
            target_channels: { type: 'array', items: { type: 'string' }, description: 'Channels: blog, newsletter, linkedin, x' },
            brand_voice: { type: 'string', description: 'Brand voice description' },
            target_audience: { type: 'string', description: 'Target audience' },
            tone_level: { type: 'number', description: '1-5 (1=formal, 5=casual)' },
            industry: { type: 'string', description: 'Industry context' },
          },
          required: ['topic', 'target_channels'],
        },
      },
    },
  },
  {
    name: 'prospect_research',
    description: 'Research a company — scrape website, find contacts via Hunter.io, analyze with AI. Use when: preparing for outreach; gathering intelligence on a prospect; building a company profile from scratch. NOT for: enriching existing company records (enrich_company); managing companies (manage_company).',
    handler: 'edge:prospect-research',
    category: 'crm',
    scope: 'internal',
    requires_approval: false,
    instructions: `## prospect_research
### What
Researches a company — scrapes website, finds contacts via Hunter.io, analyzes with AI.
### When to use
- Admin asks to research a prospect or potential client
- Sales pipeline: identify decision makers at a company
- Before creating a deal or outreach campaign
### Parameters
- **company_name**: Required. The company to research.
- **company_url**: Optional but strongly recommended for better results.
### Edge cases
- Hunter.io API key required for contact discovery. Without it, only website analysis is returned.
- Chain: prospect_research → qualify_lead → manage_deal (create).`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'prospect_research',
        description: 'Research a company — scrape website, find contacts via Hunter.io, analyze with AI. Use when: preparing for outreach; gathering intelligence on a prospect; building a company profile from scratch. NOT for: enriching existing company records (enrich_company); managing companies (manage_company).',
        parameters: {
          type: 'object',
          properties: {
            company_name: { type: 'string', description: 'Company name' },
            company_url: { type: 'string', description: 'Company website URL' },
          },
          required: ['company_name'],
        },
      },
    },
  },
  {
    name: 'prospect_fit_analysis',
    description: 'Analyze how well a prospect company fits your ideal customer profile. Use when: evaluating a new prospect; scoring company fit before outreach; comparing prospects against ICP criteria. NOT for: researching a company (prospect_research); enriching company data (enrich_company).',
    handler: 'edge:prospect-fit-analysis',
    category: 'crm',
    scope: 'internal',
    requires_approval: false,
    instructions: `## prospect_fit_analysis
### What
Analyzes how well a prospect company fits your ideal customer profile using AI.
### When to use
- After prospect_research, to score the fit
- Admin asks "is this a good prospect?"
- Lead prioritization workflows
### Parameters
- **company_id**: UUID from companies table. Preferred.
- **company_name**: Fallback if no UUID.
### Edge cases
- Works best when the company has been enriched first (enrich_company).
- Returns a fit score and reasoning — use for deal prioritization.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'prospect_fit_analysis',
        description: 'Analyze how well a prospect company fits your ideal customer profile. Use when: evaluating a new prospect; scoring company fit before outreach; comparing prospects against ICP criteria. NOT for: researching a company (prospect_research); enriching company data (enrich_company).',
        parameters: {
          type: 'object',
          properties: {
            company_id: { type: 'string', description: 'Company UUID from database' },
            company_name: { type: 'string', description: 'Company name (if no ID)' },
          },
        },
      },
    },
  },
  {
    name: 'weekly_business_digest',
    description: 'Generate a cross-module business summary covering views, leads, bookings, orders, posts, newsletters. Use when: weekly business review; executive summary needed; monitoring overall business health. NOT for: analyzing specific analytics (analyze_analytics); learning from data (learn_from_data).',
    handler: 'db:agent_activity',
    category: 'analytics',
    scope: 'internal',
    requires_approval: false,
    instructions: `## weekly_business_digest
### What
Generates a cross-module business summary covering views, leads, bookings, orders, posts, and newsletters.
### When to use
- Automated: runs via cron every Friday at 16:00 UTC
- Admin asks for a business summary or report
- Heartbeat needs performance context
### Parameters
- **period**: 'day', 'week', 'month'. Default 'week'.
- **format**: 'structured' (JSON) or 'markdown'. Default 'structured'.
### Edge cases
- Returns zeros for modules that have no data — this is normal for new sites.
- Can be heavy on DB queries — avoid running more than once per hour.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'weekly_business_digest',
        description: 'Generate a cross-module business summary covering views, leads, bookings, orders, posts, newsletters. Use when: weekly business review; executive summary needed; monitoring overall business health. NOT for: analyzing specific analytics (analyze_analytics); learning from data (learn_from_data).',
        parameters: {
          type: 'object',
          properties: {
            period: { type: 'string', enum: ['day', 'week', 'month'], description: 'Report period' },
            format: { type: 'string', enum: ['structured', 'markdown'], description: 'Output format' },
          },
        },
      },
    },
  },
  {
    name: 'publish_scheduled_content',
    description: 'Check and publish pages and blog posts that are due for scheduled publishing. Use when: automated publish cycle runs; checking if any content is ready to go live; processing scheduled content queue. NOT for: manually publishing a specific page (manage_page); writing new blog posts (write_blog_post).',
    handler: 'edge:publish-scheduled-pages',
    category: 'content',
    scope: 'internal',
    requires_approval: false,
    instructions: `## publish_scheduled_content
### What
Checks and publishes pages and blog posts that have passed their scheduled publish date.
### When to use
- Runs automatically via cron (every minute)
- Rarely called manually — the automation handles it
### Parameters
- None required.
### Edge cases
- Idempotent — safe to call multiple times.
- Only publishes content with status='scheduled' and scheduled_at <= now().`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'publish_scheduled_content',
        description: 'Check and publish pages and blog posts that are due for scheduled publishing. Use when: automated publish cycle runs; checking if any content is ready to go live; processing scheduled content queue. NOT for: manually publishing a specific page (manage_page); writing new blog posts (write_blog_post).',
        parameters: { type: 'object', properties: {} },
      },
    },
  },
  {
    name: 'scan_gmail_inbox',
    description: 'Scan connected Gmail inbox for business signals — new leads, partnership inquiries, support requests. Use when: identifying incoming business opportunities from email; automating email categorization; flagging important emails. NOT for: sending emails (composio_gmail_send); managing leads directly (manage_leads).',
    handler: 'edge:gmail-inbox-scan',
    category: 'communication',
    scope: 'internal',
    requires_approval: false,
    instructions: `## scan_gmail_inbox
### What
Scans connected Gmail inbox for business signals — new leads, partnership inquiries, support requests.
### When to use
- Part of inbox monitoring automation
- Admin asks to check recent emails
- Lead discovery from inbound emails
### Parameters
- **max_messages**: Max messages to scan (default 20).
- **scan_days**: Days back to scan (default 1).
### Edge cases
- Requires Google OAuth connection. Returns error if not connected.
- Only reads — does not send or modify emails.
- Extracts signals: lead info, meeting requests, support needs.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'scan_gmail_inbox',
        description: 'Scan connected Gmail inbox for business signals — new leads, partnership inquiries, support requests. Use when: identifying incoming business opportunities from email; automating email categorization; flagging important emails. NOT for: sending emails (composio_gmail_send); managing leads directly (manage_leads).',
        parameters: {
          type: 'object',
          properties: {
            max_messages: { type: 'number', description: 'Max messages to scan (default 20)' },
            scan_days: { type: 'number', description: 'Days back to scan (default 1)' },
          },
        },
      },
    },
  },
  {
    name: 'execute_newsletter_send',
    description: 'Actually send a prepared newsletter to all confirmed subscribers via email. Use when: newsletter is approved and ready to send; executing a scheduled send; distributing content to subscriber list. NOT for: creating newsletters (manage_newsletters); managing subscribers (manage_newsletter_subscribers).',
    handler: 'edge:newsletter-send',
    category: 'communication',
    scope: 'internal',
    requires_approval: true,
    instructions: `## execute_newsletter_send
### What
Actually sends a prepared newsletter to all confirmed subscribers via email. Requires approval.
### When to use
- After a newsletter has been created and reviewed via manage_newsletters
- NEVER call without explicit admin approval
- Final step in newsletter workflow
### Parameters
- **newsletter_id**: Required. UUID of the newsletter to send.
### Edge cases
- DESTRUCTIVE: Cannot unsend once sent. Always confirm with admin.
- Only sends to confirmed subscribers.
- Check subscriber count before sending to set expectations.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'execute_newsletter_send',
        description: 'Actually send a prepared newsletter to all confirmed subscribers via email. Use when: newsletter is approved and ready to send; executing a scheduled send; distributing content to subscriber list. NOT for: creating newsletters (manage_newsletters); managing subscribers (manage_newsletter_subscribers).',
        parameters: {
          type: 'object',
          properties: {
            newsletter_id: { type: 'string', description: 'Newsletter UUID to send' },
          },
          required: ['newsletter_id'],
        },
      },
    },
  },
  {
    name: 'learn_from_data',
    description: 'Analyze page views, chat feedback, and lead conversions to distill learnings into persistent memory. Use when: heartbeat learning cycle; extracting insights from operational data; building institutional knowledge. NOT for: analyzing analytics directly (analyze_analytics); generating business digests (weekly_business_digest).',
    handler: 'edge:flowpilot-learn',
    category: 'analytics',
    scope: 'internal',
    requires_approval: false,
    instructions: `## learn_from_data
### What
Analyzes page views, chat feedback, and lead conversions to distill learnings into persistent memory.
### When to use
- Runs daily via cron (flowpilot-learn at 03:00)
- Heartbeat reflection phase
- Admin asks "what have you learned?"
### Parameters
- None required.
### Edge cases
- Saves insights to agent_memory with category='context'.
- Idempotent — repeated calls refine rather than duplicate learnings.
- Requires sufficient data to produce meaningful insights.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'learn_from_data',
        description: 'Analyze page views, chat feedback, and lead conversions to distill learnings into persistent memory. Use when: heartbeat learning cycle; extracting insights from operational data; building institutional knowledge. NOT for: analyzing analytics directly (analyze_analytics); generating business digests (weekly_business_digest).',
        parameters: { type: 'object', properties: {} },
      },
    },
  },
  {
    name: 'extract_pdf_text',
    description: 'Extract text content from any PDF document. Uses AI vision to read the PDF and return structured text. Use when: a user uploads a PDF and asks for its content; you need to extract data from a document; converting PDF documents into searchable text. NOT for: browsing web pages (browser_fetch); analyzing images without text.',
    handler: 'edge:extract-pdf-text',
    category: 'content',
    scope: 'internal',
    requires_approval: false,
    instructions: `## When to use
- User attaches a PDF file in chat (you'll see a file URL or storage path)
- User asks to "read", "parse", or "extract" a PDF
- Before creating a consultant profile from a resume PDF

## Chaining
After extracting text from a resume PDF, chain with:
1. Call parse_resume with the extracted text to get structured data
2. Call manage_consultant_profile to save the profile

For non-resume PDFs, return the extracted text directly to the user.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'extract_pdf_text',
        description: 'Extract text content from any PDF document. Uses AI vision to read the PDF and return structured text. Use when: a user uploads a PDF and asks for its content; you need to extract data from a document; converting PDF documents into searchable text. NOT for: browsing web pages (browser_fetch); analyzing images without text.',
        parameters: {
          type: 'object',
          properties: {
            file_url: { type: 'string', description: 'Public URL of the PDF file' },
            storage_path: { type: 'string', description: 'Storage path (bucket/path) of the PDF in media library' },
          },
        },
      },
    },
  },
  // ─── Operator Skills ───────────────────────────────────────────────────────
  {
    name: 'browser_fetch',
    description: 'Fetch content from any URL — auto-picks strategy. For login-walled sites uses Chrome Extension relay; for public URLs uses Firecrawl. PRIMARY tool for reading web pages. Use when: needing content from any webpage; accessing data behind a login; performing web research. NOT for: scraping public URLs only (scrape_url); searching the web (search_web).\'s real browser session, ToS-safe). For public URLs, uses Firecrawl server-side scraping. This is the PRIMARY tool for reading web pages.',
    handler: 'edge:browser-fetch',
    category: 'search',
    scope: 'internal',
    requires_approval: false,
    instructions: `## When to use
- ALWAYS prefer browser_fetch over scrape_url — it handles routing automatically
- User says "fetch/read/check/look at [URL]"
- User asks about someone's LinkedIn post or profile
- You need to read any web page for content creation or research

## How it works
1. You call browser_fetch with a URL
2. If the URL is login-walled (LinkedIn, X, etc.), you'll get back { action: 'relay_required' }
   - The admin panel's Chrome Extension relay handles this automatically
   - The extension opens the page in the user's real browser (their session, their cookies)
   - Content comes back clean — no ToS violation
3. If the URL is public, it goes through Firecrawl (fast server-side scraping)

## Chaining examples
1. "Read Magnus Froste's latest LinkedIn post and write a blog post" →
   search_web (find LinkedIn URL) → browser_fetch (read it via relay) → write_blog_post (IMPORTANT: pass the full blog content in the 'content' field as markdown)
   
## CRITICAL: write_blog_post content
When calling write_blog_post, ALWAYS provide the 'content' parameter with the full blog post body as markdown.
- If you have source material (from browser_fetch, search, etc.), write the blog post yourself based on that material and pass it as 'content'.
- Do NOT call write_blog_post without content — it will create an empty draft.
- The content should be 600-1200 words of well-structured markdown with ## headings and paragraphs.
2. "Summarize this article" → browser_fetch → respond with summary
3. "Research this company" → browser_fetch (their website) → enrich_company

## Important
- For LinkedIn: ALWAYS use browser_fetch, never scrape_url directly
- The relay only works when the admin has the Chrome Extension installed
- If relay fails, the response will include a fallback suggestion
- You can force relay mode with force_relay=true for any URL`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'browser_fetch',
        description: 'Fetch content from any URL — auto-picks strategy. For login-walled sites uses Chrome Extension relay; for public URLs uses Firecrawl. PRIMARY tool for reading web pages. Use when: needing content from any webpage; accessing data behind a login; performing web research. NOT for: scraping public URLs only (scrape_url); searching the web (search_web).',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'The URL to fetch' },
            force_relay: { type: 'boolean', description: 'Force Chrome Extension relay even for public URLs (default false)' },
          },
          required: ['url'],
        },
      },
    },
  },
  // (scrape_url defined above — removed duplicate)
  {
    name: 'process_signal',
    description: 'Process an incoming signal from Chrome extension or external webhook. Analyzes content and determines next actions. Use when: a website event is detected; an external system sends an update; responding to real-time data. NOT for: managing automations (manage_automations); scanning Gmail (scan_gmail_inbox).',
    handler: 'edge:signal-ingest',
    category: 'automation',
    scope: 'internal',
    requires_approval: false,
    instructions: `## Context
Signals arrive from external operators (Chrome extension, webhooks).
They are automatically stored in agent_activity.
This skill is primarily triggered by automations, not directly by users.

## Signal types
- signal: Raw capture for AI processing
- draft: Creates a blog post draft from captured content
- bookmark: Saves to agent memory for future reference`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'process_signal',
        description: 'Process an incoming signal from Chrome extension or external webhook. Analyzes content and determines next actions. Use when: a website event is detected; an external system sends an update; responding to real-time data. NOT for: managing automations (manage_automations); scanning Gmail (scan_gmail_inbox).',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'Source URL' },
            title: { type: 'string', description: 'Page title' },
            content: { type: 'string', description: 'Captured content' },
            note: { type: 'string', description: 'User note' },
            source_type: { type: 'string', enum: ['web', 'linkedin', 'x', 'github', 'reddit', 'youtube'], description: 'Source platform' },
          },
        },
      },
    },
  },
  // ─── Module Administration Skills ──────────────────────────────────────────
  {
    name: 'manage_page',
    description: 'Full page lifecycle management: list, get, create, update, publish, archive, delete, rollback. Use when: creating a new page, publishing a draft, listing all pages, updating page metadata, archiving old content, creating destination page after migrate_url. NOT for: adding/editing individual blocks (use create_page_block or manage_page_blocks), scraping external sites (use migrate_url).',
    handler: 'module:pages',
    category: 'content',
    scope: 'internal',
    requires_approval: false,
    instructions: `## manage_page
### What
Full page lifecycle management: list, get, create, update, publish, archive, delete, rollback.
### When to use
- Admin asks to create, edit, or manage pages
- Content pipeline: create landing pages, update existing content
- Page status changes (publish, archive, schedule)
- Immediately after migrate_url to create the target page before adding blocks
### Parameters
- **action**: Required. One of: list, get, create, update, publish, unpublish, archive, delete, rollback.
- **page_id** or **slug**: Required for most actions except list/create.
- **title**, **content_json**, **meta_json**: For create/update.
### Edge cases
- Delete is soft-delete (archive). Hard delete requires explicit confirmation.
- Rollback restores previous version from page_versions table.
- content_json must be a valid ContentBlock[] array.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_page',
        description: 'Full page lifecycle management: list, get, create, update, publish, archive, delete, rollback. Use when: creating a new page, publishing a draft, listing all pages, updating page metadata, archiving old content, creating destination page after migrate_url. NOT for: adding/editing individual blocks (use create_page_block or manage_page_blocks), scraping external sites (use migrate_url).',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['list', 'get', 'create', 'update', 'publish', 'archive', 'delete', 'rollback'] },
            page_id: { type: 'string', description: 'Page UUID (for get/update/publish/archive/delete/rollback)' },
            slug: { type: 'string', description: 'Page slug (for get or create)' },
            title: { type: 'string', description: 'Page title (for create/update)' },
            status: { type: 'string', description: 'Filter by status (for list)' },
            meta: { type: 'object', description: 'Page meta JSON (for create/update)', properties: {} },
            blocks: {
              type: 'array',
              description: 'Content blocks for create/update. Each block: { id, type, data }. Block types: hero, text, cta, accordion, info-box, two-column, quote, separator, etc.',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', description: 'UUID — use crypto.randomUUID() or any unique string' },
                  type: { type: 'string', description: 'Block type: hero, text, cta, accordion, info-box, two-column, quote, separator, stats, features, form, newsletter' },
                  data: { type: 'object', description: 'Block-specific data. text block: { content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "..." }] }] } }. hero block: { title, subtitle, buttonText, buttonLink }. accordion: { title, items: [{ question, answer }] }. cta: { title, subtitle, buttonText, buttonLink }.', properties: {} },
                },
                required: ['type', 'data'],
              },
            },
          },
          required: ['action'],
        },
      },
    },
  },
  {
    name: 'manage_page_blocks',
    description: 'Manipulate blocks on a page: list, add, update, remove, reorder, duplicate, toggle visibility. Use when: designing a page layout; repositioning elements; showing/hiding specific content blocks. NOT for: managing global site blocks (manage_global_blocks); creating new pages (manage_page).',
    handler: 'module:pages',
    category: 'content',
    scope: 'internal',
    requires_approval: false,
    instructions: `## manage_page_blocks
### What
Granular block-level operations on pages: add, update, remove, reorder blocks.
### When to use
- Admin wants to modify specific blocks on a page without replacing the entire content
- Adding a new section to an existing page
- Reordering page layout
### Parameters
- **action**: Required. One of: add, update, remove, reorder.
- **page_id**: Required. The page to modify.
- **block_id**: Required for update/remove.
- **block_data**: Block object for add/update.
- **position**: Insert position for add.
- **block_ids**: Ordered array for reorder.
### Edge cases
- block_data must match the ContentBlock schema for the block type.
- Reorder requires ALL block_ids in the desired order.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_page_blocks',
        description: 'Manipulate blocks on a page: list, add, update, remove, reorder, duplicate, toggle visibility. Use when: designing a page layout; repositioning elements; showing/hiding specific content blocks. NOT for: managing global site blocks (manage_global_blocks); creating new pages (manage_page).',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['list', 'add', 'update', 'remove', 'reorder', 'duplicate', 'toggle_visibility'] },
            page_id: { type: 'string', description: 'Page UUID' },
            block_id: { type: 'string', description: 'Block UUID (for update/remove/duplicate/toggle)' },
            block_type: { type: 'string', description: 'Block type (for add): text, hero, cta, accordion, info-box, two-column, quote, separator, stats, features, form, newsletter' },
            block_data: {
              type: 'object',
              description: 'Block content data. text: { content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "..." }] }] } }. hero: { title, subtitle, buttonText, buttonLink }. accordion: { title, items: [{ question, answer }] }. cta: { title, subtitle, buttonText, buttonLink }. info-box: { title, content, variant }. two-column: { leftTitle, leftContent, rightTitle, rightContent }.',
              properties: {},
            },
            position: { type: 'number', description: 'Insert position (for add)' },
            block_ids: { type: 'array', items: { type: 'string' }, description: 'Ordered block IDs (for reorder)' },
          },
          required: ['action', 'page_id'],
        },
      },
    },
  },
  {
    name: 'manage_blog_posts',
    description: 'Manage existing blog posts: list, get, update, publish, unpublish, delete. Use when: modifying a blog post; changing publication status; performing bulk operations on blog posts. NOT for: creating a new blog post draft (write_blog_post); browsing visitor-facing posts (browse_blog).',
    handler: 'module:blog',
    category: 'content',
    scope: 'internal',
    requires_approval: false,
    instructions: `## manage_blog_posts
### What
Manages existing blog posts: list, get, update, publish, unpublish, delete.
### When to use
- Admin asks to list, edit, or manage blog posts
- Publishing workflow: review → publish
- Content audits: find drafts, outdated posts
### Parameters
- **action**: Required. list, get, update, publish, unpublish, delete.
- **post_id** or **slug**: For get/update/publish/unpublish/delete.
- **status**: Filter (list) or set (update).
### Edge cases
- Publish sets published_at to now(). Unpublish reverts to draft.
- Use write_blog_post to CREATE new posts, this skill is for MANAGING existing ones.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_blog_posts',
        description: 'Manage existing blog posts: list, get, update, publish, unpublish, delete. Use when: modifying a blog post; changing publication status; performing bulk operations on blog posts. NOT for: creating a new blog post draft (write_blog_post); browsing visitor-facing posts (browse_blog).',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['list', 'get', 'update', 'publish', 'unpublish', 'delete'] },
            post_id: { type: 'string', description: 'Blog post UUID' },
            slug: { type: 'string', description: 'Blog post slug (for get)' },
            status: { type: 'string', description: 'Filter by status (for list)' },
            title: { type: 'string' },
            excerpt: { type: 'string' },
            featured_image: { type: 'string' },
            limit: { type: 'number', description: 'Max results (default 20)' },
          },
          required: ['action'],
        },
      },
    },
  },
  {
    name: 'manage_blog_categories',
    description: 'Manage blog categories and tags: list, create, delete. Use when: organizing blog content into new categories; listing existing blog categories; cleaning up unused tags. NOT for: managing individual blog posts (manage_blog_posts); browsing published blog posts (browse_blog).',
    handler: 'module:blog',
    category: 'content',
    scope: 'internal',
    requires_approval: false,
    instructions: `## manage_blog_categories
### What
Manages blog categories and tags: list, create, delete.
### When to use
- Admin asks to organize blog content with categories/tags
- Before writing posts that need categorization
- Content taxonomy management
### Parameters
- **action**: Required. list_categories, create_category, list_tags, create_tag.
- **name**, **slug**: For creation.
### Edge cases
- Slug must be URL-safe. Auto-generated from name if not provided.
- Deleting a category does not delete associated posts.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_blog_categories',
        description: 'Manage blog categories and tags: list, create, delete. Use when: organizing blog content into new categories; listing existing blog categories; cleaning up unused tags. NOT for: managing individual blog posts (manage_blog_posts); browsing published blog posts (browse_blog).',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['list_categories', 'create_category', 'list_tags', 'create_tag'] },
            name: { type: 'string' },
            slug: { type: 'string' },
            description: { type: 'string' },
          },
          required: ['action'],
        },
      },
    },
  },
  {
    name: 'browse_blog',
    description: 'Browse published blog posts (visitor-facing). Use when: a user asks to see latest blog articles; you need to find existing blog content to link to; displaying content on a public-facing blog page. NOT for: managing blog post drafts (manage_blog_posts); listing blog categories (manage_blog_categories).',
    handler: 'module:blog',
    category: 'content',
    scope: 'both',
    requires_approval: false,
    instructions: `## browse_blog
### What
Browse published blog posts (visitor-facing, read-only).
### When to use
- Visitor asks about blog content in chat
- Need to find published posts for reference
- NOT for admin management (use manage_blog_posts)
### Parameters
- **search**: Optional text search.
- **limit**: Max results, default 5.
### Edge cases
- Only returns published posts. Drafts and scheduled posts are excluded.
- Visitor-safe: no sensitive data exposed.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'browse_blog',
        description: 'Browse published blog posts (visitor-facing). Use when: a user asks to see latest blog articles; you need to find existing blog content to link to; displaying content on a public-facing blog page. NOT for: managing blog post drafts (manage_blog_posts); listing blog categories (manage_blog_categories).',
        parameters: {
          type: 'object',
          properties: {
            search: { type: 'string', description: 'Search term' },
            limit: { type: 'number', description: 'Max results (default 5)' },
          },
        },
      },
    },
  },
  {
    name: 'manage_kb_article',
    description: 'Manage knowledge base articles: list, get, create, update, publish, unpublish. Use when: creating a new support article; updating an existing KB entry; controlling KB content visibility. NOT for: analyzing KB gaps (kb_gap_analysis); managing blog posts (manage_blog_posts).',
    handler: 'module:kb',
    category: 'content',
    scope: 'internal',
    requires_approval: false,
    instructions: `## manage_kb_article
### What
Manages knowledge base articles: list, get, create, update, publish, unpublish.
### When to use
- Admin asks to create or edit FAQ/KB content
- kb_gap_analysis identifies missing topics
- Chat finds questions it can't answer → create KB article
### Parameters
- **action**: Required. list, get, create, update, publish, unpublish.
- **title**, **question**, **answer**: For create/update.
- **include_in_chat**: Boolean — whether the article is used by chat AI.
### Edge cases
- Articles with include_in_chat=true are embedded into chat context.
- Always set a clear question field for chat matching.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_kb_article',
        description: 'Manage knowledge base articles: list, get, create, update, publish, unpublish. Use when: creating a new support article; updating an existing KB entry; controlling KB content visibility. NOT for: analyzing KB gaps (kb_gap_analysis); managing blog posts (manage_blog_posts).',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['list', 'get', 'create', 'update', 'publish', 'unpublish'] },
            article_id: { type: 'string' },
            slug: { type: 'string' },
            title: { type: 'string' },
            question: { type: 'string' },
            answer: { type: 'string' },
            category: { type: 'string' },
            include_in_chat: { type: 'boolean' },
          },
          required: ['action'],
        },
      },
    },
  },
  {
    name: 'manage_global_blocks',
    description: 'Manage global blocks (header, footer, etc): list, get, update, toggle active status. Use when: changing header/footer content; reviewing active global elements; toggling visibility of a global block. NOT for: managing page-specific blocks (manage_page_blocks); updating site branding (site_branding_update).',
    handler: 'module:globalElements',
    category: 'content',
    scope: 'internal',
    requires_approval: false,
    instructions: `## manage_global_blocks
### What
Manages global blocks (header, footer, announcement bar, etc.): list, get, update, toggle.
### When to use
- Admin asks to change header, footer, or site-wide elements
- Branding updates that affect global layout
### Parameters
- **action**: Required. list, get, update, toggle.
- **slot**: Slot name: header, footer, announcement, etc.
- **block_data**: Block configuration object for update.
### Edge cases
- Toggle enables/disables a global block without deleting it.
- Changes affect ALL pages immediately.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_global_blocks',
        description: 'Manage global blocks (header, footer, etc): list, get, update, toggle active status. Use when: changing header/footer content; reviewing active global elements; toggling visibility of a global block. NOT for: managing page-specific blocks (manage_page_blocks); updating site branding (site_branding_update).',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['list', 'get', 'update', 'toggle'] },
            slot: { type: 'string', description: 'Slot name (header, footer, etc.)' },
            block_data: { type: 'object', description: 'Block data for update' },
          },
          required: ['action'],
        },
      },
    },
  },
  {
    name: 'manage_leads',
    description: 'Full lead management: list, get, update status/score, delete leads. Use when: changing lead status; adding follow-up notes; cleaning up unqualified leads. NOT for: adding a new lead (add_lead); qualifying leads with AI (qualify_lead).',
    handler: 'module:crm',
    category: 'crm',
    scope: 'internal',
    requires_approval: false,
    instructions: `## manage_leads
### What
Full lead management: list, get, update status/score, delete.
### When to use
- Admin asks to view or manage CRM leads
- Updating lead status in a sales pipeline
- Bulk operations on leads
### Parameters
- **action**: Required. list, get, update, delete.
- **lead_id**: For get/update/delete.
- **status**: Filter (list) or set (update).
- **score**: Set lead score (update).
- **search**: Text search across name/email.
### Edge cases
- Use add_lead to CREATE new leads. This skill manages EXISTING leads.
- Delete is permanent. Consider archiving instead.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_leads',
        description: 'Full lead management: list, get, update status/score, delete leads. Use when: changing lead status; adding follow-up notes; cleaning up unqualified leads. NOT for: adding a new lead (add_lead); qualifying leads with AI (qualify_lead).',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['list', 'get', 'update', 'delete'] },
            lead_id: { type: 'string' },
            status: { type: 'string', description: 'Filter or set status' },
            score: { type: 'number' },
            search: { type: 'string' },
            limit: { type: 'number', description: 'Max results (default 50)' },
          },
          required: ['action'],
        },
      },
    },
  },
  {
    name: 'manage_deal',
    description: 'Manage deals: list, create, update, move stage. Use when: creating a new sales opportunity; updating deal progress; moving a deal to next pipeline stage. NOT for: managing leads (manage_leads); creating CRM tasks (crm_task_create).',
    handler: 'module:deals',
    category: 'crm',
    scope: 'internal',
    requires_approval: false,
    instructions: `## manage_deal
### What
Manages sales deals: list, create, update, move between stages.
### When to use
- Admin asks to create or manage deals
- Moving deals through the pipeline (lead → proposal → negotiation → won/lost)
- After lead qualification suggests a deal
### Parameters
- **action**: Required. list, create, update, move_stage.
- **lead_id**: Required for create.
- **stage**: Deal stage (for create/update/move_stage).
- **value_cents**: Deal value in cents.
### Edge cases
- Moving to 'won' or 'lost' sets closed_at automatically.
- Deals link to leads and optionally to products.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_deal',
        description: 'Manage deals: list, create, update, move stage. Use when: creating a new sales opportunity; updating deal progress; moving a deal to next pipeline stage. NOT for: managing leads (manage_leads); creating CRM tasks (crm_task_create).',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['list', 'create', 'update', 'move_stage'] },
            deal_id: { type: 'string' },
            value_cents: { type: 'number' },
            stage: { type: 'string' },
            lead_id: { type: 'string' },
            product_id: { type: 'string' },
            expected_close: { type: 'string', description: 'Date YYYY-MM-DD' },
            notes: { type: 'string' },
          },
          required: ['action'],
        },
      },
    },
  },
  {
    name: 'manage_company',
    description: 'Manage companies: list, get, create, update, delete. Use when: adding a new company to CRM; updating company contact info; removing an inactive company. NOT for: enriching company data (enrich_company); prospect research (prospect_research).',
    handler: 'module:companies',
    category: 'crm',
    scope: 'internal',
    requires_approval: false,
    instructions: `## manage_company
### What
Manages CRM companies: list, get, create, update, delete.
### When to use
- Admin asks to manage company records
- Part of prospect research workflow
- Organizing leads by company
### Parameters
- **action**: Required. list, get, create, update, delete.
- **name**: For create. Company name.
- **domain**: Company domain for enrichment.
### Edge cases
- Use enrich_company after creating to auto-fill industry, size, etc.
- Domain should not include http/https prefix.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_company',
        description: 'Manage companies: list, get, create, update, delete. Use when: adding a new company to CRM; updating company contact info; removing an inactive company. NOT for: enriching company data (enrich_company); prospect research (prospect_research).',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['list', 'get', 'create', 'update', 'delete'] },
            company_id: { type: 'string' },
            name: { type: 'string' },
            domain: { type: 'string' },
            industry: { type: 'string' },
            size: { type: 'string' },
            address: { type: 'string' },
            phone: { type: 'string' },
            website: { type: 'string' },
            notes: { type: 'string' },
          },
          required: ['action'],
        },
      },
    },
  },
  {
    name: 'browse_products',
    description: 'Browse the product catalog. Returns active products with prices, images, and stock info. Use when: a customer asks for available products; displaying items for sale; needing product details for an order. NOT for: managing products (manage_product); checking order status (check_order_status).',
    handler: 'module:products',
    category: 'commerce',
    scope: 'both',
    requires_approval: false,
    instructions: `## browse_products
### What
Browse products in the catalog (visitor-facing, read-only).
### When to use
- Visitor asks about products or pricing in chat
- Need product info for recommendations
- NOT for admin management (use manage_product)
### Parameters
- **search**: Optional text search.
- **type**: Filter by type: physical, digital, service.
### Edge cases
- Only returns active products. Archived products excluded.
- Visitor-safe: shows public pricing and descriptions.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'browse_products',
        description: 'Browse the product catalog. Returns active products with prices, images, and stock info. Use when: a customer asks for available products; displaying items for sale; needing product details for an order. NOT for: managing products (manage_product); checking order status (check_order_status).',
        parameters: {
          type: 'object',
          properties: {
            search: { type: 'string' },
            type: { type: 'string', enum: ['physical', 'digital', 'service'] },
          },
        },
      },
    },
  },
  {
    name: 'manage_product',
    description: 'Manage products: create, update, delete, manage variants. Use when: adding a new item to the store; updating product details or pricing; handling product options (size, color). NOT for: managing inventory (manage_inventory); browsing products (browse_products).',
    handler: 'module:products',
    category: 'commerce',
    scope: 'internal',
    requires_approval: false,
    instructions: `## manage_product
### What
Manages products in the catalog: create, update, delete, manage variants.
### When to use
- Admin asks to add or edit products
- E-commerce setup workflows
### Parameters
- **action**: Required. list, get, create, update, delete.
- **name**: Product name (create/update).
- **price_cents**: Price in cents (create/update).
- **description**: Product description.
### Edge cases
- Price is in cents (e.g., 9900 = $99.00 or 99 SEK).
- Use manage_inventory for stock levels.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_product',
        description: 'Manage products: create, update, delete, manage variants. Use when: adding a new item to the store; updating product details or pricing; handling product options (size, color). NOT for: managing inventory (manage_inventory); browsing products (browse_products).',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['list', 'get', 'create', 'update', 'delete'] },
            product_id: { type: 'string' },
            name: { type: 'string' },
            price_cents: { type: 'number' },
            description: { type: 'string' },
          },
          required: ['action'],
        },
      },
    },
  },
  {
    name: 'manage_inventory',
    description: 'Manage product inventory: list stock, update quantities, set low-stock alerts. Use when: adjusting stock levels; setting up low-stock notifications; auditing inventory counts. NOT for: managing product details (manage_product); browsing products (browse_products).',
    handler: 'module:products',
    category: 'commerce',
    scope: 'internal',
    requires_approval: false,
    instructions: `## manage_inventory
### What
Manages product inventory: list stock levels, update quantities, check low-stock alerts.
### When to use
- Admin asks about stock levels
- Automated low-stock alerts
- After order fulfillment
### Parameters
- **action**: Required. list_stock, update_stock, low_stock.
- **product_id**: For update_stock.
- **quantity**: New stock quantity.
- **threshold**: Low stock threshold (default 5).
### Edge cases
- low_stock action returns all products below threshold.
- Stock can go negative if not checked before order.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_inventory',
        description: 'Manage product inventory: list stock, update quantities, set low-stock alerts. Use when: adjusting stock levels; setting up low-stock notifications; auditing inventory counts. NOT for: managing product details (manage_product); browsing products (browse_products).',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['list_stock', 'update_stock', 'low_stock'] },
            product_id: { type: 'string' },
            quantity: { type: 'number' },
            threshold: { type: 'number', description: 'Low stock threshold (default 5)' },
          },
          required: ['action'],
        },
      },
    },
  },
  {
    name: 'manage_orders',
    description: 'Manage orders: list, get details, update status, view stats. Use when: reviewing customer orders; changing fulfillment status; analyzing sales trends. NOT for: checking status by ID (check_order_status); browsing products (browse_products).',
    handler: 'module:orders',
    category: 'commerce',
    scope: 'internal',
    requires_approval: false,
    instructions: `## manage_orders
### What
Manages e-commerce orders: list, get details, update status, view stats.
### When to use
- Admin asks about orders or order status
- Order fulfillment workflow
- Business reporting (order stats)
### Parameters
- **action**: Required. list, get, update_status, stats.
- **order_id**: For get/update_status.
- **status**: New status for update_status.
- **period**: For stats: today, week, month, quarter.
### Edge cases
- Status transitions: pending → processing → shipped → delivered.
- Stats action returns aggregated revenue and order counts.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_orders',
        description: 'Manage orders: list, get details, update status, view stats. Use when: reviewing customer orders; changing fulfillment status; analyzing sales trends. NOT for: checking status by ID (check_order_status); browsing products (browse_products).',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['list', 'get', 'update_status', 'stats'] },
            order_id: { type: 'string' },
            status: { type: 'string' },
            period: { type: 'string', enum: ['today', 'week', 'month', 'quarter'] },
            limit: { type: 'number' },
          },
          required: ['action'],
        },
      },
    },
  },
  {
    name: 'check_availability',
    description: 'Check booking availability for a specific date. Use when: a customer wants to know if a slot is open; determining if a service can be booked; verifying potential appointment times. NOT for: creating a booking (book_appointment); managing availability settings (manage_booking_availability).',
    handler: 'module:booking',
    category: 'crm',
    scope: 'both',
    requires_approval: false,
    instructions: `## check_availability
### What
Checks booking availability for a specific date.
### When to use
- Visitor asks about available times in chat
- Before calling book_appointment
- Calendar management
### Parameters
- **date**: Required. Date in YYYY-MM-DD format.
- **service_id**: Optional. Filter by specific service.
### Edge cases
- Returns available time slots based on booking_availability hours minus existing bookings.
- Respects blocked dates from booking_blocked_dates.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'check_availability',
        description: 'Check booking availability for a specific date. Use when: a customer wants to know if a slot is open; determining if a service can be booked; verifying potential appointment times. NOT for: creating a booking (book_appointment); managing availability settings (manage_booking_availability).',
        parameters: {
          type: 'object',
          properties: {
            date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
            service_id: { type: 'string', description: 'Optional service filter' },
          },
          required: ['date'],
        },
      },
    },
  },
  {
    name: 'browse_services',
    description: 'List available booking services. Use when: a user asks what services are offered; displaying service options; selecting a service for booking. NOT for: checking availability (check_availability); managing booking settings (manage_booking_availability).',
    handler: 'module:booking',
    category: 'crm',
    scope: 'both',
    requires_approval: false,
    instructions: `## browse_services
### What
Lists available booking services (visitor-facing).
### When to use
- Visitor asks what services are available
- Before booking to let visitor choose a service
### Parameters
- None required.
### Edge cases
- Only returns active services (is_active=true).
- Includes price and duration information.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'browse_services',
        description: 'List available booking services. Use when: a user asks what services are offered; displaying service options; selecting a service for booking. NOT for: checking availability (check_availability); managing booking settings (manage_booking_availability).',
        parameters: { type: 'object', properties: {} },
      },
    },
  },
  {
    name: 'manage_booking_availability',
    description: 'Manage booking hours and blocked dates. Use when: setting up service availability; blocking holiday dates; adjusting operating hours. NOT for: checking availability (check_availability); creating bookings (book_appointment).',
    handler: 'module:booking',
    category: 'crm',
    scope: 'internal',
    requires_approval: false,
    instructions: `## manage_booking_availability
### What
Manages booking hours and blocked dates for the scheduling system.
### When to use
- Admin sets business hours
- Admin blocks dates for holidays/vacations
- Schedule configuration changes
### Parameters
- **action**: Required. list_hours, set_hours, block_date, unblock_date, list_blocked.
- **day_of_week**: 0-6 (0=Sunday) for set_hours.
- **start_time**, **end_time**: HH:MM format.
- **date**: YYYY-MM-DD for block/unblock.
### Edge cases
- Setting hours replaces existing hours for that day.
- Blocked dates override availability hours.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_booking_availability',
        description: 'Manage booking hours and blocked dates. Use when: setting up service availability; blocking holiday dates; adjusting operating hours. NOT for: checking availability (check_availability); creating bookings (book_appointment).',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['list_hours', 'set_hours', 'block_date', 'unblock_date', 'list_blocked'] },
            day_of_week: { type: 'number', description: '0=Sunday, 6=Saturday' },
            start_time: { type: 'string', description: 'HH:MM format' },
            end_time: { type: 'string', description: 'HH:MM format' },
            date: { type: 'string', description: 'Date for blocking (YYYY-MM-DD)' },
            reason: { type: 'string' },
          },
          required: ['action'],
        },
      },
    },
  },
  {
    name: 'manage_bookings',
    description: 'List, view, update or cancel bookings. Use when: reviewing scheduled appointments; modifying a booking time; cancelling an appointment. NOT for: managing availability settings (manage_booking_availability); browsing services (browse_services).',
    handler: 'module:booking',
    category: 'crm',
    scope: 'internal',
    requires_approval: false,
    instructions: `## manage_bookings
### What
Lists, views, updates, or cancels bookings.
### When to use
- Admin manages appointments
- Booking status updates (confirm, cancel)
- Calendar overview
### Parameters
- **action**: Required. list, get, update_status, cancel.
- **booking_id**: For get/update_status/cancel.
- **period**: Filter: today, week, month.
### Edge cases
- Cancel sends a cancellation email to the customer.
- Cancelled bookings free up the time slot.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_bookings',
        description: 'List, view, update or cancel bookings. Use when: reviewing scheduled appointments; modifying a booking time; cancelling an appointment. NOT for: managing availability settings (manage_booking_availability); browsing services (browse_services).',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['list', 'get', 'update_status', 'cancel'] },
            booking_id: { type: 'string' },
            status: { type: 'string' },
            period: { type: 'string', enum: ['today', 'week', 'month'] },
            limit: { type: 'number' },
          },
          required: ['action'],
        },
      },
    },
  },
  {
    name: 'manage_newsletter_subscribers',
    description: 'Manage newsletter subscribers: list, search, count, remove. Use when: reviewing subscriber list; finding a specific subscriber; removing unsubscribed users. NOT for: sending newsletters (execute_newsletter_send); creating newsletter content (manage_newsletters).',
    handler: 'module:newsletter',
    category: 'communication',
    scope: 'internal',
    requires_approval: false,
    instructions: `## manage_newsletter_subscribers
### What
Manages newsletter subscribers: list, search, count, remove.
### When to use
- Admin asks about subscriber count or list
- Before sending newsletters (verify audience)
- Unsubscribe requests
### Parameters
- **action**: Required. list, search, count, remove.
- **search**: Text search across email/name.
- **email**: Specific email for remove.
### Edge cases
- Remove is permanent. No undo.
- Count is useful before newsletter sends to set expectations.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_newsletter_subscribers',
        description: 'Manage newsletter subscribers: list, search, count, remove. Use when: reviewing subscriber list; finding a specific subscriber; removing unsubscribed users. NOT for: sending newsletters (execute_newsletter_send); creating newsletter content (manage_newsletters).',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['list', 'search', 'count', 'remove'] },
            search: { type: 'string' },
            status: { type: 'string' },
            email: { type: 'string' },
            limit: { type: 'number' },
          },
          required: ['action'],
        },
      },
    },
  },
  {
    name: 'manage_newsletters',
    description: 'Manage newsletters: list, get, create, update, delete. Full CRUD on newsletter drafts and scheduled sends. Use when: creating a new newsletter campaign; editing planned newsletter content; deleting an outdated newsletter. NOT for: sending a newsletter (execute_newsletter_send); managing subscribers (manage_newsletter_subscribers).',
    handler: 'module:newsletter',
    category: 'content',
    scope: 'internal',
    requires_approval: false,
    trust_level: 'notify',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_newsletters',
        description: 'Manage newsletters: list, get, create, update, delete. Full CRUD on newsletter drafts and scheduled sends. Use when: creating a new newsletter campaign; editing planned newsletter content; deleting an outdated newsletter. NOT for: sending a newsletter (execute_newsletter_send); managing subscribers (manage_newsletter_subscribers).',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['list', 'get', 'create', 'update', 'delete'] },
            newsletter_id: { type: 'string', description: 'Newsletter UUID (for get/update/delete)' },
            subject: { type: 'string', description: 'Newsletter subject line' },
            content_html: { type: 'string', description: 'HTML content (optional if topic or blog_content provided)' },
            topic: { type: 'string', description: 'Topic for AI-generated content. Use instead of content_html to auto-generate.' },
            blog_content: { type: 'string', description: 'Blog post text to adapt into newsletter format. Use for blog→newsletter chains.' },
            tone: { type: 'string', description: 'Writing tone (default: professional)' },
            language: { type: 'string', description: 'Content language code (default: en)' },
            status: { type: 'string', description: 'Filter by status (for list) or set status (for update)' },
            schedule_at: { type: 'string', description: 'ISO date to schedule send' },
            limit: { type: 'number', description: 'Max results (default 20)' },
          },
          required: ['action'],
        },
      },
    },
    instructions: `# manage_newsletters

## What
Full CRUD management of newsletters with optional AI content generation.

## When
- User asks to create, edit, list, or delete newsletters
- As part of a content campaign chain (research → blog → newsletter → social)
- When FlowPilot autonomously creates newsletter drafts from content

## AI Generation (create action)
Three modes for creating newsletters:
1. **From topic**: Pass \`topic\` — AI generates full newsletter HTML automatically
2. **From blog**: Pass \`blog_content\` — AI adapts the blog text into email format
3. **Manual**: Pass \`content_html\` directly (bypasses AI)

Priority: content_html > blog_content > topic

## Actions
| Action | Required fields | Result |
|--------|----------------|--------|
| list   | (optional: status, limit) | Array of newsletters with metrics |
| get    | newsletter_id  | Full newsletter with content |
| create | subject + (topic OR blog_content OR content_html) | New draft newsletter |
| update | newsletter_id + fields | Updated newsletter |
| delete | newsletter_id  | Deleted newsletter |

## Chaining Example
\`\`\`
write_blog_post(topic="AI trends") → get excerpt → manage_newsletters(action=create, subject="This Week: AI Trends", blog_content=excerpt)
\`\`\`

## Edge Cases
- Always create as 'draft' unless schedule_at is provided
- Use execute_newsletter_send to actually send (separate skill with approval gate)
- AI generation requires GEMINI_API_KEY or OPENAI_API_KEY`,
  },
  {
    name: 'manage_consultant_profile',
    description: 'Manage consultant/resume profiles: list, create, update, delete, deduplicate. Use when: adding a new consultant; updating skills or availability; cleaning up duplicate entries. NOT for: matching consultants to jobs (match_consultant); managing company profiles (manage_company).',
    handler: 'module:resume',
    category: 'content',
    scope: 'internal',
    requires_approval: false,
    instructions: `## manage_consultant_profile
### What
Manages consultant/resume profiles: list, create, update, delete, find duplicates.
### When to use
- Admin uploads a resume → extract_pdf_text → parse_resume → manage_consultant_profile(create)
- Editing consultant information
- Finding duplicate profiles
### Parameters
- **action**: Required. list, create, update, delete, find_duplicates.
- **name**, **title**, **skills**, **bio**: For create/update.
### Edge cases
- find_duplicates uses name similarity to detect potential duplicates.
- Chain: extract_pdf_text → parse structured data → create profile.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_consultant_profile',
        description: 'Manage consultant/resume profiles: list, create, update, delete, deduplicate. Use when: adding a new consultant; updating skills or availability; cleaning up duplicate entries. NOT for: matching consultants to jobs (match_consultant); managing company profiles (manage_company).',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['list', 'create', 'update', 'delete', 'find_duplicates'] },
            profile_id: { type: 'string' },
            name: { type: 'string' },
            title: { type: 'string' },
            skills: { type: 'array', items: { type: 'string' } },
            bio: { type: 'string' },
            experience_years: { type: 'number' },
          },
          required: ['action'],
        },
      },
    },
  },
  {
    name: 'match_consultant',
    description: 'Match consultants to a job description using AI. Use when: finding suitable candidates for an open position; a user provides a job description and needs recommendations; identifying best-fit consultants. NOT for: managing consultant profiles (manage_consultant_profile); researching companies (prospect_research).',
    handler: 'module:resume',
    category: 'content',
    scope: 'internal',
    requires_approval: false,
    instructions: `## match_consultant
### What
AI-powered matching of consultants to a job description.
### When to use
- Client has a job opening and needs consultant recommendations
- Admin asks "who is best for this project?"
- Automated matching in recruitment workflows
### Parameters
- **job_description**: Required. Full job requirements text.
- **max_results**: Max matches to return (default 3).
### Edge cases
- Works best with enriched profiles (skills, experience, bio).
- Returns ranked matches with match reasoning.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'match_consultant',
        description: 'Match consultants to a job description using AI. Use when: finding suitable candidates for an open position; a user provides a job description and needs recommendations; identifying best-fit consultants. NOT for: managing consultant profiles (manage_consultant_profile); researching companies (prospect_research).',
        parameters: {
          type: 'object',
          properties: {
            job_description: { type: 'string', description: 'Job requirements text' },
            max_results: { type: 'number', description: 'Max matches (default 3)' },
          },
          required: ['job_description'],
        },
      },
    },
  },
  {
    name: 'media_browse',
    description: 'Browse, search, and manage media files in the media library. Supports listing, getting URLs, deleting files, and clearing library. Use when: finding an uploaded image; managing media assets; cleaning up unused files. NOT for: uploading new files (N/A); updating site branding logo (site_branding_update).',
    handler: 'module:media',
    category: 'content',
    scope: 'internal',
    requires_approval: false,
    instructions: `## media_browse
### What
Browse, search, and manage files in the media library.
### When to use
- Admin asks about uploaded images or files
- Need to find a specific media file URL
- Cleanup: delete unused media
### Parameters
- **action**: Required. list, get_url, delete, clear_all.
- **folder**: Folder filter: pages, imports, templates, uploads, blog.
- **search**: Search by filename.
- **file_path**: For delete/get_url.
### Edge cases
- clear_all is DESTRUCTIVE. Requires confirmation.
- get_url returns a signed URL for temporary access.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'media_browse',
        description: 'Browse, search, and manage media files in the media library. Supports listing, getting URLs, deleting files, and clearing library. Use when: finding an uploaded image; managing media assets; cleaning up unused files. NOT for: uploading new files (N/A); updating site branding logo (site_branding_update).',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['list', 'get_url', 'delete', 'clear_all'] },
            folder: { type: 'string', description: 'Folder to browse (pages, imports, templates, uploads, blog)' },
            search: { type: 'string', description: 'Search by filename' },
            file_path: { type: 'string', description: 'File path for delete/get_url' },
          },
          required: ['action'],
        },
      },
    },
  },
  {
    name: 'manage_form_submissions',
    description: 'View and manage form submissions. Use when: reviewing customer inquiries from website forms; processing collected data; deleting spam submissions. NOT for: analyzing feedback sentiment (analyze_chat_feedback); managing leads (manage_leads).',
    handler: 'module:forms',
    category: 'crm',
    scope: 'internal',
    requires_approval: false,
    instructions: `## manage_form_submissions
### What
Views and manages form submissions from website forms.
### When to use
- Admin asks about form responses
- Lead generation: review contact form submissions
- Analytics: form submission statistics
### Parameters
- **action**: Required. list, get, delete, stats.
- **form_name**: Filter by form name.
### Edge cases
- Form submissions may contain PII — handle with care.
- Stats action returns submission counts by form.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_form_submissions',
        description: 'View and manage form submissions. Use when: reviewing customer inquiries from website forms; processing collected data; deleting spam submissions. NOT for: analyzing feedback sentiment (analyze_chat_feedback); managing leads (manage_leads).',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['list', 'get', 'delete', 'stats'] },
            submission_id: { type: 'string' },
            form_name: { type: 'string' },
            limit: { type: 'number' },
          },
          required: ['action'],
        },
      },
    },
  },
  {
    name: 'manage_webinar',
    description: 'Manage webinars and registrations. Use when: setting up a new webinar; updating webinar details; reviewing registered attendees. NOT for: managing bookings (manage_bookings); creating events (N/A).',
    handler: 'module:webinars',
    category: 'communication',
    scope: 'internal',
    requires_approval: false,
    instructions: `## manage_webinar
### What
Manages webinars and registrations.
### When to use
- Admin creates or manages webinar events
- Viewing webinar registrations
### Parameters
- **action**: Required. list, create, update, registrations.
- **title**: Webinar title for create.
### Edge cases
- Registrations are linked to leads when email matches.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_webinar',
        description: 'Manage webinars and registrations. Use when: setting up a new webinar; updating webinar details; reviewing registered attendees. NOT for: managing bookings (manage_bookings); creating events (N/A).',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['list', 'create', 'update', 'registrations'] },
            webinar_id: { type: 'string' },
            title: { type: 'string' },
          },
          required: ['action'],
        },
      },
    },
  },
  {
    name: 'manage_site_settings',
    description: 'Read and update site settings including module configuration, site name, theme, etc. Use when: retrieving global configurations; changing website name; enabling or disabling modules. NOT for: updating site branding (site_branding_update); managing global blocks (manage_global_blocks).',
    handler: 'db:site_settings',
    category: 'system',
    scope: 'internal',
    requires_approval: false,
    instructions: `## manage_site_settings
### What
Reads and updates site settings including module configuration, site name, theme, AI config, chat config.
### When to use
- Admin asks to change site settings
- System configuration queries
- Module enable/disable
### Parameters
- **action**: Required. get, get_all, update.
- **key**: Settings key (modules, site_name, theme, ai_config, chat_config, etc.).
- **value**: New value for update.
### Edge cases
- Some settings changes require page reload to take effect.
- ai_config controls which AI provider FlowPilot uses.
- Be careful with module toggles — disabling a module hides its UI.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_site_settings',
        description: 'Read and update site settings including module configuration, site name, theme, etc. Use when: retrieving global configurations; changing website name; enabling or disabling modules. NOT for: updating site branding (site_branding_update); managing global blocks (manage_global_blocks).',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['get', 'get_all', 'update'] },
            key: { type: 'string', description: 'Settings key to read/update' },
            value: { type: 'object', description: 'New value (for update)' },
          },
          required: ['action'],
        },
      },
    },
  },
  {
    name: 'seo_audit_page',
    description: 'Run an SEO audit on a page or blog post, checking title, meta, content depth, images, links. Use when: optimizing a page for search engines; reviewing SEO before publishing; identifying SEO issues. NOT for: analyzing page traffic (analyze_analytics); updating page content (manage_page).',
    handler: 'module:analytics',
    category: 'analytics',
    scope: 'internal',
    requires_approval: false,
    instructions: `## seo_audit_page
### What
Runs an SEO audit on a page or blog post, checking title, meta, content depth, images, and links.
### When to use
- Admin asks for SEO analysis
- Before publishing important pages
- Content quality check during heartbeat
### Parameters
- **slug**: Required. Page or blog post slug to audit.
### Edge cases
- Works on both pages and blog posts.
- Returns actionable recommendations with severity levels.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'seo_audit_page',
        description: 'Run an SEO audit on a page or blog post, checking title, meta, content depth, images, links. Use when: optimizing a page for search engines; reviewing SEO before publishing; identifying SEO issues. NOT for: analyzing page traffic (analyze_analytics); updating page content (manage_page).',
        parameters: {
          type: 'object',
          properties: {
            slug: { type: 'string', description: 'Page or blog post slug to audit' },
          },
          required: ['slug'],
        },
      },
    },
  },
  {
    name: 'kb_gap_analysis',
    description: 'Analyze chat data to find questions not covered by KB articles, underperforming articles, and content gaps. Use when: improving knowledge base coverage; identifying frequently asked but unanswered questions; planning KB content. NOT for: managing KB articles (manage_kb_article); analyzing feedback sentiment (analyze_chat_feedback).',
    handler: 'module:analytics',
    category: 'analytics',
    scope: 'internal',
    requires_approval: false,
    instructions: `## kb_gap_analysis
### What
Analyzes chat data to find questions not covered by KB articles, underperforming articles, and content gaps.
### When to use
- Admin asks "what questions can't the chat answer?"
- Knowledge base improvement cycles
- Content strategy: identify missing topics
### Parameters
- **limit**: Max uncovered questions to return (default 20).
### Edge cases
- Requires chat history data to produce meaningful results.
- Chain: kb_gap_analysis → manage_kb_article(create) for each gap.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'kb_gap_analysis',
        description: 'Analyze chat data to find questions not covered by KB articles, underperforming articles, and content gaps. Use when: improving knowledge base coverage; identifying frequently asked but unanswered questions; planning KB content. NOT for: managing KB articles (manage_kb_article); analyzing feedback sentiment (analyze_chat_feedback).',
        parameters: {
          type: 'object',
          properties: {
            limit: { type: 'number', description: 'Max uncovered questions (default 20)' },
          },
        },
      },
    },
  },
  {
    name: 'handbook_search',
    description: 'Search and read chapters from the synced handbook (Agentic Handbook / Clawable). Use when: visitor asks about AI agents, FlowPilot architecture, agentic design, OpenClaw, heartbeat protocol, skills ecosystem, federation, or any topic covered in the handbook. NOT for: managing KB articles (manage_kb_article); general web search (web_search).',
    handler: 'module:handbook',
    category: 'content',
    scope: 'both',
    requires_approval: false,
    instructions: `## handbook_search
### What
Searches and retrieves chapters from the synced GitHub handbook repository.
### When to use
- Visitor asks about agentic architecture, FlowPilot, OpenClaw, skills, heartbeat, federation
- Admin wants to reference handbook content
- Any question about how FlowPilot works architecturally
### Parameters
- **query**: Search term to find relevant chapters (searches title and content)
- **slug**: Specific chapter slug to retrieve full content
- **limit**: Max results for search (default 5)
### Usage patterns
1. Search: handbook_search(query: "heartbeat") → get snippets
2. Read: handbook_search(slug: "05-heartbeat-protocol") → full chapter
3. TOC: handbook_search() → list all chapters`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'handbook_search',
        description: 'Search and read chapters from the synced handbook (Agentic Handbook / Clawable). Use when: visitor asks about AI agents, FlowPilot architecture, agentic design, OpenClaw, heartbeat protocol, skills ecosystem, federation, or any topic covered in the handbook. NOT for: managing KB articles (manage_kb_article); general web search (web_search).',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search term to find relevant chapters' },
            slug: { type: 'string', description: 'Specific chapter slug to retrieve full content' },
            limit: { type: 'number', description: 'Max results (default 5)' },
          },
        },
      },
    },
  },
  {
    name: 'analyze_chat_feedback',
    description: 'Analyze chat feedback: summary stats, negative feedback drill-down. Use when: monitoring customer satisfaction; identifying knowledge gaps; reviewing support quality. NOT for: getting raw feedback data (support_get_feedback); analyzing KB gaps (kb_gap_analysis).',
    handler: 'module:analytics',
    category: 'analytics',
    scope: 'internal',
    requires_approval: false,
    instructions: `## analyze_chat_feedback
### What
Analyzes chat feedback: summary statistics, negative feedback drill-down.
### When to use
- Admin asks about chat satisfaction or quality
- Part of weekly digest or performance review
- Identifying problematic chat responses
### Parameters
- **action**: summary (overall stats) or negative_only (drill into bad feedback).
- **period**: week, month, quarter.
### Edge cases
- Negative feedback includes the original question and AI response for context.
- Use insights to improve KB articles and chat configuration.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'analyze_chat_feedback',
        description: 'Analyze chat feedback: summary stats, negative feedback drill-down. Use when: monitoring customer satisfaction; identifying knowledge gaps; reviewing support quality. NOT for: getting raw feedback data (support_get_feedback); analyzing KB gaps (kb_gap_analysis).',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['summary', 'negative_only'] },
            period: { type: 'string', enum: ['week', 'month', 'quarter'] },
            limit: { type: 'number' },
          },
        },
      },
    },
  },
  {
    name: 'manage_automations',
    description: 'Create and manage agent automations (cron jobs, event triggers, signal handlers). Use when: setting up recurring tasks; defining automatic event responses; implementing signal processing logic. NOT for: creating objectives (create_objective); processing incoming signals (process_signal).',
    handler: 'module:automations',
    category: 'automation',
    scope: 'internal',
    requires_approval: false,
    instructions: `## manage_automations
### What
Creates and manages agent automations (cron jobs, event triggers, signal handlers).
### When to use
- Admin asks to automate a recurring task
- Setting up event-driven workflows (e.g., "when a lead is created, qualify it")
- Managing existing automation schedules
### Parameters
- **name**: Required. Automation name.
- **skill_name**: Required. The database skill to execute.
- **trigger_type**: cron, event, signal, manual.
- **trigger_config**: Trigger-specific config (cron expression, event name, etc.).
- **enabled**: Boolean. New automations default to disabled per LAW 7.
### Edge cases
- skill_name must reference a DATABASE skill, not a built-in tool.
- Cron expressions use standard format: minute hour day month weekday.
- New automations are disabled by default — admin must explicitly enable.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_automations',
        description: 'Create and manage agent automations (cron jobs, event triggers, signal handlers). Use when: setting up recurring tasks; defining automatic event responses; implementing signal processing logic. NOT for: creating objectives (create_objective); processing incoming signals (process_signal).',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            trigger_type: { type: 'string', enum: ['cron', 'event', 'signal', 'manual'] },
            trigger_config: { type: 'object' },
            skill_name: { type: 'string', description: 'Skill to execute' },
            skill_arguments: { type: 'object' },
            enabled: { type: 'boolean' },
          },
          required: ['name', 'skill_name'],
        },
      },
    },
  },
  // ─── Paid Growth Skills ─────────────────────────────────────────────────────
  {
    name: 'ad_campaign_create',
    description: 'Create a new ad campaign with objective, budget, target audience, and platform. Requires approval due to budget commitment. Use when: launching a marketing initiative; defining advertising parameters; allocating ad budget. NOT for: generating ad creatives (ad_creative_generate); optimizing existing campaigns (ad_optimize).',
    handler: 'db:ad_campaigns',
    category: 'growth',
    scope: 'internal',
    requires_approval: true,
    instructions: `## ad_campaign_create
### What
Creates a new ad campaign with objective, budget, target audience, and platform. Requires approval due to budget commitment.
### When to use
- Admin asks to create an advertising campaign
- Part of paid growth workflow
### Parameters
- **name**: Required. Campaign name.
- **platform**: Required. meta, google, or linkedin.
- **objective**: Required. awareness, traffic, leads, conversions.
- **budget_cents**: Required. Daily budget in cents.
### Edge cases
- Requires approval because it commits real budget.
- Creates in 'draft' status until approved and activated.
- Chain: ad_campaign_create → ad_creative_generate → activate.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'ad_campaign_create',
        description: 'Create a new ad campaign with objective, budget, target audience, and platform. Requires approval due to budget commitment. Use when: launching a marketing initiative; defining advertising parameters; allocating ad budget. NOT for: generating ad creatives (ad_creative_generate); optimizing existing campaigns (ad_optimize).',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Campaign name' },
            platform: { type: 'string', enum: ['meta', 'google', 'linkedin'], description: 'Ad platform' },
            objective: { type: 'string', enum: ['awareness', 'traffic', 'leads', 'conversions'], description: 'Campaign objective' },
            budget_cents: { type: 'number', description: 'Daily budget in cents' },
            currency: { type: 'string', description: 'Currency code (default SEK)' },
            target_audience: { type: 'object', description: 'Target audience config: demographics, interests, location' },
            start_date: { type: 'string', description: 'Start date YYYY-MM-DD' },
            end_date: { type: 'string', description: 'End date YYYY-MM-DD' },
          },
          required: ['name', 'platform', 'objective', 'budget_cents'],
        },
      },
    },
  },
  {
    name: 'ad_creative_generate',
    description: 'Generate ad creative (headline, body, CTA) using AI based on campaign objective and target audience. Use when: creating ad copy for a campaign; generating variations for A/B testing; needing creative inspiration. NOT for: creating campaigns (ad_campaign_create); checking ad performance (ad_performance_check).',
    handler: 'db:ad_creatives',
    category: 'growth',
    scope: 'internal',
    requires_approval: false,
    instructions: `## ad_creative_generate
### What
Generates ad creative (headline, body, CTA) using AI based on campaign objective and target audience.
### When to use
- After creating an ad campaign, generate creative assets
- A/B testing: generate multiple creative variants
### Parameters
- **campaign_id**: Required. Campaign UUID.
- **type**: Required. image, video, text, or carousel.
- **tone**: Ad tone: professional, casual, urgent, storytelling.
- **key_message**: Core value proposition.
### Edge cases
- AI-generated — review before activating.
- Multiple creatives per campaign enable A/B testing.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'ad_creative_generate',
        description: 'Generate ad creative (headline, body, CTA) using AI based on campaign objective and target audience. Use when: creating ad copy for a campaign; generating variations for A/B testing; needing creative inspiration. NOT for: creating campaigns (ad_campaign_create); checking ad performance (ad_performance_check).',
        parameters: {
          type: 'object',
          properties: {
            campaign_id: { type: 'string', description: 'Campaign UUID to generate creative for' },
            type: { type: 'string', enum: ['image', 'video', 'text', 'carousel'], description: 'Creative type' },
            tone: { type: 'string', enum: ['professional', 'casual', 'urgent', 'storytelling'], description: 'Ad tone' },
            key_message: { type: 'string', description: 'Core message or value proposition' },
            cta: { type: 'string', description: 'Call to action text' },
          },
          required: ['campaign_id', 'type'],
        },
      },
    },
  },
  {
    name: 'ad_performance_check',
    description: 'Check ad campaign performance metrics: spend, impressions, clicks, CTR, CPC, conversions. Use when: monitoring campaign metrics; building performance reports; evaluating ROI. NOT for: optimizing campaigns (ad_optimize); creating campaigns (ad_campaign_create).',
    handler: 'db:ad_campaigns',
    category: 'growth',
    scope: 'internal',
    requires_approval: false,
    instructions: `## ad_performance_check
### What
Checks ad campaign performance metrics: spend, impressions, clicks, CTR, CPC, conversions.
### When to use
- Admin asks about ad performance
- Part of weekly digest
- Before ad_optimize to gather data
### Parameters
- **campaign_id**: Optional. Omit for all campaigns.
- **period**: today, week, month, all.
### Edge cases
- New campaigns may show zeros — wait at least 24h for meaningful data.
- Metrics are from the internal tracking system, not the ad platform API.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'ad_performance_check',
        description: 'Check ad campaign performance metrics: spend, impressions, clicks, CTR, CPC, conversions. Use when: monitoring campaign metrics; building performance reports; evaluating ROI. NOT for: optimizing campaigns (ad_optimize); creating campaigns (ad_campaign_create).',
        parameters: {
          type: 'object',
          properties: {
            campaign_id: { type: 'string', description: 'Campaign UUID (omit for all campaigns)' },
            period: { type: 'string', enum: ['today', 'week', 'month', 'all'], description: 'Time period' },
          },
        },
      },
    },
  },
  {
    name: 'ad_optimize',
    description: 'Analyze campaign performance and recommend optimizations: pause underperformers, scale winners, adjust budgets. Requires approval. Use when: reviewing campaign results; optimizing ad spend; identifying underperforming ads. NOT for: creating campaigns (ad_campaign_create); generating creatives (ad_creative_generate).',
    handler: 'db:ad_campaigns',
    category: 'growth',
    scope: 'internal',
    requires_approval: true,
    instructions: `## ad_optimize
### What
Analyzes campaign performance and recommends optimizations. Requires approval for budget changes.
### When to use
- Campaigns have been running for 3+ days
- Admin asks to optimize ad spend
- Automated optimization in growth workflows
### Parameters
- **campaign_id**: Optional. Omit for all campaigns.
- **action**: analyze, pause_underperformers, scale_winners, rebalance_budget.
- **threshold_ctr**: Min CTR before pausing (default 0.5%).
### Edge cases
- Requires approval for budget-affecting actions.
- Always analyze first, then act on recommendations.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'ad_optimize',
        description: 'Analyze campaign performance and recommend optimizations: pause underperformers, scale winners, adjust budgets. Requires approval. Use when: reviewing campaign results; optimizing ad spend; identifying underperforming ads. NOT for: creating campaigns (ad_campaign_create); generating creatives (ad_creative_generate).',
        parameters: {
          type: 'object',
          properties: {
            campaign_id: { type: 'string', description: 'Campaign UUID to optimize (omit for all)' },
            action: { type: 'string', enum: ['analyze', 'pause_underperformers', 'scale_winners', 'rebalance_budget'], description: 'Optimization action' },
            threshold_ctr: { type: 'number', description: 'Minimum CTR threshold (default 0.5%)' },
            threshold_cpc_cents: { type: 'number', description: 'Max CPC in cents before pausing' },
          },
        },
      },
    },
  },

  // ─── Composable Content Skills ──────────────────────────────────────────────
  {
    name: 'landing_page_compose',
    description: 'Autonomously compose a landing page from the block library based on campaign goal, target audience, and optional ad campaign reference. Use when: building a campaign landing page; creating a targeted page for an ad; composing a page from AI-generated content. NOT for: migrating existing pages (migrate_url); managing individual blocks (manage_page_blocks).',
    handler: 'db:pages',
    instructions: `You compose high-converting landing pages by selecting from the platform's block library.

## Available block types (use only these):
hero, text, cta, features, stats, testimonials, pricing, accordion, form, newsletter, quote, two-column, info-box, logos, comparison, social-proof, countdown, chat-launcher, separator

## Composition rules:
1. ALWAYS start with a hero block — strong headline + subheadline + CTA
2. Follow with value proposition blocks (features, stats, two-column)
3. Add social proof (testimonials, logos, social-proof)
4. Include at least one conversion block (cta, form, newsletter, chat-launcher)
5. End with a final CTA or contact section
6. Use separator blocks between major sections
7. Keep total blocks between 5-10 for focused landing pages
8. Match tone and messaging to the target audience
9. If linked to an ad campaign, align messaging with campaign objective

## Output format:
Return a valid content_json array of ContentBlock objects with proper data for each block type.`,
    category: 'growth',
    scope: 'internal',
    requires_approval: false,
    trust_level: 'notify',
    tool_definition: {
      type: 'function',
      function: {
        name: 'landing_page_compose',
        description: 'Autonomously compose a landing page from the block library based on campaign goal, target audience, and optional ad campaign reference. Use when: building a campaign landing page; creating a targeted page for an ad; composing a page from AI-generated content. NOT for: migrating existing pages (migrate_url); managing individual blocks (manage_page_blocks).',
        parameters: {
          type: 'object',
          properties: {
            goal: { type: 'string', description: 'Campaign/page goal, e.g. "Generate leads for consulting services" or "Promote summer sale"' },
            target_audience: { type: 'string', description: 'Target audience description, e.g. "Small business owners aged 30-50 looking for IT consulting"' },
            campaign_id: { type: 'string', description: 'Optional: Link to an existing ad_campaign UUID for messaging alignment' },
            page_title: { type: 'string', description: 'Page title (used for slug generation)' },
            tone: { type: 'string', enum: ['professional', 'casual', 'urgent', 'inspirational', 'technical'], description: 'Desired tone of voice (default: professional)' },
            include_blocks: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional: specific block types to include (e.g. ["pricing", "testimonials"])',
            },
          },
          required: ['goal', 'target_audience', 'page_title'],
        },
      },
    },
  },

  // ─── Live Support ─────────────────────────────────────────────────────────
  {
    name: 'support_list_conversations',
    description: 'List support conversations filtered by status. Returns customer name, email, priority, sentiment, and escalation reason. Use when: reviewing support queue; monitoring overall support load; identifying high-priority issues. NOT for: assigning conversations (support_assign_conversation); analyzing feedback (analyze_chat_feedback).',
    handler: 'db:chat_conversations',
    category: 'communication',
    scope: 'internal',
    requires_approval: false,
    instructions: `## support_list_conversations
### What
Lists support conversations filtered by status.
### When to use
- Admin asks about support queue
- Monitoring escalated or waiting conversations
- Support dashboard data
### Parameters
- **status**: Filter: waiting_agent, with_agent, escalated, closed, active.
- **limit**: Max results (default 20).
### Edge cases
- Escalated conversations should be prioritized.
- Returns customer name, email, priority, and sentiment score.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'support_list_conversations',
        description: 'List support conversations filtered by status. Returns customer name, email, priority, sentiment, and escalation reason. Use when: reviewing support queue; monitoring overall support load; identifying high-priority issues. NOT for: assigning conversations (support_assign_conversation); analyzing feedback (analyze_chat_feedback).',
        parameters: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['waiting_agent', 'with_agent', 'escalated', 'closed', 'active'], description: 'Filter by conversation status' },
            limit: { type: 'number', description: 'Max results (default 20)' },
          },
          required: [],
        },
      },
    },
  },
  {
    name: 'support_assign_conversation',
    description: 'Assign or reassign a support conversation to an agent. Use when: a customer query needs agent attention; re-routing a conversation to a specialist; ensuring no support ticket is unassigned. NOT for: listing conversations (support_list_conversations); getting feedback (support_get_feedback).',
    handler: 'db:chat_conversations',
    category: 'communication',
    scope: 'internal',
    requires_approval: false,
    instructions: `## support_assign_conversation
### What
Assigns or reassigns a support conversation to an agent.
### When to use
- Admin assigns a conversation to a team member
- Routing escalated conversations
### Parameters
- **conversation_id**: Required. UUID of the conversation.
- **agent_id**: UUID of the support agent to assign.
- **status**: New status: with_agent, escalated, closed.
### Edge cases
- Assigning sets status to 'with_agent' automatically.
- Closing a conversation removes it from active queue.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'support_assign_conversation',
        description: 'Assign or reassign a support conversation to an agent. Use when: a customer query needs agent attention; re-routing a conversation to a specialist; ensuring no support ticket is unassigned. NOT for: listing conversations (support_list_conversations); getting feedback (support_get_feedback).',
        parameters: {
          type: 'object',
          properties: {
            conversation_id: { type: 'string', description: 'UUID of the conversation' },
            agent_id: { type: 'string', description: 'UUID of the support_agents record to assign' },
            status: { type: 'string', enum: ['with_agent', 'escalated', 'closed'], description: 'New status' },
          },
          required: ['conversation_id'],
        },
      },
    },
  },
  {
    name: 'support_get_feedback',
    description: 'Retrieve chat feedback ratings and comments. Useful for monitoring customer satisfaction and identifying knowledge gaps. Use when: pulling raw feedback data; building satisfaction reports; reviewing individual feedback entries. NOT for: analyzing feedback trends (analyze_chat_feedback); listing support conversations (support_list_conversations).',
    handler: 'db:chat_feedback',
    category: 'analytics',
    scope: 'internal',
    requires_approval: false,
    instructions: `## support_get_feedback
### What
Retrieves chat feedback ratings and comments for quality monitoring.
### When to use
- Admin asks about customer satisfaction
- Quality assurance reviews
- Identifying knowledge gaps from negative feedback
### Parameters
- **rating**: Filter by 'positive' or 'negative'.
- **limit**: Max results (default 20).
### Edge cases
- Use negative feedback to identify KB gaps and improve responses.
- Chain: support_get_feedback(negative) → kb_gap_analysis.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'support_get_feedback',
        description: 'Retrieve chat feedback ratings and comments. Useful for monitoring customer satisfaction and identifying knowledge gaps. Use when: pulling raw feedback data; building satisfaction reports; reviewing individual feedback entries. NOT for: analyzing feedback trends (analyze_chat_feedback); listing support conversations (support_list_conversations).',
        parameters: {
          type: 'object',
          properties: {
            rating: { type: 'string', enum: ['positive', 'negative'], description: 'Filter by rating' },
            limit: { type: 'number', description: 'Max results (default 20)' },
          },
          required: [],
        },
      },
    },
  },

  // ─── CRM Tasks ────────────────────────────────────────────────────────────
  {
    name: 'crm_task_list',
    description: 'List CRM tasks with optional filters for lead, deal, priority, and completion status. Use when: reviewing upcoming tasks; checking tasks for a specific lead; auditing task completion. NOT for: creating a new task (crm_task_create); updating a task (crm_task_update).',
    handler: 'db:crm_tasks',
    category: 'crm',
    scope: 'internal',
    requires_approval: false,
    instructions: `## crm_task_list
### What
Lists CRM tasks with optional filters.
### When to use
- Admin asks about pending tasks
- Pipeline management: what needs attention
- Filtering tasks by lead, deal, or priority
### Parameters
- **lead_id**: Filter by lead UUID.
- **deal_id**: Filter by deal UUID.
- **priority**: Filter: low, medium, high, urgent.
- **show_completed**: Include completed tasks (default false).
### Edge cases
- Defaults to showing only incomplete tasks.
- Tasks link to leads and/or deals for context.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'crm_task_list',
        description: 'List CRM tasks with optional filters for lead, deal, priority, and completion status. Use when: reviewing upcoming tasks; checking tasks for a specific lead; auditing task completion. NOT for: creating a new task (crm_task_create); updating a task (crm_task_update).',
        parameters: {
          type: 'object',
          properties: {
            lead_id: { type: 'string', description: 'Filter by lead UUID' },
            deal_id: { type: 'string', description: 'Filter by deal UUID' },
            priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], description: 'Filter by priority' },
            show_completed: { type: 'boolean', description: 'Include completed tasks (default false)' },
            limit: { type: 'number', description: 'Max results (default 20)' },
          },
          required: [],
        },
      },
    },
  },
  {
    name: 'crm_task_create',
    description: 'Create a new CRM task with title, description, due date, priority, and optional lead/deal link. Use when: needing to follow up on a lead; assigning a task related to a deal; reminding agents about upcoming actions. NOT for: listing tasks (crm_task_list); adding a new lead (add_lead).',
    handler: 'db:crm_tasks',
    category: 'crm',
    scope: 'internal',
    requires_approval: false,
    instructions: `## crm_task_create
### What
Creates a new CRM task with title, description, due date, and priority.
### When to use
- Admin asks to create a follow-up task
- Automated task creation from workflows
- After lead qualification suggests next steps
### Parameters
- **title**: Required. Task title.
- **due_date**: ISO date for the deadline.
- **priority**: low, medium, high, urgent. Default medium.
- **lead_id** or **deal_id**: Link to CRM entity.
### Edge cases
- Tasks without due_date show as undated.
- Link to a lead or deal for context in CRM views.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'crm_task_create',
        description: 'Create a new CRM task with title, description, due date, priority, and optional lead/deal link. Use when: needing to follow up on a lead; assigning a task related to a deal; reminding agents about upcoming actions. NOT for: listing tasks (crm_task_list); adding a new lead (add_lead).',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Task title' },
            description: { type: 'string', description: 'Task details' },
            due_date: { type: 'string', description: 'Due date in ISO format' },
            priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], description: 'Task priority' },
            lead_id: { type: 'string', description: 'Link to a lead UUID' },
            deal_id: { type: 'string', description: 'Link to a deal UUID' },
          },
          required: ['title'],
        },
      },
    },
  },
  {
    name: 'crm_task_update',
    description: 'Update an existing CRM task — change title, description, priority, due date, or mark as completed. Use when: modifying a pending task; marking a task as done; rescheduling a deadline. NOT for: creating a new task (crm_task_create); listing tasks (crm_task_list).',
    handler: 'db:crm_tasks',
    category: 'crm',
    scope: 'internal',
    requires_approval: false,
    instructions: `## crm_task_update
### What
Updates an existing CRM task — change title, priority, due date, or mark as completed.
### When to use
- Admin updates task details
- Marking tasks as complete
- Changing task priority
### Parameters
- **id**: Required. Task UUID.
- **completed_at**: ISO timestamp to mark complete. Set to null to reopen.
- **priority**, **title**, **description**, **due_date**: Fields to update.
### Edge cases
- Setting completed_at marks the task as done.
- Setting completed_at to null reopens the task.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'crm_task_update',
        description: 'Update an existing CRM task — change title, description, priority, due date, or mark as completed. Use when: modifying a pending task; marking a task as done; rescheduling a deadline. NOT for: creating a new task (crm_task_create); listing tasks (crm_task_list).',
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Task UUID' },
            title: { type: 'string', description: 'Updated title' },
            description: { type: 'string', description: 'Updated description' },
            due_date: { type: 'string', description: 'Updated due date' },
            priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
            completed_at: { type: 'string', description: 'ISO timestamp to mark complete, or null to reopen' },
          },
          required: ['id'],
        },
      },
    },
  },

  // ─── Branding & Site Identity ─────────────────────────────────────────────
  {
    name: 'site_branding_get',
    description: 'Read current site branding settings including logo, colors, fonts, and favicon. Use when: retrieving current brand settings; checking active color scheme; verifying logo URL. NOT for: updating branding (site_branding_update); managing site settings (manage_site_settings).',
    handler: 'db:site_settings',
    category: 'content',
    scope: 'internal',
    requires_approval: false,
    instructions: `## site_branding_get
### What
Reads current site branding settings: logo, colors, fonts, favicon.
### When to use
- Admin asks about current branding
- Before making branding changes (get current state)
- Content creation that needs brand context
### Parameters
- None required.
### Edge cases
- Returns null for unset values.
- Use site_branding_update to make changes.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'site_branding_get',
        description: 'Read current site branding settings including logo, colors, fonts, and favicon. Use when: retrieving current brand settings; checking active color scheme; verifying logo URL. NOT for: updating branding (site_branding_update); managing site settings (manage_site_settings).',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    },
  },
  {
    name: 'site_branding_update',
    description: 'Update site branding settings — logo URL, primary/accent colors, font family, favicon. Use when: changing the site logo; updating brand colors; applying a new visual identity. NOT for: reading current branding (site_branding_get); managing global blocks (manage_global_blocks).',
    handler: 'db:site_settings',
    category: 'content',
    scope: 'internal',
    requires_approval: true,
    instructions: `## site_branding_update
### What
Updates site branding settings — logo, colors, fonts, favicon. Requires approval.
### When to use
- Admin asks to change logo, colors, or fonts
- Rebranding workflow
### Parameters
- **logo_url**: URL to logo image.
- **favicon_url**: URL to favicon.
- **primary_color**: Hex color code.
- **accent_color**: Hex color code.
- **font_family**: Font family name.
### Edge cases
- Requires approval — branding changes are visible to all visitors immediately.
- Logo and favicon should be hosted in the media library or a CDN.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'site_branding_update',
        description: 'Update site branding settings — logo URL, primary/accent colors, font family, favicon. Use when: changing the site logo; updating brand colors; applying a new visual identity. NOT for: reading current branding (site_branding_get); managing global blocks (manage_global_blocks).',
        parameters: {
          type: 'object',
          properties: {
            logo_url: { type: 'string', description: 'URL to logo image' },
            favicon_url: { type: 'string', description: 'URL to favicon' },
            primary_color: { type: 'string', description: 'Primary brand color (hex)' },
            accent_color: { type: 'string', description: 'Accent color (hex)' },
            font_family: { type: 'string', description: 'Primary font family name' },
          },
          required: [],
        },
      },
    },
  },

  // ─── User & Role Management ───────────────────────────────────────────────
  {
    name: 'users_list',
    description: 'List platform users with their roles. Shows email, role, and last sign-in. Use when: admin needs to review team members; checking user access levels; auditing platform users. NOT for: managing user roles (N/A); creating new users (N/A).',
    handler: 'db:profiles',
    category: 'crm',
    scope: 'internal',
    requires_approval: false,
    instructions: `## users_list
### What
Lists platform users with their roles.
### When to use
- Admin asks about team members or users
- Role management queries
- Audit: who has admin access
### Parameters
- **role**: Filter by role: admin, approver, writer.
- **limit**: Max results (default 20).
### Edge cases
- Shows email, role, and last sign-in.
- Does not include customers — only platform users.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'users_list',
        description: 'List platform users with their roles. Shows email, role, and last sign-in. Use when: admin needs to review team members; checking user access levels; auditing platform users. NOT for: managing user roles (N/A); creating new users (N/A).',
        parameters: {
          type: 'object',
          properties: {
            role: { type: 'string', enum: ['admin', 'approver', 'writer'], description: 'Filter by role' },
            limit: { type: 'number', description: 'Max results (default 20)' },
          },
          required: [],
        },
      },
    },
  },
  // (manage_blog_posts, manage_leads, browse_products defined above — removed duplicates)
  {
    name: 'place_order',
    description: 'Place an order via the checkout API with sandbox mode support. Use when: external agent tests purchase flow, programmatic order creation, automated testing of checkout pipeline. NOT for: managing existing orders (use manage_orders), browsing products (use manage_products), payment configuration (use site_settings).',
    handler: 'edge:create-checkout',
    category: 'commerce',
    scope: 'external',
    requires_approval: false,
    trust_level: 'notify',
    instructions: `## place_order
### What
Places an order through the create-checkout edge function. In sandbox mode, completes immediately without payment.
### When to use
- External agent (OpenClaw) tests the full purchase flow
- Programmatic order creation for testing or automation
### Parameters
- **items**: Array of {productId, productName, priceCents, quantity}.
- **customerName**: Buyer name.
- **customerEmail**: Buyer email.
- **currency**: ISO currency code (default SEK).
### Edge cases
- Sandbox mode auto-detected from module config — no Stripe needed.
- Always use notify trust level so admin sees orders.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'place_order',
        description: 'Place an order via the checkout API with sandbox mode support. Use when: external agent tests purchase flow, programmatic order creation, automated testing of checkout pipeline. NOT for: managing existing orders (use manage_orders), browsing products (use manage_products), payment configuration (use site_settings).',
        parameters: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  productId: { type: 'string' },
                  productName: { type: 'string' },
                  priceCents: { type: 'number' },
                  quantity: { type: 'number' },
                },
                required: ['productId', 'productName', 'priceCents', 'quantity'],
              },
              description: 'Cart items',
            },
            customerName: { type: 'string', description: 'Customer name' },
            customerEmail: { type: 'string', description: 'Customer email' },
            currency: { type: 'string', description: 'Currency code (default SEK)' },
          },
          required: ['items', 'customerName', 'customerEmail'],
        },
      },
    },
  },
  {
    name: 'check_order_status',
    description: 'Check the status of an existing order by ID. Use when: a user inquires about their purchase; verifying order progress; providing delivery updates. NOT for: managing orders (manage_orders); looking up orders by email (lookup_order).',
    handler: 'edge:order-status',
    category: 'commerce',
    scope: 'external',
    requires_approval: false,
    trust_level: 'auto',
    instructions: `## check_order_status
### What
Checks the current status of an order via the order-status edge function.
### When to use
- External agent wants to verify an order went through
- Visitor asks about their order in chat
- Automated follow-up workflows checking fulfillment
### Parameters
- **order_id**: The UUID of the order.
- **email**: Optional email for guest verification.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'check_order_status',
        description: 'Check the status of an existing order by ID. Use when: a user inquires about their purchase; verifying order progress; providing delivery updates. NOT for: managing orders (manage_orders); looking up orders by email (lookup_order).',
        parameters: {
          type: 'object',
          properties: {
            order_id: { type: 'string', description: 'Order UUID' },
            email: { type: 'string', description: 'Customer email (for guest verification)' },
          },
          required: ['order_id'],
        },
      },
    },
  },
  // ─── A2A / OpenClaw ───────────────────────────────────────────────────────
  {
    name: 'a2a_chat',
    description: 'Handle incoming A2A messages from federation peers. Routes natural language messages to FlowPilot for intelligent response. Use when: a peer agent sends a chat message; processing cross-agent communication; responding to federation requests. NOT for: outbound A2A calls (N/A); managing A2A peers (N/A).',
    handler: 'edge:a2a-chat',
    category: 'system',
    scope: 'external',
    requires_approval: false,
    trust_level: 'auto',
    instructions: `## a2a_chat
### What
Default handler for inbound A2A messages from connected federation peers (e.g. OpenClaw, other FlowWink instances). Runs the message through FlowPilot chat-completion with full site intelligence and per-peer conversation memory (last 20 exchanges).
### When to use
- A peer sent plain text or an unstructured message with no explicit skill invocation
- Default fallback when a2a-ingest cannot extract a specific skill from the message
- Supports responseSchema for structured JSON responses
### NOT for
- Outbound messages to peers
- Messages that already specify a skill via DataPart (those route directly)
### Parameters
- **text**: The message text from the peer
- **peer_name**: Name of the sending peer
- **parts**: Raw message parts (optional)`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'a2a_chat',
        description: 'Handle incoming A2A messages from federation peers. Routes natural language messages to FlowPilot for intelligent response. Use when: a peer agent sends a chat message; processing cross-agent communication; responding to federation requests. NOT for: outbound A2A calls (N/A); managing A2A peers (N/A).',
        parameters: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'The message text from the peer' },
            peer_name: { type: 'string', description: 'Name of the sending peer' },
            parts: { type: 'array', description: 'Raw message parts' },
          },
          required: ['text'],
        },
      },
    },
  },
  {
    name: 'openclaw_start_session',
    description: 'Start a beta test session with a scenario description. Use when: initiating a new round of beta testing; defining test scope and purpose; preparing OpenClaw for a new testing task. NOT for: ending a session (openclaw_end_session); getting status (openclaw_get_status).',
    handler: 'module:openclaw',
    category: 'system',
    scope: 'internal',
    requires_approval: false,
    trust_level: 'auto',
    instructions: `## openclaw_start_session
### What
Opens a new OpenClaw beta test session. Registers the session in the database before any findings or exchanges can be logged.
### When to use
- OpenClaw initiates a testing session — call this first
- Returns a session_id used in all subsequent openclaw calls
### Parameters
- **scenario**: Short description of what is being tested
- **peer_name**: Name of the tester (defaults to "openclaw")
- **metadata**: Optional additional context`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'openclaw_start_session',
        description: 'Start a beta test session with a scenario description. Use when: initiating a new round of beta testing; defining test scope and purpose; preparing OpenClaw for a new testing task. NOT for: ending a session (openclaw_end_session); getting status (openclaw_get_status).',
        parameters: {
          type: 'object',
          properties: {
            scenario: { type: 'string', description: 'Test scenario description' },
            peer_name: { type: 'string', description: 'Name of the tester' },
            metadata: { type: 'object', description: 'Optional metadata' },
          },
          required: ['scenario'],
        },
      },
    },
  },
  {
    name: 'openclaw_end_session',
    description: 'End a beta test session with summary. Use when: concluding a beta testing round; collecting final session feedback; marking a test as complete. NOT for: starting a new test session (openclaw_start_session); reporting findings (openclaw_report_finding).',
    handler: 'module:openclaw',
    category: 'system',
    scope: 'internal',
    requires_approval: false,
    trust_level: 'auto',
    instructions: `## openclaw_end_session
### What
Closes an active OpenClaw beta test session with a summary and final status.
### When to use
- A beta test session is complete
- Call with the session_id from openclaw_start_session
### NOT for
- Ending sessions that were never started
### Parameters
- **session_id**: The session to close
- **summary**: What was tested
- **status**: Final status (e.g. "completed", "aborted")`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'openclaw_end_session',
        description: 'End a beta test session with summary. Use when: concluding a beta testing round; collecting final session feedback; marking a test as complete. NOT for: starting a new test session (openclaw_start_session); reporting findings (openclaw_report_finding).',
        parameters: {
          type: 'object',
          properties: {
            session_id: { type: 'string', description: 'Session ID to end' },
            summary: { type: 'string', description: 'Session summary' },
            status: { type: 'string', description: 'Final status' },
          },
          required: ['session_id'],
        },
      },
    },
  },
  {
    name: 'openclaw_report_finding',
    description: 'Report a bug, UX issue, suggestion, positive note, missing feature, or performance issue from beta testing. Use when: documenting observed problems during a test; submitting improvement ideas; logging defects. NOT for: getting test status (openclaw_get_status); sending a general message (openclaw_exchange).',
    handler: 'module:openclaw',
    category: 'system',
    scope: 'internal',
    requires_approval: false,
    trust_level: 'auto',
    instructions: `## openclaw_report_finding
### What
Logs a finding (bug, UX issue, suggestion, positive note, missing feature, or performance issue) discovered during a beta test session.
### When to use
- OpenClaw discovers something worth logging during an active session
- Include as much context as possible in the description field
### Parameters
- **session_id**: Optional active session ID
- **type**: bug | ux_issue | suggestion | positive | performance | missing_feature
- **severity**: low | medium | high | critical
- **title**: Short finding title
- **description**: Detailed description
- **context**: Additional structured context (optional)
- **screenshot_url**: Optional screenshot URL`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'openclaw_report_finding',
        description: 'Report a bug, UX issue, suggestion, positive note, missing feature, or performance issue from beta testing. Use when: documenting observed problems during a test; submitting improvement ideas; logging defects. NOT for: getting test status (openclaw_get_status); sending a general message (openclaw_exchange).',
        parameters: {
          type: 'object',
          properties: {
            session_id: { type: 'string', description: 'Optional session ID' },
            type: { type: 'string', enum: ['bug', 'ux_issue', 'suggestion', 'positive', 'performance', 'missing_feature'], description: 'Finding type' },
            severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], description: 'Severity level' },
            title: { type: 'string', description: 'Finding title' },
            description: { type: 'string', description: 'Detailed description' },
            context: { type: 'object', description: 'Additional context' },
            screenshot_url: { type: 'string', description: 'Screenshot URL' },
          },
          required: ['type', 'title'],
        },
      },
    },
  },
  {
    name: 'openclaw_exchange',
    description: 'Send a message between OpenClaw and FlowPilot. Use when: passing information between systems; requesting an action from the other AI; synchronizing state or data. NOT for: generalized A2A chat (a2a_chat); reporting findings (openclaw_report_finding).',
    handler: 'module:openclaw',
    category: 'system',
    scope: 'internal',
    requires_approval: false,
    trust_level: 'auto',
    instructions: `## openclaw_exchange
### What
Sends a structured message between OpenClaw and FlowPilot during a session.
### When to use
- Sending observations, questions, suggestions, learnings, or acknowledgments between agents
### Parameters
- **content**: The human-readable message body (required)
- **session_id**: Optional session ID
- **direction**: openclaw_to_flowpilot (default) | flowpilot_to_openclaw
- **message_type**: observation | question | suggestion | learning | acknowledgment
- **payload**: Optional structured payload`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'openclaw_exchange',
        description: 'Send a message between OpenClaw and FlowPilot. Use when: passing information between systems; requesting an action from the other AI; synchronizing state or data. NOT for: generalized A2A chat (a2a_chat); reporting findings (openclaw_report_finding).',
        parameters: {
          type: 'object',
          properties: {
            session_id: { type: 'string', description: 'Optional session ID' },
            direction: { type: 'string', enum: ['openclaw_to_flowpilot', 'flowpilot_to_openclaw'], description: 'Message direction' },
            message_type: { type: 'string', enum: ['observation', 'question', 'suggestion', 'learning', 'acknowledgment'], description: 'Message type' },
            content: { type: 'string', description: 'Message content' },
            payload: { type: 'object', description: 'Structured payload' },
          },
          required: ['content'],
        },
      },
    },
  },
  {
    name: 'openclaw_get_status',
    description: 'Get current beta test status. Use when: checking progress of an ongoing beta test; verifying if a test session is active; monitoring testing phase. NOT for: starting a new session (openclaw_start_session); ending a session (openclaw_end_session).',
    handler: 'module:openclaw',
    category: 'system',
    scope: 'internal',
    requires_approval: false,
    trust_level: 'auto',
    instructions: `## openclaw_get_status
### What
Returns an overview of active beta test sessions — open sessions, recent findings, and pending messages from FlowPilot.
### When to use
- Checking overall state of ongoing beta testing
- No arguments required
### NOT for
- Getting details of a specific session (use openclaw_exchange for that)`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'openclaw_get_status',
        description: 'Get current beta test status. Use when: checking progress of an ongoing beta test; verifying if a test session is active; monitoring testing phase. NOT for: starting a new session (openclaw_start_session); ending a session (openclaw_end_session).',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
    },
  },
  {
    name: 'a2a_request',
    description: 'Send a request to a connected A2A peer agent. Use when: delegating tasks to external agents, requesting music generation or audits from peers. NOT for: handling incoming peer messages (use a2a_chat).',
    handler: 'a2a:SoundSpace',
    category: 'automation',
    scope: 'internal',
    requires_approval: false,
    trust_level: 'auto',
    instructions: `## A2A Federation Request

You can use this skill to delegate tasks to connected peer agents via the A2A protocol.

### Currently Connected Peers
- **SoundSpace** — AI music and sound effects generation

### How to Use
When a user asks for music or sound effects, use this skill with:
- \`skill\`: The peer skill to invoke (e.g. \`generate_music\`, \`generate_sfx\`)
- \`prompt\`: Descriptive prompt for what to generate
- \`duration\`: Optional duration in seconds

### Examples
- "Create ambient background music for a meditation app" → \`skill: generate_music, prompt: "calm ambient meditation music with soft pads and nature sounds", duration: 60\`
- "Generate a notification sound" → \`skill: generate_sfx, prompt: "short pleasant notification chime", duration: 2\`

### Important
- The peer must be active and connected in the Federation module
- Requests are logged in a2a_activity for audit trail
- If the peer is unreachable, report the error clearly to the user`,
    tool_definition: {
      "type": "function",
      "function": {
            "name": "a2a_request",
            "parameters": {
                  "type": "object",
                  "required": [
                        "skill",
                        "prompt"
                  ],
                  "properties": {
                        "skill": {
                              "type": "string",
                              "description": "The skill name to call on the peer (e.g. generate_track)"
                        },
                        "prompt": {
                              "type": "string",
                              "description": "The prompt or description for the requested action"
                        },
                        "duration": {
                              "type": "number",
                              "description": "Duration in seconds (for music/audio generation)"
                        }
                  }
            },
            "description": "Send a request to a connected A2A peer agent. Use when: delegating tasks to external agents, requesting music generation or audits from peers. NOT for: handling incoming peer messages (use a2a_chat)."
      }
},
  },
  {
    name: 'dispatch_claw_mission',
    description: 'Dispatch a one-shot mission to an external OpenClaw agent via /v1/responses. Fire-and-forget: the Claw works independently and reports results back via MCP callback. Use when: running template audits, site testing, content review, or any task delegated to an external Claw agent. NOT for: real-time chat with peers (use a2a_chat); quick synchronous questions (use a2a_request).',
    handler: 'edge:openclaw-responses',
    category: 'automation',
    scope: 'internal',
    requires_approval: false,
    trust_level: 'auto',
    instructions: `## dispatch_claw_mission — One-Shot Mission Dispatch

### What
Sends a self-contained mission to an external OpenClaw agent. MCP credentials are auto-injected so the Claw can report findings back.

### CRITICAL: Writing good mission prompts
External agents may run on smaller models (27B). Your mission prompt MUST be:
- **Short**: Max 200 words. No walls of text.
- **Step-by-step**: Numbered list of 3-5 concrete steps.
- **Specific**: Tell them exactly what to check, not "audit everything".
- **Role-based**: Start with "You are a [role]. Your job is to [task]."

### GOOD mission prompt example:
"You are a customer testing FlowWink's booking system.

Steps:
1. Call GET /resources/health to check the site is online.
2. Check if bookings are available (look at the health data).
3. Report what you find. Send ONE finding per request.

Focus on: Is booking functional? Are there services listed? Any errors?"

### BAD mission prompt (too vague, too long):
"Please perform a comprehensive analysis of the entire website including SEO, performance, accessibility, content quality, user experience, and technical architecture..."

### Parameters
- \`peer_name\`: Name of the registered peer (e.g. "ClawOne")
- \`prompt\`: The mission instructions — short, specific, step-by-step
- \`inject_mcp_credentials\`: Set to true (default) to include callback credentials
- \`fire_and_forget\`: Set to true (default) to avoid timeout`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'dispatch_claw_mission',
        description: 'Dispatch a one-shot mission to an external OpenClaw agent. Fire-and-forget with MCP callback. Use when: running audits, site testing, or delegating tasks to a Claw. NOT for: real-time chat (a2a_chat).',
        parameters: {
          type: 'object',
          required: ['peer_name', 'prompt'],
          properties: {
            peer_name: {
              type: 'string',
              description: 'Name of the peer agent to dispatch to (e.g. "ClawOne")',
            },
            prompt: {
              type: 'string',
              description: 'Self-contained mission instructions. Be specific about what to audit/test and how to report back.',
            },
            inject_mcp_credentials: {
              type: 'boolean',
              description: 'Include MCP callback credentials in the prompt (default: true)',
            },
            fire_and_forget: {
              type: 'boolean',
              description: 'Send without waiting for response (default: true)',
            },
          },
        },
      },
    },
  },
  {
    description: 'Lists orders with abandoned or incomplete status. Use when: reviewing abandoned carts, recovery campaigns, checking incomplete orders. NOT for: checking specific order status (use check_order).',
    handler: 'module:orders',
    category: 'crm',
    scope: 'internal',
    requires_approval: true,
    trust_level: 'approve',
    instructions: `Identify orders needing follow-up. After listing, create a recovery campaign.`,
    tool_definition: {
      "type": "function",
      "function": {
            "name": "cart_recovery_check",
            "parameters": {
                  "type": "object",
                  "properties": {
                        "limit": {
                              "type": "number"
                        },
                        "days_back": {
                              "type": "number"
                        }
                  }
            },
            "description": "Lists orders with abandoned or incomplete status. Use when: reviewing abandoned carts, recovery campaigns, checking incomplete orders. NOT for: checking specific order status (use check_order)."
      }
},
  },
  {
    name: 'competitor_monitor',
    description: 'Scan a competitor website and analyze their content strategy and positioning. Use when: user wants competitive analysis, studying competitor content. NOT for: migrating competitor sites (use migrate_url), general web search (use search_web).',
    handler: 'db:agent_memory',
    category: 'analytics',
    scope: 'internal',
    requires_approval: false,
    trust_level: 'auto',
    instructions: `## Competitor Monitor Skill

When asked to monitor a competitor:
1. Use browser_fetch or search_web to gather their latest content
2. Analyze their website structure, blog topics, messaging, and product positioning
3. Compare with our own content strategy and identify gaps/opportunities
4. Store findings in agent_memory under category "context" with key "competitor:[domain]"
5. If patterns emerge across multiple scans, update the weekly digest

### Output format
Return a structured analysis with: company_name, domain, recent_content (titles/topics), positioning_summary, our_gaps, opportunities`,
    tool_definition: {
      "type": "function",
      "function": {
            "name": "competitor_monitor",
            "parameters": {
                  "type": "object",
                  "required": [
                        "domain",
                        "company_name"
                  ],
                  "properties": {
                        "domain": {
                              "type": "string",
                              "description": "Competitor domain (e.g. competitor.com)"
                        },
                        "focus_areas": {
                              "type": "array",
                              "items": {
                                    "type": "string"
                              },
                              "description": "Areas to focus on: content, pricing, features, messaging, seo"
                        },
                        "company_name": {
                              "type": "string",
                              "description": "Competitor company name"
                        }
                  }
            },
            "description": "Scan a competitor website and analyze their content strategy and positioning. Use when: user wants competitive analysis, studying competitor content. NOT for: migrating competitor sites (use migrate_url), general web search (use search_web)."
      }
},
  },
  {
    name: 'composio_execute',
    description: 'Execute an action in a connected external app via Composio. Use when: you have found the right tool via composio_search_tools and want to run it. NOT for: searching tools (use composio_search_tools first). Requires a specific action_name from search results.',
    handler: 'edge:composio-proxy',
    category: 'system',
    scope: 'internal',
    requires_approval: false,
    trust_level: 'notify',
    instructions: `Execute a Composio action. You must first use composio_search_tools to find the action_name. Pass the action_name and input parameters. The entity_id maps to the user/lead context.`,
    tool_definition: {
      "type": "function",
      "function": {
            "name": "composio_execute",
            "parameters": {
                  "type": "object",
                  "required": [
                        "action_name"
                  ],
                  "properties": {
                        "input": {
                              "type": "object",
                              "description": "Input parameters for the action"
                        },
                        "entity_id": {
                              "type": "string",
                              "description": "Optional: Composio entity ID (defaults to default)"
                        },
                        "action_name": {
                              "type": "string",
                              "description": "The Composio action identifier from search results (e.g. GMAIL_SEND_EMAIL)"
                        }
                  }
            },
            "description": "Execute an action in a connected external app via Composio. Use when: you have found the right tool via composio_search_tools and want to run it. NOT for: searching tools (use composio_search_tools first). Requires a specific action_name from search results."
      }
},
  },
  {
    name: 'composio_gmail_read',
    description: 'Read recent emails from Gmail via Composio. Use when: FlowPilot needs context about recent communication with a lead/customer, or needs to check for replies. NOT for: processing high-volume inboxes.',
    handler: 'edge:composio-proxy',
    category: 'communication',
    scope: 'both',
    requires_approval: false,
    trust_level: 'auto',
    instructions: `Read emails from the connected Gmail account via Composio OAuth. Use the 'query' parameter with standard Gmail search syntax (e.g. "from:user@example.com", "subject:proposal", "is:unread"). Returns subject, sender, date, and snippet for each match. Requires an active Composio Gmail connection. If no query is provided, returns the most recent emails.`,
    tool_definition: {
      "type": "function",
      "function": {
            "name": "composio_gmail_read",
            "parameters": {
                  "type": "object",
                  "required": [],
                  "properties": {
                        "query": {
                              "type": "string",
                              "description": "Gmail search query (e.g. from:user@example.com or subject:proposal)"
                        },
                        "max_results": {
                              "type": "integer",
                              "default": 5,
                              "description": "Max emails to return (default 5)"
                        }
                  }
            },
            "description": "Read recent emails from Gmail via Composio. Use when: FlowPilot needs context about recent communication with a lead/customer, or needs to check for replies. NOT for: processing high-volume inboxes."
      }
},
  },
  {
    name: 'composio_gmail_send',
    description: 'Send an email via Gmail through Composio. Use when: FlowPilot needs to send a follow-up, confirmation, or outreach email to a lead/customer. NOT for: bulk newsletters (use Resend/newsletter module instead).',
    handler: 'edge:composio-proxy',
    category: 'communication',
    scope: 'both',
    requires_approval: false,
    trust_level: 'notify',
    instructions: `Send an email from the connected Gmail account via Composio OAuth. Requires 'to' (recipient), 'subject', and 'body' (plain text or HTML). Optional: 'cc' and 'bcc' for additional recipients. Use for individual follow-ups, confirmations, or outreach — NOT for bulk sends or newsletters (use the newsletter module instead). Requires an active Composio Gmail connection.`,
    tool_definition: {
      "type": "function",
      "function": {
            "name": "composio_gmail_send",
            "parameters": {
                  "type": "object",
                  "required": [
                        "to",
                        "subject",
                        "body"
                  ],
                  "properties": {
                        "cc": {
                              "type": "string",
                              "description": "CC recipients (comma-separated)"
                        },
                        "to": {
                              "type": "string",
                              "description": "Recipient email address"
                        },
                        "bcc": {
                              "type": "string",
                              "description": "BCC recipients (comma-separated)"
                        },
                        "body": {
                              "type": "string",
                              "description": "Email body (plain text or HTML)"
                        },
                        "subject": {
                              "type": "string",
                              "description": "Email subject line"
                        }
                  }
            },
            "description": "Send an email via Gmail through Composio. Use when: FlowPilot needs to send a follow-up, confirmation, or outreach email to a lead/customer. NOT for: bulk newsletters (use Resend/newsletter module instead)."
      }
},
  },
  {
    name: 'composio_search_tools',
    description: 'Search for available tools and actions across 1000+ connected apps using intent-based discovery. Use when: user wants to perform an action in an external app (Gmail, Slack, HubSpot, Sheets, etc.) and you need to find the right tool. NOT for: internal FlowWink operations.',
    handler: 'edge:composio-proxy',
    category: 'system',
    scope: 'internal',
    requires_approval: false,
    trust_level: 'auto',
    instructions: `Search Composio for available tools matching an intent. Pass a natural language description of what you want to do. Returns matching actions with their parameters. Always search before executing.`,
    tool_definition: {
      "type": "function",
      "function": {
            "name": "composio_search_tools",
            "parameters": {
                  "type": "object",
                  "required": [
                        "intent"
                  ],
                  "properties": {
                        "app": {
                              "type": "string",
                              "description": "Optional: filter by specific app name (e.g. gmail, slack, hubspot)"
                        },
                        "intent": {
                              "type": "string",
                              "description": "Natural language description of what you want to do"
                        }
                  }
            },
            "description": "Search for available tools and actions across 1000+ connected apps using intent-based discovery. Use when: user wants to perform an action in an external app (Gmail, Slack, HubSpot, Sheets, etc.) and you need to find the right tool. NOT for: internal FlowWink operations."
      }
},
  },
  {
    name: 'contact_finder',
    description: 'Find business contacts by company domain. Use when: prospecting by company domain, finding email addresses for outreach. NOT for: managing existing leads (use manage_leads).',
    handler: 'edge:contact-finder',
    category: 'crm',
    scope: 'internal',
    requires_approval: false,
    trust_level: 'auto',
    instructions: `## Contact Finder Skill

Use this to find email addresses and contact information for people at a company.

### Actions
- **domain_search**: Find all known contacts at a domain. Good for building a contact list.
- **email_finder**: Find a specific person's email by their name + company domain. Good for targeted outreach.

### When to use
- After identifying a prospect company (you need the domain)
- When preparing introduction letters (find the decision maker)
- Lead enrichment: add contacts to existing companies

### Requirements
- Requires HUNTER_API_KEY secret. Will soft-fail without it.
- Extract domain from company URL: "https://www.acme.com/about" → "acme.com"

### Tips
- Always strip "www." from domains
- Check confidence scores: >90 is reliable, <50 is risky
- For domain_search, limit to 10 to conserve API credits`,
    tool_definition: {
      "type": "function",
      "function": {
            "name": "contact_finder",
            "parameters": {
                  "type": "object",
                  "required": [
                        "domain"
                  ],
                  "properties": {
                        "limit": {
                              "type": "number",
                              "description": "Max contacts for domain_search (default 10)"
                        },
                        "action": {
                              "enum": [
                                    "domain_search",
                                    "email_finder"
                              ],
                              "type": "string",
                              "description": "Search type (default: domain_search)"
                        },
                        "domain": {
                              "type": "string",
                              "description": "Company domain (e.g. acme.com)"
                        },
                        "last_name": {
                              "type": "string",
                              "description": "Last name (required for email_finder)"
                        },
                        "first_name": {
                              "type": "string",
                              "description": "First name (required for email_finder)"
                        }
                  }
            },
            "description": "Find business contacts by company domain. Use when: prospecting by company domain, finding email addresses for outreach. NOT for: managing existing leads (use manage_leads)."
      }
},
  },
  {
    name: 'content_calendar_view',
    description: 'Lists scheduled and draft content, identifies content gaps. Use when: reviewing editorial calendar, checking upcoming content, finding content gaps. NOT for: creating content (use write_blog_post), publishing content (use manage_blog_posts).',
    handler: 'module:blog',
    category: 'content',
    scope: 'internal',
    requires_approval: false,
    trust_level: 'auto',
    instructions: `Audit the content pipeline. Analyze gaps in topics, frequency, and SEO coverage.`,
    tool_definition: {
      "type": "function",
      "function": {
            "name": "content_calendar_view",
            "parameters": {
                  "type": "object",
                  "properties": {
                        "include_drafts": {
                              "type": "boolean"
                        },
                        "look_ahead_days": {
                              "type": "number"
                        }
                  }
            },
            "description": "Lists scheduled and draft content, identifies content gaps. Use when: reviewing editorial calendar, checking upcoming content, finding content gaps. NOT for: creating content (use write_blog_post), publishing content (use manage_blog_posts)."
      }
},
  },
  {
    name: 'create_page_block',
    description: 'Create a new content block on an existing page. Supports batch mode for adding multiple blocks at once. Use when: building a page after manage_page created it, adding sections during migration, user asks to add a hero/features/CTA section. NOT for: creating pages (use manage_page), editing existing blocks (use manage_page_blocks), full page migrations (use migrate_url first).',
    handler: 'module:pages',
    category: 'content',
    scope: 'internal',
    requires_approval: false,
    trust_level: 'auto',
    instructions: `Use this only after a page exists. Required: page_id and block_type. If page_id is missing, first call manage_page with action=create and use the returned page_id. Then call create_page_block.`,
    tool_definition: {
      "type": "function",
      "function": {
            "name": "create_page_block",
            "parameters": {
                  "type": "object",
                  "required": [
                        "page_id",
                        "block_type"
                  ],
                  "properties": {
                        "action": {
                              "type": "string",
                              "const": "add",
                              "description": "Action to perform"
                        },
                        "blocks": {
                              "type": "array",
                              "items": {
                                    "type": "object",
                                    "required": [
                                          "type",
                                          "data"
                                    ],
                                    "properties": {
                                          "data": {
                                                "type": "object",
                                                "description": "Block-specific data"
                                          },
                                          "type": {
                                                "type": "string",
                                                "description": "Block type"
                                          }
                                    }
                              },
                              "description": "BATCH MODE: Array of blocks to add in one call. Each: {type, data}. Use this to add 5-20 blocks at once instead of calling one at a time."
                        },
                        "page_id": {
                              "type": "string",
                              "description": "UUID of the page to add the block to"
                        },
                        "position": {
                              "type": "integer",
                              "description": "Position to insert the block at (0-indexed, default: end)"
                        },
                        "block_data": {
                              "type": "object",
                              "description": "Content data for the block"
                        },
                        "block_type": {
                              "type": "string",
                              "description": "Type of block to create (hero, text, features, etc.)"
                        }
                  }
            },
            "description": "Create content blocks on a page. Supports BATCH: pass blocks[] array with multiple {type,data} objects to add 5-20 blocks in ONE call. Also supports single block via block_type + block_data. Use batch mode when building full pages \u2014 much more efficient than one block at a time. Available block types: hero, text, cta, features, stats, testimonials, pricing, accordion, form, newsletter, quote, two-column, info-box, logos, comparison, social-proof, countdown, chat-launcher, separator, tabs, marquee, embed, table, progress, badge, floating-cta, notification-toast, parallax-section, bento-grid, section-divider, gallery, image, youtube, map, team, timeline, products, announcement-bar, lottie, webinar, featured-carousel, quick-links, trust-bar, category-nav, shipping-info, ai-assistant."
      }
},
  },
  {
    name: 'deal_stale_check',
    description: 'Identifies deals that have stalled and suggests actions. Use when: heartbeat pipeline review, finding stuck deals. NOT for: managing deals directly (use manage_deal).',
    handler: 'module:deals',
    category: 'crm',
    scope: 'internal',
    requires_approval: false,
    trust_level: 'auto',
    instructions: `Find deals stuck in a stage. Suggest follow-up or re-engagement strategies.`,
    tool_definition: {
      "type": "function",
      "function": {
            "name": "deal_stale_check",
            "parameters": {
                  "type": "object",
                  "properties": {
                        "stale_days": {
                              "type": "number"
                        },
                        "stage_filter": {
                              "type": "string"
                        }
                  }
            },
            "description": "Identifies deals that have stalled and suggests actions. Use when: heartbeat pipeline review, finding stuck deals. NOT for: managing deals directly (use manage_deal)."
      }
},
  },
  {
    name: 'generate_site_from_identity',
    description: 'Generate a complete website from the Business Identity profile. Use when: setting up a brand new site, user says "build my website", generating initial site structure. NOT for: editing existing pages (use manage_page), migrating external sites (use migrate_url).',
    handler: 'db:pages',
    category: 'content',
    scope: 'both',
    requires_approval: true,
    trust_level: 'approve',
    instructions: `Use when a client has filled in their Business Identity and wants a website generated. AI analyzes available data fields and composes appropriate blocks. Requires approval. Page created as draft.`,
    tool_definition: {
      "type": "function",
      "function": {
            "name": "generate_site_from_identity",
            "parameters": {
                  "type": "object",
                  "properties": {
                        "page_title": {
                              "type": "string",
                              "description": "Optional override for page title. Defaults to company name."
                        },
                        "include_footer": {
                              "type": "boolean",
                              "description": "Generate global footer. Default true."
                        },
                        "include_header": {
                              "type": "boolean",
                              "description": "Generate global header. Default true."
                        },
                        "include_landing_page": {
                              "type": "boolean",
                              "description": "Generate landing page. Default true."
                        }
                  },
                  "additionalProperties": false
            },
            "description": "Generate a complete website from the Business Identity profile. Use when: setting up a brand new site, user says \"build my website\", generating initial site structure. NOT for: editing existing pages (use manage_page), migrating external sites (use migrate_url)."
      }
},
  },
  {
    name: 'generate_social_post',
    description: 'Generate social media posts from existing blog content or content proposals. Use when: user wants LinkedIn/X posts from an article, repurposing blog content for social. NOT for: writing blog posts (use write_blog_post), batch social posts (use social_post_batch).',
    handler: 'db:content_proposals',
    category: 'content',
    scope: 'internal',
    requires_approval: false,
    trust_level: 'auto',
    instructions: `## Social Post Generation Skill

When generating social posts:
1. If a blog_post_id or proposal_id is provided, fetch the source content first
2. Adapt the content for the target platform:
   - LinkedIn: Professional tone, 1300 chars max, use line breaks, include hashtags
   - X/Twitter: Concise, 280 chars max, punchy hook, 1-2 hashtags
3. Always include a call-to-action or link back to the original content
4. Generate 2-3 variants for A/B testing when possible
5. Store generated posts in content_proposals channel_variants

### Platform guidelines
- LinkedIn: Start with a hook question or bold statement. Use emoji sparingly. End with hashtags.
- X: Lead with the most compelling insight. Thread format for longer content.`,
    tool_definition: {
      "type": "function",
      "function": {
            "name": "generate_social_post",
            "parameters": {
                  "type": "object",
                  "required": [
                        "platforms"
                  ],
                  "properties": {
                        "tone": {
                              "enum": [
                                    "professional",
                                    "casual",
                                    "bold",
                                    "educational"
                              ],
                              "type": "string",
                              "description": "Writing tone"
                        },
                        "topic": {
                              "type": "string",
                              "description": "Topic for freeform posts (when no source_id)"
                        },
                        "platforms": {
                              "type": "array",
                              "items": {
                                    "enum": [
                                          "linkedin",
                                          "x"
                                    ],
                                    "type": "string"
                              },
                              "description": "Target platforms"
                        },
                        "source_id": {
                              "type": "string",
                              "description": "ID of the blog post or proposal to repurpose"
                        },
                        "source_type": {
                              "enum": [
                                    "blog_post",
                                    "proposal",
                                    "freeform"
                              ],
                              "type": "string",
                              "description": "Type of source content"
                        }
                  }
            },
            "description": "Generate social media posts from existing blog content or content proposals. Use when: user wants LinkedIn/X posts from an article, repurposing blog content for social. NOT for: writing blog posts (use write_blog_post), batch social posts (use social_post_batch)."
      }
},
  },
  {
    name: 'inventory_report',
    description: 'Generates product inventory status report. Use when: checking stock levels, reviewing inventory health. NOT for: updating inventory (use manage_inventory), managing products (use manage_product).',
    handler: 'module:products',
    category: 'analytics',
    scope: 'internal',
    requires_approval: false,
    trust_level: 'auto',
    instructions: `Get a product catalog snapshot. Identify items to promote or restock.`,
    tool_definition: {
      "type": "function",
      "function": {
            "name": "inventory_report",
            "parameters": {
                  "type": "object",
                  "properties": {
                        "category_filter": {
                              "type": "string"
                        },
                        "low_stock_threshold": {
                              "type": "number"
                        }
                  }
            },
            "description": "Generates product inventory status report. Use when: checking stock levels, reviewing inventory health. NOT for: updating inventory (use manage_inventory), managing products (use manage_product)."
      }
},
  },
  {
    name: 'lead_nurture_sequence',
    description: 'Create automated email nurture sequences for new leads. Use when: setting up drip campaigns, automating lead follow-up emails. NOT for: sending single emails (use send_email), managing leads (use manage_leads).',
    handler: 'module:newsletter',
    category: 'crm',
    scope: 'internal',
    requires_approval: false,
    trust_level: 'auto',
    instructions: `Welcome: 3 emails over 7 days (intro, value prop, CTA). Re-engage: 2 emails. Upsell: 2 emails. Use company context from sales intelligence. Personalize with lead name.`,
    tool_definition: {
      "type": "function",
      "function": {
            "name": "lead_nurture_sequence",
            "parameters": {
                  "type": "object",
                  "required": [
                        "lead_id",
                        "sequence_type"
                  ],
                  "properties": {
                        "lead_id": {
                              "type": "string",
                              "description": "Lead UUID"
                        },
                        "email_count": {
                              "type": "number",
                              "description": "Number of emails"
                        },
                        "sequence_type": {
                              "enum": [
                                    "welcome",
                                    "re-engage",
                                    "upsell"
                              ],
                              "type": "string",
                              "description": "Sequence type"
                        }
                  }
            },
            "description": "Create automated email nurture sequences for new leads. Use when: setting up drip campaigns, automating lead follow-up emails. NOT for: sending single emails (use send_email), managing leads (use manage_leads)."
      }
},
  },
  {
    name: 'lead_pipeline_review',
    description: 'Reviews leads by status and score, suggests follow-up. Use when: heartbeat pipeline review, prioritizing lead outreach. NOT for: updating lead status (use manage_leads).',
    handler: 'module:crm',
    category: 'crm',
    scope: 'internal',
    requires_approval: false,
    trust_level: 'auto',
    instructions: `Audit the lead pipeline. Use prospect_research to enrich hot leads. Suggest follow-up actions.`,
    tool_definition: {
      "type": "function",
      "function": {
            "name": "lead_pipeline_review",
            "parameters": {
                  "type": "object",
                  "properties": {
                        "limit": {
                              "type": "number"
                        },
                        "status_filter": {
                              "enum": [
                                    "new",
                                    "contacted",
                                    "qualified",
                                    "all"
                              ],
                              "type": "string"
                        },
                        "days_since_contact": {
                              "type": "number"
                        }
                  }
            },
            "description": "Reviews leads by status and score, suggests follow-up. Use when: heartbeat pipeline review, prioritizing lead outreach. NOT for: updating lead status (use manage_leads)."
      }
},
  },
  {
    name: 'newsletter_subscribe',
    description: 'Subscribe a visitor to the newsletter. Use when: visitor wants to sign up for emails, newsletter opt-in. NOT for: managing subscribers (use manage_newsletter_subscribers), sending newsletters (use execute_newsletter_send).',
    handler: 'edge:newsletter-subscribe',
    category: 'communication',
    scope: 'external',
    requires_approval: false,
    trust_level: 'auto',
    instructions: `## Newsletter Subscribe
When a visitor wants to subscribe to the newsletter, collect their email and optionally name.
Confirm the subscription was successful.`,
    tool_definition: {
      "type": "function",
      "function": {
            "name": "newsletter_subscribe",
            "parameters": {
                  "type": "object",
                  "required": [
                        "email"
                  ],
                  "properties": {
                        "name": {
                              "type": "string",
                              "description": "Optional subscriber name"
                        },
                        "email": {
                              "type": "string",
                              "description": "Email address to subscribe"
                        }
                  }
            },
            "description": "Subscribe a visitor to the newsletter. Use when: visitor wants to sign up for emails, newsletter opt-in. NOT for: managing subscribers (use manage_newsletter_subscribers), sending newsletters (use execute_newsletter_send)."
      }
},
  },
  {
    name: 'product_promoter',
    description: 'Creates a promotional blog post for a product. Use when: user wants to promote a product via blog, creating product-focused articles. NOT for: general blog writing (use write_blog_post), managing products (use manage_product).',
    handler: 'module:blog',
    category: 'content',
    scope: 'internal',
    requires_approval: false,
    trust_level: 'auto',
    instructions: `Use to create SEO-friendly blog posts promoting products. Combine with search_web to research positioning.`,
    tool_definition: {
      "type": "function",
      "function": {
            "name": "product_promoter",
            "parameters": {
                  "type": "object",
                  "required": [
                        "product_name",
                        "key_benefits"
                  ],
                  "properties": {
                        "publish": {
                              "type": "boolean"
                        },
                        "key_benefits": {
                              "type": "array",
                              "items": {
                                    "type": "string"
                              }
                        },
                        "product_name": {
                              "type": "string"
                        },
                        "target_audience": {
                              "type": "string"
                        }
                  }
            },
            "description": "Creates a promotional blog post for a product. Use when: user wants to promote a product via blog, creating product-focused articles. NOT for: general blog writing (use write_blog_post), managing products (use manage_product)."
      }
},
  },
  {
    name: 'queue_beta_test',
    description: 'Queue a test scenario for OpenClaw to execute on next poll. Use when: scheduling tests for asynchronous execution. NOT for: running tests immediately (use openclaw_test).',
    handler: 'module:openclaw',
    category: 'system',
    scope: 'internal',
    requires_approval: false,
    trust_level: 'auto',
    instructions: `# Queue Beta Test

Queue a test scenario for OpenClaw to pick up.`,
    tool_definition: {
      "type": "function",
      "function": {
            "name": "queue_beta_test",
            "parameters": {
                  "type": "object",
                  "required": [
                        "scenario"
                  ],
                  "properties": {
                        "priority": {
                              "enum": [
                                    "normal",
                                    "high",
                                    "critical"
                              ],
                              "type": "string"
                        },
                        "scenario": {
                              "type": "string"
                        },
                        "instructions": {
                              "type": "string"
                        }
                  }
            },
            "description": "Queue a test scenario for OpenClaw to execute on next poll. Use when: scheduling tests for asynchronous execution. NOT for: running tests immediately (use openclaw_test)."
      }
},
  },
  {
    name: 'register_webinar',
    description: 'Register a visitor for an upcoming webinar. Use when: visitor wants to sign up for a webinar. NOT for: managing webinars (use manage_webinar).',
    handler: 'module:webinars',
    category: 'communication',
    scope: 'external',
    requires_approval: false,
    trust_level: 'auto',
    instructions: `## Webinar Registration
Help visitors register for upcoming webinars. Collect name, email, and optional phone.
Only show upcoming webinars. Confirm registration details.`,
    tool_definition: {
      "type": "function",
      "function": {
            "name": "register_webinar",
            "parameters": {
                  "type": "object",
                  "required": [
                        "action"
                  ],
                  "properties": {
                        "name": {
                              "type": "string",
                              "description": "Attendee name"
                        },
                        "email": {
                              "type": "string",
                              "description": "Attendee email"
                        },
                        "phone": {
                              "type": "string",
                              "description": "Optional phone"
                        },
                        "action": {
                              "enum": [
                                    "list_upcoming",
                                    "register"
                              ],
                              "type": "string",
                              "default": "list_upcoming"
                        },
                        "webinar_id": {
                              "type": "string",
                              "description": "Webinar to register for"
                        }
                  }
            },
            "description": "Register a visitor for an upcoming webinar. Use when: visitor wants to sign up for a webinar. NOT for: managing webinars (use manage_webinar)."
      }
},
  },
  {
    name: 'resolve_finding',
    description: 'Mark a beta test finding as resolved. Use when: closing fixed issues, updating finding status. NOT for: reporting new findings (use openclaw_report_finding).',
    handler: 'module:openclaw',
    category: 'system',
    scope: 'internal',
    requires_approval: false,
    trust_level: 'auto',
    instructions: `# Resolve Finding

Marks a finding as resolved after fix.`,
    tool_definition: {
      "type": "function",
      "function": {
            "name": "resolve_finding",
            "parameters": {
                  "type": "object",
                  "required": [
                        "finding_id"
                  ],
                  "properties": {
                        "finding_id": {
                              "type": "string"
                        },
                        "resolution_note": {
                              "type": "string"
                        }
                  }
            },
            "description": "Mark a beta test finding as resolved. Use when: closing fixed issues, updating finding status. NOT for: reporting new findings (use openclaw_report_finding)."
      }
},
  },
  {
    name: 'place_order',
    description: 'Place a customer order for products. Use when: an external agent (Claw) wants to simulate or execute a purchase as a customer. NOT for: managing existing orders (use manage_orders); creating purchase orders for suppliers (use create_purchase_order).',
    handler: 'module:openclaw',
    category: 'system',
    scope: 'external',
    requires_approval: false,
    trust_level: 'auto',
    mcp_exposed: true,
    instructions: `## place_order
### What
Creates a customer order with resolved product items and calculates the total.
### Parameters
- customer_email (required): email of the ordering customer
- customer_name: display name
- items (required): array of { product_id or product_name, quantity }
- currency: defaults to SEK
- notes: optional order notes
### Returns
order_id, status, total_cents, items_count`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'place_order',
        description: 'Place a customer order for products. Use when: an external agent (Claw) wants to simulate or execute a purchase as a customer. NOT for: managing existing orders (use manage_orders).',
        parameters: {
          type: 'object',
          required: ['customer_email', 'items'],
          properties: {
            customer_email: { type: 'string', description: 'Customer email address' },
            customer_name: { type: 'string', description: 'Customer display name' },
            items: {
              type: 'array',
              description: 'Products to order',
              items: {
                type: 'object',
                properties: {
                  product_id: { type: 'string', description: 'Product UUID' },
                  product_name: { type: 'string', description: 'Product name (fuzzy match)' },
                  quantity: { type: 'number', description: 'Quantity to order (default 1)' },
                },
              },
            },
            currency: { type: 'string', description: 'Currency code (default SEK)' },
            notes: { type: 'string', description: 'Optional order notes' },
          },
        },
      },
    },
  },
  {
    name: 'confirm_fulfillment',
    description: 'Confirm delivery/fulfillment of an order or purchase order. Use when: an external agent (Claw/supplier) confirms that goods have been delivered. NOT for: updating order status manually (use manage_orders); receiving goods against a PO (use receive_goods).',
    handler: 'module:openclaw',
    category: 'system',
    scope: 'external',
    requires_approval: false,
    trust_level: 'auto',
    mcp_exposed: true,
    instructions: `## confirm_fulfillment
### What
Marks an order or purchase order as delivered/received. Used by supplier agents to close the fulfillment loop.
### Parameters
- order_id: UUID of the customer order to confirm (provide this OR purchase_order_id)
- purchase_order_id: UUID of the PO to confirm
- tracking_number: optional tracking reference
- tracking_url: optional tracking URL
- notes: optional fulfillment notes
### Returns
success, entity type, fulfillment status`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'confirm_fulfillment',
        description: 'Confirm delivery/fulfillment of an order or purchase order. Use when: a supplier agent confirms goods have been delivered. NOT for: updating order status manually (use manage_orders).',
        parameters: {
          type: 'object',
          required: [],
          properties: {
            order_id: { type: 'string', description: 'Customer order UUID' },
            purchase_order_id: { type: 'string', description: 'Purchase order UUID' },
            tracking_number: { type: 'string', description: 'Tracking reference' },
            tracking_url: { type: 'string', description: 'Tracking URL' },
            notes: { type: 'string', description: 'Fulfillment notes' },
          },
        },
      },
    },
  },
  {
    name: 'sales_profile_setup',
    description: 'Set up or update the Sales Intelligence company profile or user profile. Use when: configuring sales profile, updating company positioning for prospecting. NOT for: managing business identity (use manage_business_identity).',
    handler: 'edge:sales-profile-setup',
    category: 'crm',
    scope: 'internal',
    requires_approval: false,
    trust_level: 'auto',
    instructions: `Use this skill when the user wants to set up their Sales Intelligence profile. For company profiles, ask about: ICP (ideal customer profile), value proposition, key differentiators, competitors, pricing strategy. For user profiles, ask about: their name, title, personal pitch, preferred tone, and email signature. Always confirm the data before saving.`,
    tool_definition: {
      "type": "function",
      "function": {
            "name": "sales_profile_setup",
            "parameters": {
                  "type": "object",
                  "required": [
                        "type",
                        "data"
                  ],
                  "properties": {
                        "data": {
                              "type": "object",
                              "description": "Profile data. For company: icp, value_proposition, differentiators, competitors, pricing_notes, industry. For user: full_name, title, email, personal_pitch, tone, signature."
                        },
                        "type": {
                              "enum": [
                                    "company",
                                    "user"
                              ],
                              "type": "string",
                              "description": "Profile type: company (shared business profile) or user (personal sales profile)"
                        }
                  }
            },
            "description": "Set up or update the Sales Intelligence company profile or user profile. Use when: configuring sales profile, updating company positioning for prospecting. NOT for: managing business identity (use manage_business_identity)."
      }
},
  },
  {
    name: 'scan_beta_findings',
    description: 'Scan unresolved beta test findings from OpenClaw. Use when: reviewing outstanding QA issues, finding unresolved bugs. NOT for: resolving findings (use resolve_finding).',
    handler: 'module:openclaw',
    category: 'system',
    scope: 'internal',
    requires_approval: false,
    trust_level: 'auto',
    instructions: `# Scan Beta Findings

## Decision Table
| Severity | Count | Action |
|----------|-------|--------|
| critical | ≥1 | Create objective immediately |
| high | ≥2 | Create objective |
| medium | ≥3 | Group into improvement objective |
| low | any | Monitor |`,
    tool_definition: {
      "type": "function",
      "function": {
            "name": "scan_beta_findings",
            "parameters": {
                  "type": "object",
                  "required": [],
                  "properties": {}
            },
            "description": "Scan unresolved beta test findings from OpenClaw. Use when: reviewing outstanding QA issues, finding unresolved bugs. NOT for: resolving findings (use resolve_finding)."
      }
},
  },
  {
    name: 'seo_content_brief',
    description: 'Generates SEO content brief with keywords and outline. Use when: planning SEO-optimized content, keyword research, creating content outlines. NOT for: writing full articles (use write_blog_post), technical SEO audits (use seo_audit).',
    handler: 'db:content_research',
    category: 'content',
    scope: 'internal',
    requires_approval: false,
    trust_level: 'auto',
    instructions: `Use before writing SEO-targeted content. Returns keywords, questions, competitor gaps, and outline.`,
    tool_definition: {
      "type": "function",
      "function": {
            "name": "seo_content_brief",
            "parameters": {
                  "type": "object",
                  "required": [
                        "topic"
                  ],
                  "properties": {
                        "topic": {
                              "type": "string"
                        },
                        "content_type": {
                              "enum": [
                                    "blog_post",
                                    "landing_page",
                                    "kb_article"
                              ],
                              "type": "string"
                        },
                        "target_audience": {
                              "type": "string"
                        }
                  }
            },
            "description": "Generates SEO content brief with keywords and outline. Use when: planning SEO-optimized content, keyword research, creating content outlines. NOT for: writing full articles (use write_blog_post), technical SEO audits (use seo_audit)."
      }
},
  },
  {
    name: 'social_post_batch',
    description: 'Creates social media posts for multiple platforms in batch. Use when: user wants posts for several platforms at once, bulk social content creation. NOT for: single platform post (use generate_social_post), blog writing (use write_blog_post).',
    handler: 'db:content_proposals',
    category: 'content',
    scope: 'internal',
    requires_approval: true,
    trust_level: 'approve',
    instructions: `After publishing blog content, create social variants. Requires approval before posting.`,
    tool_definition: {
      "type": "function",
      "function": {
            "name": "social_post_batch",
            "parameters": {
                  "type": "object",
                  "required": [
                        "blog_post_id"
                  ],
                  "properties": {
                        "tone": {
                              "enum": [
                                    "professional",
                                    "casual",
                                    "inspirational"
                              ],
                              "type": "string"
                        },
                        "platforms": {
                              "type": "array",
                              "items": {
                                    "enum": [
                                          "linkedin",
                                          "x",
                                          "instagram"
                                    ],
                                    "type": "string"
                              }
                        },
                        "blog_post_id": {
                              "type": "string"
                        }
                  }
            },
            "description": "Creates social media posts for multiple platforms in batch. Use when: user wants posts for several platforms at once, bulk social content creation. NOT for: single platform post (use generate_social_post), blog writing (use write_blog_post)."
      }
},
  },
  {
    name: 'ticket_triage',
    description: 'Auto-categorize incoming tickets, match against KB articles, and propose solutions. Use when: triaging new support requests, automated ticket routing. NOT for: escalating conversations (use escalation_handler).',
    handler: 'ticket_triage',
    category: 'crm',
    scope: 'internal',
    requires_approval: false,
    trust_level: 'auto',
    instructions: `You are triaging a support ticket. Follow these steps:

1. CATEGORIZE: Analyze the ticket subject and description to determine the category (bug, feature, question, billing, other) and priority (low, medium, high, urgent).

2. KB MATCH: Search the Knowledge Base for articles that match the ticket content.

3. AUTO-RESPOND: If a KB article provides a clear answer, draft a response and add it as a ticket comment. Set status to waiting.

4. ESCALATE: If no KB match or the issue is complex, set status to open and leave for human agent.

5. UPDATE: Always update the ticket with your determined category and priority.

Rules:
- Never auto-close tickets
- Always be empathetic and professional
- For billing issues, always escalate to human`,
    tool_definition: {
      "type": "function",
      "function": {
            "name": "ticket_triage",
            "parameters": {
                  "type": "object",
                  "required": [
                        "ticket_id"
                  ],
                  "properties": {
                        "ticket_id": {
                              "type": "string",
                              "description": "UUID of the ticket to triage"
                        },
                        "auto_respond": {
                              "type": "boolean",
                              "description": "Whether to auto-respond if KB match found"
                        }
                  }
            },
            "description": "Auto-categorize incoming tickets, match against KB articles, and propose solutions. Use when: triaging new support requests, automated ticket routing. NOT for: escalating conversations (use escalation_handler)."
      }
},
  },
  // ─── Accounting Skills ──────────────────────────────────────────────────────
  {
    name: 'manage_journal_entry',
    description: 'Create, list, or void double-entry journal entries in the accounting ledger. Supports BAS 2024 chart of accounts. Use when: booking a transaction; recording an expense; logging a payment; posting a salary; creating an accounting entry. NOT for: reading reports (use accounting_reports); managing chart of accounts.',
    handler: 'db:journal_entries',
    category: 'commerce',
    scope: 'internal',
    requires_approval: false,
    instructions: `## manage_journal_entry
### What
Creates or lists double-entry journal entries with debit/credit lines using BAS 2024 accounts.
### When to use
- Admin asks to book/record a transaction
- Invoice is paid and needs journal entry
- Salary, rent, VAT, or other recurring transactions
- Heartbeat detects unboooked invoices
- NOT for viewing balance sheet or P&L (use accounting_reports)
### Parameters
- **action**: 'create' | 'list' | 'void'. Default: 'create'.
- **entry_date**: ISO date string (YYYY-MM-DD). Defaults to today.
- **description**: Human-readable description of the transaction.
- **reference_number**: Optional reference (invoice number, receipt ID).
- **template_name**: Optional. Name of accounting template to use for auto-populating lines. Templates include: Löneutbetalning, Momsredovisning, Lokalhyra, Försäljning kontant, Försäljning faktura, Inköp kontant, Leverantörsbetalning, Banköverföring, Avskrivning inventarier, Preliminärskatt, Arbetsgivaravgifter, Kundförlust, Periodisering, Utdelning, Aktieägartillskott.
- **lines**: Array of {account_code, account_name, debit_cents, credit_cents, description}. Sum of debits MUST equal sum of credits.
### Common BAS 2024 accounts
- 1910 Kassa, 1920 PlusGiro, 1930 Företagskonto, 1940 Bank
- 2440 Leverantörsskulder, 2610 Utgående moms 25%, 2640 Ingående moms
- 3010 Försäljning varor, 3040 Försäljning tjänster
- 5010 Lokalhyra, 5410 Förbrukningsinventarier, 7010 Löner, 7510 Arbetsgivaravgifter
### Edge cases
- Unbalanced entries (debit ≠ credit) will be rejected
- If template_name is provided, lines from template are used as base — override amounts as needed
- Voiding creates a reversal entry, not a deletion`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_journal_entry',
        description: 'Create, list, or void double-entry journal entries in the accounting ledger. Supports BAS 2024 chart of accounts. Use when: booking a transaction; recording an expense; logging a payment; posting a salary; creating an accounting entry. NOT for: reading reports (use accounting_reports); managing chart of accounts.',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['create', 'list', 'void'], description: 'Action to perform. Default: create.' },
            entry_date: { type: 'string', description: 'Transaction date (YYYY-MM-DD). Defaults to today.' },
            description: { type: 'string', description: 'Description of the transaction' },
            reference_number: { type: 'string', description: 'Optional reference (invoice no, receipt ID)' },
            template_name: { type: 'string', description: 'Name of an accounting template to use for auto-populating lines' },
            entry_id: { type: 'string', description: 'Journal entry ID (required for void action)' },
            lines: {
              type: 'array',
              description: 'Debit/credit lines. Sum of debits must equal sum of credits.',
              items: {
                type: 'object',
                properties: {
                  account_code: { type: 'string', description: 'BAS 2024 account code (e.g. 1930)' },
                  account_name: { type: 'string', description: 'Account name (e.g. Företagskonto)' },
                  debit_cents: { type: 'number', description: 'Debit amount in cents (öre)' },
                  credit_cents: { type: 'number', description: 'Credit amount in cents (öre)' },
                  description: { type: 'string', description: 'Line description' },
                },
                required: ['account_code', 'account_name', 'debit_cents', 'credit_cents'],
              },
            },
          },
          required: ['action'],
        },
      },
    },
  },
  {
    name: 'accounting_reports',
    description: 'Generate accounting reports: balance sheet, profit & loss, general ledger, or account balances. Use when: reviewing financial status; checking account balances; generating monthly reports; assessing profitability. NOT for: creating journal entries (use manage_journal_entry).',
    handler: 'db:journal_entries',
    category: 'commerce',
    scope: 'internal',
    requires_approval: false,
    instructions: `## accounting_reports
### What
Reads accounting data and generates financial reports from the general ledger.
### When to use
- Admin asks about financial status, balances, or profitability
- Monthly/quarterly reporting
- Checking specific account activity
- NOT for creating transactions (use manage_journal_entry)
### Parameters
- **report_type**: 'balance_sheet' | 'profit_loss' | 'ledger' | 'account_balance'
- **period**: 'month' | 'quarter' | 'year' | 'all'. Default: 'all'.
- **account_code**: Optional. Filter to a specific account.
### Report types
- **balance_sheet**: Assets vs Liabilities + Equity. Shows if books are balanced.
- **profit_loss**: Income minus expenses for the period.
- **ledger**: All posted entries, optionally filtered by account.
- **account_balance**: Summary balances per account with debit/credit totals.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'accounting_reports',
        description: 'Generate accounting reports: balance sheet, profit & loss, general ledger, or account balances. Use when: reviewing financial status; checking account balances; generating monthly reports; assessing profitability. NOT for: creating journal entries (use manage_journal_entry).',
        parameters: {
          type: 'object',
          properties: {
            report_type: { type: 'string', enum: ['balance_sheet', 'profit_loss', 'ledger', 'account_balance'], description: 'Type of financial report' },
            period: { type: 'string', enum: ['month', 'quarter', 'year', 'all'], description: 'Time period. Default: all.' },
            account_code: { type: 'string', description: 'Filter to specific account code' },
          },
          required: ['report_type'],
        },
      },
    },
  },
  {
    name: 'manage_accounting_template',
    description: 'Create, list, update, or delete accounting templates (konteringsmallar) for the double-entry bookkeeping system. Enables FlowPilot to autonomously learn new transaction patterns and store them as reusable templates with BAS 2024 account mappings. Use when: a new transaction type is encountered that has no template; admin asks to create a booking template; optimizing existing templates; learning from successful journal entries. NOT for: creating journal entries (use manage_journal_entry); generating reports (use accounting_reports).',
    handler: 'db:accounting_templates',
    category: 'commerce',
    scope: 'internal',
    requires_approval: false,
    instructions: `## manage_accounting_template
### What
CRUD operations for accounting templates (konteringsmallar). Templates define reusable debit/credit line patterns for common transactions like salary payments, rent, VAT, purchases, etc.
### When to use
- Creating a new template when FlowPilot encounters a novel transaction type
- Listing available templates to find the right one for a transaction
- Updating a template to improve accuracy (e.g., fix account codes)
- Deleting obsolete or duplicate templates
### Autonomous template creation
When FlowPilot successfully books a new type of transaction manually (without a template), it SHOULD create a template for future use. This is the "black belt" of bookkeeping — learning from experience.
### Template anatomy
Each template has:
- **template_name**: Unique, descriptive name (e.g., "Löneutbetalning", "Inköp kontorsmaterial")
- **description**: What this template is for and when to use it
- **category**: salary, tax, rent, purchase, sale, depreciation, adjustment, other
- **keywords**: Array of trigger words for matching (Swedish terms preferred)
- **template_lines**: Array of {account_code, account_name, type: 'debit'|'credit', description}
### Best practices
- Always use correct BAS 2024 account codes
- Include both Swedish and English keywords for matching
- Keep descriptions specific enough for accurate auto-matching
- Each template must have at least one debit and one credit line
- Mark system templates (is_system: true) for built-in ones only`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_accounting_template',
        description: 'Create, list, update, or delete accounting templates. Use when: learning new transaction patterns; admin asks to create a booking template; optimizing templates. NOT for: creating journal entries (use manage_journal_entry).',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['create', 'list', 'update', 'delete'], description: 'Operation to perform' },
            template_name: { type: 'string', description: 'Name of the template (required for create/update)' },
            description: { type: 'string', description: 'What this template is for' },
            category: { type: 'string', description: 'Template category: salary, tax, rent, purchase, sale, depreciation, adjustment, other' },
            keywords: { type: 'array', items: { type: 'string' }, description: 'Trigger words for matching this template' },
            template_lines: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  account_code: { type: 'string', description: 'BAS 2024 account code' },
                  account_name: { type: 'string', description: 'Account name' },
                  type: { type: 'string', enum: ['debit', 'credit'] },
                  description: { type: 'string', description: 'Line description' },
                },
                required: ['account_code', 'account_name', 'type'],
              },
              description: 'Debit/credit line definitions',
            },
            template_id: { type: 'string', description: 'Template ID (required for update/delete)' },
            search: { type: 'string', description: 'Search term for list action' },
          },
          required: ['action'],
        },
      },
    },
  },
];
const DEFAULT_SOUL = {
  purpose: 'I am FlowPilot — the autonomous intelligence layer of this FlowWink website. I observe, reason, and act across every module (content, CRM, marketing, support, analytics) to make this site run itself. My north star is measurable business outcomes: traffic, leads, conversions, and customer satisfaction.',
  values: [
    'Outcome over output — every action must tie to a measurable goal',
    'Proactive > reactive — anticipate needs before they surface',
    'Quality over quantity — one great blog post beats five mediocre ones',
    'Human-in-the-loop for irreversible actions — never delete, never send without approval',
    'Learn from every cycle — reflect on what worked, prune what did not',
    'Transparency — always explain reasoning when asked',
  ],
  tone: 'Direct and confident, like a senior consultant. Warm but never chatty. Data-backed when possible. Use concrete numbers and specifics instead of vague adjectives.',
  philosophy: 'The website is a living system, not a static document. I treat each page, post, and interaction as part of a feedback loop: publish → measure → learn → improve. I own the operational layer so the business owner can focus on strategy and customers. I am not a chatbot — I am a digital operator with agency.',
  persona: 'FlowPilot — Autonomous Digital Operator',
};

const DEFAULT_IDENTITY = {
  name: 'FlowPilot',
  role: 'Autonomous Digital Operator',
  version: '2.0',
  capabilities: [
    'Content strategy & creation (blog posts, pages, KB articles)',
    'SEO audits & optimization',
    'Lead qualification & CRM management',
    'Newsletter composition & audience segmentation',
    'Booking & calendar management',
    'Ad campaign monitoring & optimization',
    'Competitor & industry research',
    'Analytics review & insight extraction',
    'Knowledge base gap analysis',
    'Autonomous self-improvement & skill evolution',
    'A2A peer communication',
  ],
  boundaries: [
    'Cannot send newsletters or emails without explicit approval',
    'Cannot delete user data or drop tables',
    'Cannot modify authentication, security settings, or RLS policies',
    'Cannot make financial transactions or change pricing without approval',
    'Must log all autonomous actions to agent_activity for traceability',
  ],
};

// =============================================================================
// Main Handler
// =============================================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      service_role_key: body_service_role_key,
      supabase_url,
      seed_skills = true,
      seed_soul = true,
      register_cron = false,
      // Template-aware configuration
      template_id,
      template_flowpilot: template_flowpilot_body,
    } = body;

    // If caller passes template_id but no inline template_flowpilot,
    // fall back to the built-in starter automations/workflows (same for all templates).
    const STARTER_FLOWPILOT = {
      objectives: [
        {
          goal: 'Establish content presence — publish 3 blog posts within the first week',
          success_criteria: { published_posts: 3 },
          constraints: { no_destructive_actions: true },
        },
        {
          goal: 'Research our top 3 competitors — document their positioning, pricing, and content gaps we can exploit',
          success_criteria: { competitors_researched: 3 },
          constraints: { no_destructive_actions: true },
        },
        {
          goal: 'Set up weekly digest — monitor site performance and report key metrics every Friday',
          success_criteria: { weekly_digest_active: true },
        },
      ],
      automations: [
        {
          name: 'Weekly Business Digest',
          description: 'Every Friday afternoon, summarise traffic, leads, and top content, then log to activity.',
          trigger_type: 'cron' as const,
          trigger_config: { cron: '0 16 * * 5', timezone: 'UTC' },
          skill_name: 'weekly_business_digest',
          skill_arguments: {},
          enabled: true,
        },
      ],
      workflows: [
        {
          name: 'Content Pipeline',
          description: 'Research a topic, generate a blog post proposal, write and publish.',
          steps: [
            { id: 'step-1', skill_name: 'research_content', skill_args: { query: '{{topic}}' } },
            { id: 'step-2', skill_name: 'generate_content_proposal', skill_args: { research_context: '{{step-1.output}}' } },
            { id: 'step-3', skill_name: 'write_blog_post', skill_args: { proposal: '{{step-2.output}}' }, on_failure: 'stop' },
          ],
          trigger_type: 'manual' as const,
          trigger_config: {},
          enabled: true,
        },
      ],
    };

    const template_flowpilot = template_flowpilot_body ?? (template_id ? STARTER_FLOWPILOT : undefined);

    // Prefer env var over body param (never require client to send service_role_key)
    const service_role_key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || body_service_role_key;

    if (!service_role_key) {
      return new Response(
        JSON.stringify({ error: 'service_role_key is required — set SUPABASE_SERVICE_ROLE_KEY as an edge function secret' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const url = supabase_url || Deno.env.get('SUPABASE_URL');
    if (!url) {
      return new Response(
        JSON.stringify({ error: 'supabase_url is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[setup-flowpilot] Starting agentic layer bootstrap...');

    const supabase = createClient(url, service_role_key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. Check if already set up
    const { error: checkError } = await supabase
      .from('agent_skills')
      .select('id')
      .limit(1);

    if (!checkError) {
      // Table exists — check if it has data
      const { data: existingSkills } = await supabase
        .from('agent_skills')
        .select('id')
        .limit(1);

      // Only bail out early if skills exist, skill re-seeding is not requested,
      // soul re-seeding is not requested, AND no template data is provided.
      // If a template is being applied (objectives/automations/cron), always continue.
      if (existingSkills && existingSkills.length > 0 && !seed_skills && !seed_soul && !template_flowpilot) {
        console.log('[setup-flowpilot] Already set up, no template provided and seed flags are false — skipping.');
        return new Response(
          JSON.stringify({
            success: true,
            message: 'FlowPilot agentic layer is already configured. Pass seed_skills=true to upsert new skills.',
            already_setup: true,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // 2. Run schema migration via SQL
    console.log('[setup-flowpilot] Running schema migration...');
    
    // We can't run raw SQL via REST API easily, so we check if tables exist
    // and create them via the Supabase management API or direct SQL
    // For self-hosted: the schema SQL should be run manually or via supabase db push
    // This function focuses on seeding data after schema is in place.
    
    // Check if the core tables exist by trying to query them
    const tableChecks = await Promise.all([
      supabase.from('agent_skills').select('id').limit(0),
      supabase.from('agent_memory').select('id').limit(0),
      supabase.from('agent_activity').select('id').limit(0),
      supabase.from('agent_objectives').select('id').limit(0),
      supabase.from('agent_automations').select('id').limit(0),
      supabase.from('agent_locks').select('lane').limit(0),
      supabase.from('agent_workflows').select('id').limit(0),
      supabase.from('agent_skill_packs').select('id').limit(0),
    ]);

    const missingTables = ['agent_skills', 'agent_memory', 'agent_activity', 'agent_objectives', 'agent_automations', 'agent_locks', 'agent_workflows', 'agent_skill_packs']
      .filter((_, i) => tableChecks[i].error);

    if (missingTables.length > 0) {
      console.log('[setup-flowpilot] Missing tables:', missingTables);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Agentic tables not found. Run the schema migration first.',
          missing_tables: missingTables,
          manual_required: true,
          schema_sql: AGENTIC_SCHEMA,
          instructions: [
            '1. Connect to your Supabase SQL editor or run: supabase db push',
            '2. Execute the schema_sql provided in this response',
            '3. Call this endpoint again to seed the default skills and soul',
          ],
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Seed skills (with pre-seed validation + batch insert)
    let skillsSeeded = 0;
    const seedWarnings: string[] = [];
    if (seed_skills) {
      console.log('[setup-flowpilot] Seeding default skills...');

      // Pre-seed validation: warn about incomplete skills in DEFAULT_SKILLS
      for (const s of DEFAULT_SKILLS) {
        if (!s.instructions || s.instructions.trim() === '') {
          seedWarnings.push(`Skill "${s.name}" has no instructions — agent won't know when/how to use it`);
        }
        const td = s.tool_definition as any;
        if (!td?.function?.name || !td?.function?.parameters) {
          seedWarnings.push(`Skill "${s.name}" has invalid tool_definition`);
        }
        if (!s.description || s.description.trim() === '') {
          seedWarnings.push(`Skill "${s.name}" has no description`);
        }
      }
      if (seedWarnings.length > 0) {
        console.warn(`[setup-flowpilot] Pre-seed validation: ${seedWarnings.length} warnings`);
        seedWarnings.forEach(w => console.warn(`  ⚠️ ${w}`));
      }
      
      // Fetch all existing skill names in a single query
      const { data: existingSkillRows } = await supabase
        .from('agent_skills')
        .select('name');
      const existingNames = new Set((existingSkillRows || []).map((r: { name: string }) => r.name));
      
      // Filter to only new skills
      const newSkills = DEFAULT_SKILLS.filter(s => !existingNames.has(s.name));
      
      if (newSkills.length > 0) {
        // Batch insert all new skills at once
        const { error } = await supabase.from('agent_skills').insert(newSkills);
        if (error) {
          console.error('[setup-flowpilot] Batch skill insert failed, falling back to individual:', error.message);
          // Fallback: insert one by one to identify problematic skills
          for (const skill of newSkills) {
            const { error: singleErr } = await supabase.from('agent_skills').insert(skill);
            if (singleErr) {
              console.error(`[setup-flowpilot] Failed to seed skill ${skill.name}:`, singleErr.message);
            } else {
              skillsSeeded++;
            }
          }
        } else {
          skillsSeeded = newSkills.length;
        }
      }
      
      console.log(`[setup-flowpilot] Seeded ${skillsSeeded} new skills (${existingNames.size} already existed)`);

      // Backfill instructions on existing skills that lack them
      const skillsToBackfill = DEFAULT_SKILLS.filter(
        s => existingNames.has(s.name) && s.instructions && s.instructions.trim() !== ''
      );
      if (skillsToBackfill.length > 0) {
        let backfilled = 0;
        for (const skill of skillsToBackfill) {
          const { data: updated } = await supabase
            .from('agent_skills')
            .update({ instructions: skill.instructions })
            .eq('name', skill.name)
            .is('instructions', null)
            .select('id');
          if (updated && updated.length > 0) backfilled++;
        }
        if (backfilled > 0) {
          console.log(`[setup-flowpilot] Backfilled instructions on ${backfilled} existing skills`);
        }
      }

      // ═══ MODULE-AWARE SKILL ACTIVATION ═══
      // After seeding, read module config and disable skills for inactive modules.
      // Core skills (not owned by any module) stay enabled.
      // This ensures first-boot only enables skills for active modules.
      try {
        const { data: modulesSetting } = await supabase
          .from('site_settings')
          .select('value')
          .eq('key', 'modules')
          .maybeSingle();

        if (modulesSetting?.value) {
          const modules = modulesSetting.value as Record<string, { enabled?: boolean }>;
          
          // Module → skill name mapping (mirrors src/lib/module-bootstraps/skill-map.ts)
          const MODULE_SKILL_OWNERS: Record<string, string[]> = {
            blog: ['write_blog_post','manage_blog_posts','manage_blog_categories','browse_blog','content_calendar_view','product_promoter','seo_content_brief','social_post_batch','generate_social_post','research_content','generate_content_proposal'],
            pages: ['manage_page','manage_page_blocks','create_page_block','manage_global_blocks','generate_site_from_identity','landing_page_compose'],
            knowledgeBase: ['manage_kb_article'],
            mediaLibrary: ['media_browse'],
            handbook: ['handbook_search'],
            leads: ['add_lead','manage_leads','lead_pipeline_review','lead_nurture_sequence','crm_task_list','crm_task_create','crm_task_update'],
            deals: ['manage_deal','deal_stale_check'],
            companies: ['manage_company'],
            forms: ['manage_form_submissions'],
            bookings: ['book_appointment','check_availability','browse_services','manage_booking_availability','manage_bookings'],
            ecommerce: ['browse_products','manage_product','manage_inventory','manage_orders','lookup_order','check_order_status','place_order','cart_recovery_check','inventory_report'],
            newsletter: ['send_newsletter','manage_newsletters','execute_newsletter_send','manage_newsletter_subscribers','newsletter_subscribe'],
            liveSupport: ['support_list_conversations','support_assign_conversation'],
            webinars: ['manage_webinar','register_webinar'],
            analytics: ['analyze_analytics','seo_audit_page','kb_gap_analysis','analyze_chat_feedback','weekly_business_digest','support_get_feedback','competitor_monitor'],
            salesIntelligence: ['prospect_research','prospect_fit_analysis','qualify_lead','enrich_company','contact_finder','sales_profile_setup'],
            paidGrowth: ['ad_campaign_create','ad_creative_generate','ad_performance_check','ad_optimize'],
            resume: ['manage_consultant_profile','match_consultant'],
            federation: ['a2a_chat','a2a_request','dispatch_claw_mission','openclaw_start_session','openclaw_end_session','openclaw_report_finding','openclaw_exchange','openclaw_get_status','queue_beta_test','resolve_finding','scan_beta_findings','place_order','confirm_fulfillment'],
            siteMigration: ['migrate_url'],
            composio: ['composio_execute','composio_search_tools','composio_gmail_read','composio_gmail_send'],
            tickets: ['ticket_triage'],
            accounting: ['manage_journal_entry','accounting_reports','manage_accounting_template'],
          };

          // Collect skills that should be disabled (module is off)
          const skillsToDisable: string[] = [];
          for (const [moduleId, skillNames] of Object.entries(MODULE_SKILL_OWNERS)) {
            const moduleConfig = modules[moduleId];
            if (!moduleConfig?.enabled) {
              skillsToDisable.push(...skillNames);
            }
          }

          if (skillsToDisable.length > 0) {
            const { error: disableErr } = await supabase
              .from('agent_skills')
              .update({ enabled: false })
              .in('name', skillsToDisable);
            if (disableErr) {
              console.warn('[setup-flowpilot] Failed to disable module-inactive skills:', disableErr.message);
            } else {
              console.log(`[setup-flowpilot] Disabled ${skillsToDisable.length} skills for inactive modules`);
            }
          }
        } else {
          console.log('[setup-flowpilot] No modules config found — all skills remain enabled (first boot default)');
        }
      } catch (modErr) {
        console.warn('[setup-flowpilot] Module-aware skill activation failed (non-fatal):', modErr);
      }
    }

    // 4. Seed soul & identity (with template overrides)
    let soulSeeded = false;
    if (seed_soul) {
      console.log('[setup-flowpilot] Seeding soul & identity...');
      
      // Merge template soul overrides with defaults
      const soulData = template_flowpilot?.soul
        ? { ...DEFAULT_SOUL, ...template_flowpilot.soul }
        : DEFAULT_SOUL;

      const { data: existingSoul } = await supabase
        .from('agent_memory')
        .select('id')
        .eq('key', 'soul')
        .maybeSingle();

      if (!existingSoul) {
        await supabase.from('agent_memory').insert({
          key: 'soul',
          value: soulData,
          category: 'preference',
          created_by: 'flowpilot',
        });
        soulSeeded = true;
      }

      const { data: existingIdentity } = await supabase
        .from('agent_memory')
        .select('id')
        .eq('key', 'identity')
        .maybeSingle();

      if (!existingIdentity) {
        await supabase.from('agent_memory').insert({
          key: 'identity',
          value: DEFAULT_IDENTITY,
          category: 'preference',
          created_by: 'flowpilot',
        });
      }

      // Seed agents (operational rules) if missing
      const { data: existingAgents } = await supabase
        .from('agent_memory')
        .select('id')
        .eq('key', 'agents')
        .maybeSingle();

      if (!existingAgents) {
        await supabase.from('agent_memory').insert({
          key: 'agents',
          value: {
            version: '2.0',
            direct_action_rules: `# Direct Action Protocol
- When asked to DO something → execute immediately using the appropriate skill
- When asked to AUTOMATE something → create an automation with trigger_type matching the intent
- When asked to PLAN something → create an objective with clear success_criteria
- Never ask "would you like me to..." — just do it and report the result
- If a skill fails, try an alternative approach before reporting failure`,
            self_improvement: `# Self-Improvement Protocol
- After every heartbeat, evaluate outcomes of recent actions (72h window)
- Create new skills via skill_create when a capability gap is identified
- Enrich existing skills via skill_instruct with learnings from real usage
- Use reflect to synthesize weekly patterns into strategic memory
- Track skill effectiveness via the Skill Scorecard (success/fail ratio)
- Prune or disable skills with <20% success rate after 10+ attempts`,
            memory_guidelines: `# Memory Protocol (OpenClaw §5)
- Save user preferences, brand voice, industry context as 'preference' category
- Save operational learnings (what worked/failed) as 'learning' category
- Save factual site data (traffic baselines, competitor info) as 'fact' category
- Always check memory before answering questions about the site or its history
- Use semantic search (search_memories) before creating duplicate entries
- Pre-compact: extract discrete facts before conversation history is pruned`,
            workflow_conventions: `# Workflow Conventions
- Heartbeat is the primary autonomous loop — runs every 12 hours
- Each heartbeat: evaluate outcomes → pick highest-priority objective → execute skills → log results
- Automations handle event-driven work (lead.created, form.submitted, etc.)
- Workflows handle multi-step orchestrations (research → write → review → publish)
- Budget guard: stop at 80% token usage, flush progress to memory first`,
            browser_rules: `# External Research Rules
- Use browser_fetch for competitor monitoring, industry research, and content inspiration
- Never scrape login-protected pages or personal data
- Cache research results in agent_memory with 'fact' category and expiry
- Respect rate limits: max 5 fetches per heartbeat cycle`,
          },
          category: 'preference',
          created_by: 'flowpilot',
        });
        console.log('[setup-flowpilot] Seeded agents memory key');
      }

    }

    // 4b. Seed tool_policy (global allow/deny overrides) — always, regardless of seed_soul flag
    const { data: existingPolicy } = await supabase
      .from('agent_memory')
      .select('id')
      .eq('key', 'tool_policy')
      .maybeSingle();

    if (!existingPolicy) {
      await supabase.from('agent_memory').insert({
        key: 'tool_policy',
        value: { blocked: [], notes: 'Global tool policy — add skill names to blocked[] to prevent agent use' },
        category: 'context',
        created_by: 'flowpilot',
      });
      console.log('[setup-flowpilot] Seeded tool_policy memory key');
    }

    // 5. Seed initial objectives from template (idempotent — skip existing goals)
    let objectivesSeeded = 0;
    if (template_flowpilot?.objectives?.length) {
      console.log('[setup-flowpilot] Seeding template objectives...');
      const { data: existingObjectives } = await supabase
        .from('agent_objectives')
        .select('goal');
      const existingGoals = new Set((existingObjectives || []).map((o: { goal: string }) => o.goal));

      for (const obj of template_flowpilot.objectives) {
        if (existingGoals.has(obj.goal)) {
          console.log(`[setup-flowpilot] Skipping duplicate objective: ${obj.goal}`);
          continue;
        }
        const { error } = await supabase.from('agent_objectives').insert({
          goal: obj.goal,
          success_criteria: obj.success_criteria || {},
          constraints: obj.constraints || {},
          status: 'active',
          progress: {},
        });
        if (error) {
          console.error(`[setup-flowpilot] Failed to seed objective:`, error);
        } else {
          objectivesSeeded++;
          existingGoals.add(obj.goal);
        }
      }
      console.log(`[setup-flowpilot] Seeded ${objectivesSeeded} objectives`);
    }

    // 6. Auto-register heartbeat cron job via DB function (idempotent)
    let cronRegistered = false;
    try {
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || '';
      
      const { data: cronResult, error: cronError } = await supabase.rpc('register_flowpilot_cron', {
        p_supabase_url: url,
        p_anon_key: anonKey,
      });

      if (cronError) {
        console.warn('[setup-flowpilot] Cron registration failed (manual setup may be needed):', cronError.message);
      } else {
        cronRegistered = true;
        console.log('[setup-flowpilot] Cron registration result:', cronResult);
      }
    } catch (cronErr) {
      console.warn('[setup-flowpilot] Cron registration failed (non-fatal):', cronErr);
    }

    // 7. Seed starter automations from template
    let automationsSeeded = 0;
    if (template_flowpilot?.automations?.length) {
      for (const auto of template_flowpilot.automations) {
        await supabase.from('agent_automations').delete().eq('name', auto.name);
        const { error } = await supabase.from('agent_automations').insert({
          name: auto.name,
          description: auto.description || null,
          trigger_type: auto.trigger_type,
          trigger_config: auto.trigger_config || {},
          skill_name: auto.skill_name,
          skill_arguments: auto.skill_arguments || {},
          enabled: auto.enabled !== false,
        });
        if (!error) automationsSeeded++;
      }
    }

    // 8. Seed starter workflows from template
    let workflowsSeeded = 0;
    if (template_flowpilot?.workflows?.length) {
      for (const wf of template_flowpilot.workflows) {
        await supabase.from('agent_workflows').upsert({
          name: wf.name,
          description: wf.description || null,
          steps: wf.steps,
          trigger_type: wf.trigger_type || 'manual',
          trigger_config: wf.trigger_config || {},
          enabled: wf.enabled !== false,
        }, { onConflict: 'name' });
        workflowsSeeded++;
      }
    }

    console.log(`[setup-flowpilot] Seeded ${automationsSeeded} automations, ${workflowsSeeded} workflows`);

    // ═══════════════════════════════════════════
    // 9. POST-BOOTSTRAP INTEGRITY GATE + SKILL HASH
    // Uses shared integrity module for checks and stores
    // expected_skill_hash for drift detection.
    // ═══════════════════════════════════════════
    let integrityResult: any = null;
    try {
      console.log('[setup-flowpilot] Running post-bootstrap integrity check...');

      // Use shared integrity module
      const { runIntegrityChecks, computeSkillHash } = await import('../_shared/integrity.ts');
      const result = await runIntegrityChecks(supabase);
      integrityResult = result;
      console.log(`[setup-flowpilot] Integrity score: ${result.score}% (${result.passedChecks}/${result.totalChecks} checks passed)`);

      // Compute and store expected skill hash for drift detection
      try {
        const { data: enabledSkills } = await supabase
          .from('agent_skills')
          .select('name, instructions')
          .eq('enabled', true);
        
        if (enabledSkills?.length) {
          const hash = await computeSkillHash(enabledSkills);
          await supabase.from('agent_memory').upsert({
            key: 'expected_skill_hash',
            value: { hash, skill_count: enabledSkills.length, computed_at: new Date().toISOString() },
            category: 'context',
            created_by: 'flowpilot',
          }, { onConflict: 'key' });
          console.log(`[setup-flowpilot] Stored expected_skill_hash: ${hash.slice(0, 16)}... (${enabledSkills.length} skills)`);
        }
      } catch (hashErr) {
        console.warn('[setup-flowpilot] Skill hash storage failed (non-fatal):', hashErr);
      }

      // Auto-create objective if score is below 80%
      if (result.score < 80 && result.issues.length > 0) {
        const goalText = `Fix system integrity issues (score: ${result.score}%). Problems: ${result.issues.join('; ')}`;
        const { data: existingObj } = await supabase
          .from('agent_objectives')
          .select('id')
          .ilike('goal', '%system integrity%')
          .in('status', ['active', 'in_progress'])
          .maybeSingle();

        if (!existingObj) {
          await supabase.from('agent_objectives').insert({
            goal: goalText,
            status: 'active',
            constraints: { auto_created: true, source: 'integrity_gate' },
            success_criteria: { integrity_score_above: 90 },
          });
          console.log('[setup-flowpilot] Auto-created integrity fix objective');
        }
      }
    } catch (intErr) {
      console.warn('[setup-flowpilot] Integrity check failed (non-fatal):', intErr);
    }

    console.log('[setup-flowpilot] Bootstrap complete!');

    return new Response(
      JSON.stringify({
        success: true,
        message: 'FlowPilot agentic layer bootstrapped successfully!',
        details: {
          skills_seeded: skillsSeeded,
          soul_seeded: soulSeeded,
          tool_policy_seeded: !existingPolicy,
          objectives_seeded: objectivesSeeded,
          cron_registered: cronRegistered,
          total_default_skills: DEFAULT_SKILLS.length,
          template_configured: !!template_flowpilot,
          integrity: integrityResult,
        },
        next_steps: [
          'Configure AI provider in Site Settings → System AI',
          'Set OPENAI_API_KEY or GEMINI_API_KEY as secrets',
          'Open /admin/flowpilot to start using FlowPilot',
        ],
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[setup-flowpilot] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
