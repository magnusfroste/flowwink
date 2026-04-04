import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
    description: 'Create a draft blog post with title, topic, tone, and optional pre-written content. If content is provided it will be used directly; otherwise AI generates it.',
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
        description: 'Create a draft blog post. IMPORTANT: Always provide the content parameter with the full blog post text in markdown. If you have source material, write the blog content yourself and pass it in the content field.',
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
    description: 'Add a new lead to the CRM.',
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
        description: 'Add a lead to the CRM system.',
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
    description: 'Create a booking for a customer.',
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
        description: 'Book an appointment for a customer.',
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
    description: 'Get page view analytics for a given period.',
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
        description: 'Analyze site traffic and page views.',
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
    description: 'Create a newsletter draft.',
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
        description: 'Create a newsletter draft or schedule for sending.',
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
    description: 'Create a new high-level objective for FlowPilot to work toward.',
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
        description: 'Create a goal for autonomous operation.',
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
    description: 'Search the web for information. Supports Firecrawl (paid, high quality) and Jina (free tier available). Agent chooses provider based on need.',
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
        description: 'Search the web for information. Set preferred_provider based on task needs.',
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
    description: 'Scrape a single URL and extract its content as markdown. Supports Firecrawl (JS rendering, paid) and Jina Reader (free tier available).',
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
        description: 'Scrape a URL and extract content. Set preferred_provider based on site type.',
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
        description: 'Extract and map an external page into CMS-ready blocks. Returns title, blocks, branding, and discovered pages.',
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
    description: 'Look up order status by order ID or customer email.',
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
        description: 'Look up order information.',
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
    description: 'AI-powered lead qualification and scoring. Analyzes lead activities, company data, and engagement to produce a score and summary.',
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
        description: 'Qualify and score a lead using AI analysis.',
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
    description: 'Enrich a company record with industry, size, website info via domain scraping and AI analysis.',
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
        description: 'Enrich company data from its domain.',
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
    description: 'Deep AI research on a topic — audience insights, content angles, hooks, competitive landscape, and recommended structure.',
    handler: 'edge:research-content',
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
        description: 'Research a topic for content creation.',
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
    description: 'Generate multi-channel content (blog, newsletter, LinkedIn, X) from a topic with brand voice and tone control.',
    handler: 'edge:generate-content-proposal',
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
        description: 'Generate content across multiple channels.',
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
    description: 'Research a company — scrape website, find contacts via Hunter.io, analyze with AI.',
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
        description: 'Research a prospect company and find contacts.',
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
    description: 'Analyze how well a prospect company fits your ideal customer profile.',
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
        description: 'Analyze prospect-company fit.',
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
    description: 'Generate a cross-module business summary covering views, leads, bookings, orders, posts, newsletters.',
    handler: 'edge:business-digest',
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
        description: 'Generate a business digest report.',
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
    description: 'Check and publish pages and blog posts that are due for scheduled publishing.',
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
        description: 'Publish pages/posts that have passed their scheduled date.',
        parameters: { type: 'object', properties: {} },
      },
    },
  },
  {
    name: 'scan_gmail_inbox',
    description: 'Scan connected Gmail inbox for business signals — new leads, partnership inquiries, support requests.',
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
        description: 'Scan Gmail for business-relevant emails and extract signals.',
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
    description: 'Actually send a prepared newsletter to all confirmed subscribers via email.',
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
        description: 'Send a newsletter to subscribers.',
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
    description: 'Analyze page views, chat feedback, and lead conversions to distill learnings into persistent memory.',
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
        description: 'Analyze platform data and save learnings to memory.',
        parameters: { type: 'object', properties: {} },
      },
    },
  },
  {
    name: 'extract_pdf_text',
    description: 'Extract text content from any PDF document — resumes, contracts, reports, invoices, etc. Uses AI vision to read the PDF and return structured text.',
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
        description: 'Extract all text from a PDF file. Use when a user attaches a PDF or references a PDF URL. Works for any document type: resumes, contracts, reports, invoices.',
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
    description: 'Fetch content from any URL — automatically picks the right strategy. For login-walled sites (LinkedIn, X, Facebook), uses the Chrome Extension relay (user\'s real browser session, ToS-safe). For public URLs, uses Firecrawl server-side scraping. This is the PRIMARY tool for reading web pages.',
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
        description: 'Fetch content from any URL. Automatically uses Chrome Extension relay for login-walled sites (LinkedIn, X) and Firecrawl for public URLs. This is the preferred way to read web pages.',
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
  {
    name: 'scrape_url',
    description: 'Server-side URL scraping via Firecrawl. For public pages only. Prefer browser_fetch which auto-routes between relay and scraping.',
    handler: 'edge:scrape-url',
    category: 'search',
    scope: 'internal',
    requires_approval: false,
    instructions: `## When to use
- PREFER browser_fetch over this skill — it handles routing automatically
- Only use scrape_url directly when you specifically need Firecrawl features
- Never use for LinkedIn, X, or other login-walled sites`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'scrape_url',
        description: 'Fetch and extract content from any URL. Returns title, description, and clean markdown text. Use for reading web pages, LinkedIn posts, articles, etc.',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'The URL to scrape' },
            extract_links: { type: 'boolean', description: 'Also extract all links from the page (default false)' },
          },
          required: ['url'],
        },
      },
    },
  },
  {
    name: 'process_signal',
    description: 'Process an incoming signal captured by the Chrome extension or external webhook. Analyzes the content and determines next actions.',
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
        description: 'Process a captured signal from an external operator.',
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
        description: 'Manage CMS pages. Actions: list, get, create, update, publish, archive, delete, rollback. For migration flows: call migrate_url first, then manage_page action=create, then manage_page_blocks.',
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
    description: 'Manipulate blocks on a page: list, add, update, remove, reorder, duplicate, toggle visibility.',
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
        description: 'Manage blocks on a specific page. For text blocks, block_data must use Tiptap JSON: { content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Your text here" }] }, { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Section Title" }] }] } }. For other blocks see manage_page description.',
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
    description: 'Manage existing blog posts: list, get, update, publish, unpublish, delete.',
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
        description: 'Manage blog posts. Actions: list, get, update, publish, unpublish, delete.',
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
    description: 'Manage blog categories and tags: list, create, delete categories/tags.',
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
        description: 'Manage blog categories and tags.',
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
    description: 'Browse published blog posts (visitor-facing).',
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
        description: 'List published blog posts for visitors.',
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
    description: 'Manage knowledge base articles: list, get, create, update, publish, unpublish.',
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
        description: 'Manage KB articles.',
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
    description: 'Manage global blocks (header, footer, etc): list, get, update, toggle active status.',
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
        description: 'Manage global blocks like header, footer.',
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
    description: 'Full lead management: list, get, update status/score, delete leads.',
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
        description: 'Manage CRM leads. Actions: list, get, update, delete.',
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
    description: 'Manage deals: list, create, update, move stage.',
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
        description: 'Manage sales deals.',
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
    description: 'Manage companies: list, get, create, update, delete.',
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
        description: 'Manage CRM companies.',
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
    description: 'Browse products in the catalog (visitor-facing).',
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
        description: 'Browse available products.',
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
    description: 'Manage products: create, update, delete, manage variants.',
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
        description: 'Manage products in the catalog.',
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
    description: 'Manage product inventory: list stock, update quantities, set low-stock alerts.',
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
        description: 'Manage product inventory levels.',
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
    description: 'Manage orders: list, get details, update status, view stats.',
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
        description: 'Manage e-commerce orders.',
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
    description: 'Check booking availability for a specific date.',
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
        description: 'Check available booking slots for a date.',
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
    description: 'List available booking services.',
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
        description: 'List available booking services.',
        parameters: { type: 'object', properties: {} },
      },
    },
  },
  {
    name: 'manage_booking_availability',
    description: 'Manage booking hours and blocked dates.',
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
        description: 'Manage booking availability hours and blocked dates.',
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
    description: 'List, view, update or cancel bookings.',
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
        description: 'Manage bookings: list, update status, cancel.',
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
    description: 'Manage newsletter subscribers: list, search, count, remove.',
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
        description: 'Manage newsletter subscribers.',
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
    description: 'Manage newsletters: list, get, create, update, delete. Full CRUD on newsletter drafts and scheduled sends.',
    handler: 'module:newsletter',
    category: 'content',
    scope: 'internal',
    requires_approval: false,
    trust_level: 'notify',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_newsletters',
        description: 'Manage newsletters. Actions: list, get, create, update, delete. Create supports AI generation: pass topic (or blog_content) instead of content_html to auto-generate newsletter content.',
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
    description: 'Manage consultant/resume profiles: list, create, update, delete, deduplicate.',
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
        description: 'Manage consultant profiles. Actions: list, create, update, delete, find_duplicates.',
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
    description: 'Match consultants to a job description using AI.',
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
        description: 'Find best matching consultants for a job.',
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
    description: 'Browse, search, and manage media files in the media library. Supports listing, getting URLs, deleting single files, and clearing entire library.',
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
        description: 'Manage media library: list, search, delete, clear all files.',
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
    description: 'View and manage form submissions.',
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
        description: 'View and manage form submissions.',
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
    description: 'Manage webinars and registrations.',
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
        description: 'Manage webinars: list, create, update, view registrations.',
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
    description: 'Read and update site settings including module configuration, site name, theme, etc.',
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
        description: 'Read and update site settings. Keys: modules, site_name, theme, ai_config, chat_config, etc.',
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
    description: 'Run an SEO audit on a page or blog post, checking title, meta, content depth, images, links.',
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
        description: 'Run SEO audit on a page/post by slug.',
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
    description: 'Analyze chat data to find questions not covered by KB articles, underperforming articles, and content gaps.',
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
        description: 'Find knowledge base content gaps from chat data.',
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
    name: 'analyze_chat_feedback',
    description: 'Analyze chat feedback: summary stats, negative feedback drill-down.',
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
        description: 'Analyze visitor chat feedback.',
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
    description: 'Create and manage agent automations (cron jobs, event triggers, signal handlers).',
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
        description: 'Create and manage agent automations.',
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
    description: 'Create a new ad campaign with objective, budget, target audience, and platform. Requires approval due to budget commitment.',
    handler: 'edge:ad-campaign-create',
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
        description: 'Create a new ad campaign. Requires approval because it commits budget.',
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
    description: 'Generate ad creative (headline, body, CTA) using AI based on campaign objective and target audience.',
    handler: 'edge:ad-creative-generate',
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
        description: 'Generate ad copy and creative using AI.',
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
    description: 'Check ad campaign performance metrics: spend, impressions, clicks, CTR, CPC, conversions.',
    handler: 'edge:ad-performance-check',
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
        description: 'Get performance metrics for ad campaigns.',
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
    description: 'Analyze campaign performance and recommend optimizations: pause underperformers, scale winners, adjust budgets. Requires approval.',
    handler: 'edge:ad-optimize',
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
        description: 'Optimize ad campaigns based on performance data. Requires approval for budget changes.',
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
    description: 'Autonomously compose a landing page from the block library based on a campaign goal, target audience, and optional ad campaign reference. Uses AI to select optimal block types, generate copy, and publish as a draft page.',
    handler: 'edge:landing-page-compose',
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
        description: 'Compose a landing page from blocks based on campaign goal and audience. Creates a draft page ready for review.',
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
    description: 'List support conversations filtered by status (waiting_agent, with_agent, escalated, closed). Returns customer name, email, priority, sentiment, and escalation reason.',
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
        description: 'List support conversations by status. Use to monitor escalated or waiting conversations.',
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
    description: 'Assign or reassign a support conversation to an agent. Updates conversation status to with_agent.',
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
        description: 'Assign a conversation to an agent or change its status.',
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
    description: 'Retrieve chat feedback ratings and comments. Useful for monitoring customer satisfaction and identifying knowledge gaps.',
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
        description: 'Get chat feedback to analyze customer satisfaction and common issues.',
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
    description: 'List CRM tasks with optional filters for lead, deal, priority, and completion status.',
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
        description: 'List CRM tasks. Filter by lead, deal, priority, or completion status.',
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
    description: 'Create a new CRM task with title, description, due date, priority, and optional lead/deal link.',
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
        description: 'Create a CRM task. Link to a lead or deal for context.',
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
    description: 'Update an existing CRM task — change title, description, priority, due date, or mark as completed.',
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
        description: 'Update a CRM task. Use completed_at to mark complete.',
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
    description: 'Read current site branding settings including logo, colors, fonts, and favicon from site_settings.',
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
        description: 'Get current site branding (logo, colors, fonts, favicon).',
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
    description: 'Update site branding settings — logo URL, primary/accent colors, font family, favicon.',
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
        description: 'Update branding settings. Requires approval.',
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
    description: 'List platform users with their roles from user_roles table. Shows email, role, and last sign-in.',
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
        description: 'List platform users and their assigned roles.',
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
  // ── manage_* CRUD skills (OpenClaw feedback: highest-impact gap) ──────────
  {
    name: 'manage_blog_posts',
    description: 'Update, publish, unpublish, or delete existing blog posts.',
    handler: 'module:blog',
    category: 'content',
    scope: 'internal',
    requires_approval: false,
    instructions: `## manage_blog_posts
### What
Full CRUD management of existing blog posts — update content, change status, publish, unpublish, or delete.
### When to use
- Publish a draft blog post (action='publish')
- Update title, content, excerpt, or featured image on an existing post
- Unpublish or revert a post to draft (action='unpublish')
- Delete a post (action='delete')
- NOT for creating new posts — use write_blog_post for that
### Parameters
- **action**: Required. One of: 'update', 'publish', 'unpublish', 'delete'.
- **post_id**: Required. UUID of the blog post. Find via search or listing.
- **updates**: Object with fields to update. Only used with action='update'.
  - title, content (markdown), excerpt, featured_image, featured_image_alt, slug, is_featured
### Edge cases
- 'publish' sets status='published' and published_at=now() if not already set.
- 'unpublish' reverts to 'draft' — published_at is preserved for reference.
- 'delete' is permanent — consider unpublishing first.
- Always confirm post_id exists before calling — use a listing query if unsure.
### Chaining
After publishing: consider calling search_web to share on social, or check analytics after 48h.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_blog_posts',
        description: 'Update, publish, unpublish, or delete an existing blog post.',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['update', 'publish', 'unpublish', 'delete'], description: 'Operation to perform' },
            post_id: { type: 'string', description: 'UUID of the blog post' },
            updates: {
              type: 'object',
              description: 'Fields to update (only for action=update)',
              properties: {
                title: { type: 'string' },
                content: { type: 'string', description: 'Full markdown content' },
                excerpt: { type: 'string' },
                featured_image: { type: 'string' },
                featured_image_alt: { type: 'string' },
                slug: { type: 'string' },
                is_featured: { type: 'boolean' },
              },
            },
          },
          required: ['action', 'post_id'],
        },
      },
    },
  },
  {
    name: 'manage_leads',
    description: 'Update lead status, score, notes, or delete a lead from the CRM.',
    handler: 'module:crm',
    category: 'crm',
    scope: 'both',
    requires_approval: false,
    instructions: `## manage_leads
### What
Update, score, qualify, or delete existing leads in the CRM.
### When to use
- Change lead status (new → contacted → qualified → converted → lost)
- Update lead score based on engagement signals
- Add or update notes on a lead
- Delete spam or duplicate leads (action='delete')
- NOT for adding new leads — use add_lead for that
### Parameters
- **action**: Required. One of: 'update', 'delete'.
- **lead_id**: Required. UUID of the lead.
- **updates**: Object with fields to update (only for action='update').
  - status, score, name, phone, notes, company_id, tags
### Edge cases
- Status changes trigger automations (lead.status_changed signal) — update status intentionally.
- Score changes also trigger automations (lead.score_updated signal).
- Deleting a lead with active deals will orphan those deals — check deals first.
### Chaining
After qualifying a lead (status='qualified'): consider creating a deal via manage_deals.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_leads',
        description: 'Update or delete an existing CRM lead.',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['update', 'delete'], description: 'Operation to perform' },
            lead_id: { type: 'string', description: 'UUID of the lead' },
            updates: {
              type: 'object',
              description: 'Fields to update (only for action=update)',
              properties: {
                status: { type: 'string', enum: ['new', 'contacted', 'qualified', 'converted', 'lost'] },
                score: { type: 'number', description: 'Lead score (0-100)' },
                name: { type: 'string' },
                phone: { type: 'string' },
                notes: { type: 'string' },
                company_id: { type: 'string' },
                tags: { type: 'array', items: { type: 'string' } },
              },
            },
          },
          required: ['action', 'lead_id'],
        },
      },
    },
  },
  // ── E-commerce A2A Skills ─────────────────────────────────────────────
  {
    name: 'browse_products',
    description: 'Browse the product catalog. Returns active products with prices, images, and stock info.',
    handler: 'edge:product-catalog',
    category: 'commerce',
    scope: 'external',
    requires_approval: false,
    trust_level: 'auto',
    instructions: `## browse_products
### What
Returns the public product catalog via the product-catalog edge function.
### When to use
- External agent (OpenClaw) wants to browse available products
- Visitor asks "what do you sell?" in chat
- FlowPilot needs product context for recommendations
### Parameters
- **category**: Filter by product category slug.
- **slug**: Get a specific product by slug.
- **limit**: Max results (default 50, max 100).
### Edge cases
- Only returns is_active=true products.
- Prices are in cents — divide by 100 for display.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'browse_products',
        description: 'Browse the product catalog.',
        parameters: {
          type: 'object',
          properties: {
            category: { type: 'string', description: 'Filter by category' },
            slug: { type: 'string', description: 'Get specific product by slug' },
            limit: { type: 'number', description: 'Max results (default 50)' },
          },
        },
      },
    },
  },
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
        description: 'Place a product order.',
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
    description: 'Check the status of an existing order by ID.',
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
        description: 'Check order status by ID.',
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
    description: 'Handle incoming A2A messages from federation peers. Routes natural language messages to FlowPilot for intelligent response.',
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
        description: 'Process inbound A2A chat messages from peers. Use when: receiving plain text messages from connected peers. NOT for: outbound requests or messages with explicit skill invocations.',
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
    description: 'Start a beta test session with a scenario description',
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
        description: 'Start a beta test session',
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
    description: 'End a beta test session with summary',
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
        description: 'End a beta test session',
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
    description: 'Report a bug, UX issue, or suggestion from beta testing',
    handler: 'module:openclaw',
    category: 'system',
    scope: 'internal',
    requires_approval: false,
    trust_level: 'auto',
    instructions: `## openclaw_report_finding
### What
Logs a finding (bug, UX issue, suggestion, observation, or performance issue) discovered during a beta test session.
### When to use
- OpenClaw discovers something worth logging during an active session
- Include as much context as possible in the description field
### Parameters
- **session_id**: Active session ID
- **type**: bug | ux_issue | suggestion | observation | performance
- **severity**: low | medium | high | critical
- **title**: Short finding title
- **description**: Detailed description
- **context**: Additional structured context (optional)
- **screenshot_url**: Optional screenshot URL`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'openclaw_report_finding',
        description: 'Report a finding from beta testing',
        parameters: {
          type: 'object',
          properties: {
            session_id: { type: 'string', description: 'Session ID' },
            type: { type: 'string', enum: ['bug', 'ux_issue', 'suggestion', 'observation', 'performance'], description: 'Finding type' },
            severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], description: 'Severity level' },
            title: { type: 'string', description: 'Finding title' },
            description: { type: 'string', description: 'Detailed description' },
            context: { type: 'object', description: 'Additional context' },
            screenshot_url: { type: 'string', description: 'Screenshot URL' },
          },
          required: ['session_id', 'type', 'title'],
        },
      },
    },
  },
  {
    name: 'openclaw_exchange',
    description: 'Send a message between OpenClaw and FlowPilot',
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
        description: 'Exchange a message between agents',
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
    description: 'Get current beta test status',
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
        description: 'Get beta test status overview',
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
    name: 'cart_recovery_check',
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
    handler: 'edge:competitor-monitor',
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
    instructions: ``,
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
    instructions: ``,
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
    description: 'Create a new content block on an existing page. Wrapper around manage_page_blocks add action.',
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
    handler: 'edge:generate-site-from-identity',
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
    handler: 'edge:generate-social-post',
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
    handler: 'edge:research-content',
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
    handler: 'edge:generate-social-post',
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
