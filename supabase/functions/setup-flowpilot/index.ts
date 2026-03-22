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
    name: 'lookup_order',
    description: 'Look up order status by order ID or customer email.',
    handler: 'module:orders',
    category: 'crm',
    scope: 'both',
    requires_approval: false,
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
    description: 'Full page lifecycle: list, get, create, update, publish, archive, delete, rollback.',
    handler: 'module:pages',
    category: 'content',
    scope: 'internal',
    requires_approval: false,
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_page',
        description: 'Manage CMS pages. Actions: list, get, create, update, publish, archive, delete, rollback. For create/update with content, pass blocks array OR use manage_page_blocks to add blocks individually.',
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
    name: 'manage_consultant_profile',
    description: 'Manage consultant/resume profiles: list, create, update, delete, deduplicate.',
    handler: 'module:resume',
    category: 'content',
    scope: 'internal',
    requires_approval: false,
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
    requires_approval: true,
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
];
const DEFAULT_SOUL = {
  purpose: 'I help run this website autonomously — managing content, leads, and growth so the owner can focus on their business.',
  values: ['Be helpful and proactive', 'Never take destructive actions without approval', 'Learn from every interaction', 'Prioritize quality over quantity'],
  tone: 'Professional but approachable. Concise. Action-oriented.',
  philosophy: 'I aim to make this website run itself while keeping the human in the loop for important decisions.',
};

const DEFAULT_IDENTITY = {
  name: 'FlowPilot',
  role: 'Autonomous CMS operator',
  capabilities: ['Content creation', 'Lead management', 'Analytics review', 'Newsletter drafting', 'Booking management', 'Self-improvement'],
  boundaries: ['Cannot send newsletters without approval', 'Cannot delete data', 'Cannot modify authentication or security settings'],
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
      // Template-aware configuration
      template_id,
      template_flowpilot: template_flowpilot_body,
    } = body;

    // If caller passes template_id but no inline template_flowpilot,
    // fall back to the built-in starter automations/workflows (same for all templates).
    const STARTER_FLOWPILOT = {
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
    }

    // 5. Seed initial objectives from template
    let objectivesSeeded = 0;
    if (template_flowpilot?.objectives?.length) {
      console.log('[setup-flowpilot] Seeding template objectives...');
      for (const obj of template_flowpilot.objectives) {
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
    // 9. POST-BOOTSTRAP INTEGRITY GATE
    // Validates the system after seeding and auto-creates
    // an objective if integrity score is below threshold.
    // ═══════════════════════════════════════════
    let integrityResult: any = null;
    try {
      console.log('[setup-flowpilot] Running post-bootstrap integrity check...');

      // --- Inline integrity checks (subset of system-integrity-check) ---
      const { data: allSkills } = await supabase
        .from('agent_skills')
        .select('name, enabled, instructions, tool_definition, handler, description')
        .eq('enabled', true);

      const enabledSkills = allSkills || [];
      let issues: string[] = [];

      // Check: skills without instructions
      const noInstr = enabledSkills.filter((s: any) => !s.instructions || s.instructions.trim() === '');
      if (noInstr.length > 0) {
        issues.push(`${noInstr.length} skills missing instructions: ${noInstr.slice(0, 5).map((s: any) => s.name).join(', ')}${noInstr.length > 5 ? '...' : ''}`);
      }

      // Check: skills without description
      const noDesc = enabledSkills.filter((s: any) => !s.description || s.description.trim() === '');
      if (noDesc.length > 0) {
        issues.push(`${noDesc.length} skills missing descriptions`);
      }

      // Check: invalid tool definitions
      const badTd = enabledSkills.filter((s: any) => {
        if (!s.tool_definition) return true;
        const td = typeof s.tool_definition === 'string' ? JSON.parse(s.tool_definition) : s.tool_definition;
        return !td?.function?.name || !td?.function?.parameters;
      });
      if (badTd.length > 0) {
        issues.push(`${badTd.length} skills with invalid tool definitions: ${badTd.map((s: any) => s.name).join(', ')}`);
      }

      // Check: critical memory keys
      const { data: memKeys } = await supabase
        .from('agent_memory')
        .select('key')
        .in('key', ['soul', 'identity', 'agents']);
      const foundKeys = new Set((memKeys || []).map((m: any) => m.key));
      const missingKeys = ['soul', 'identity', 'agents'].filter(k => !foundKeys.has(k));
      if (missingKeys.length > 0) {
        issues.push(`Missing critical memory keys: ${missingKeys.join(', ')}`);
      }

      // Check: automations referencing missing skills
      const { data: autos } = await supabase
        .from('agent_automations')
        .select('name, skill_name')
        .eq('enabled', true);
      const skillNames = new Set(enabledSkills.map((s: any) => s.name));
      const brokenAutos = (autos || []).filter((a: any) => a.skill_name && !skillNames.has(a.skill_name));
      if (brokenAutos.length > 0) {
        issues.push(`${brokenAutos.length} automations reference missing skills: ${brokenAutos.map((a: any) => `${a.name}→${a.skill_name}`).join(', ')}`);
      }

      const totalChecks = 5;
      const passedChecks = totalChecks - [noInstr, noDesc, badTd, missingKeys, brokenAutos].filter(arr => arr.length > 0).length;
      const score = Math.round((passedChecks / totalChecks) * 100);

      integrityResult = { score, issues, totalChecks, passedChecks };
      console.log(`[setup-flowpilot] Integrity score: ${score}% (${passedChecks}/${totalChecks} checks passed)`);

      // Auto-create objective if score is below 80%
      if (score < 80 && issues.length > 0) {
        const goalText = `Fix system integrity issues (score: ${score}%). Problems: ${issues.join('; ')}`;
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
