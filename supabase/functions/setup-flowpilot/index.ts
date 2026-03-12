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
-- FLOWPILOT AGENTIC LAYER — Self-hosted bootstrap
-- ═══════════════════════════════════════════════════════════════════════════════

-- Enums
DO $$ BEGIN CREATE TYPE public.agent_type AS ENUM ('flowpilot', 'chat'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE public.agent_scope AS ENUM ('internal', 'external', 'both'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE public.agent_skill_category AS ENUM ('content', 'crm', 'communication', 'automation', 'search', 'analytics'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE public.agent_memory_category AS ENUM ('preference', 'context', 'fact'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE public.agent_objective_status AS ENUM ('active', 'completed', 'paused', 'failed'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE public.agent_activity_status AS ENUM ('success', 'failed', 'pending_approval'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE public.automation_trigger_type AS ENUM ('cron', 'event', 'signal'); EXCEPTION WHEN duplicate_object THEN null; END $$;

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

-- ═══════════════════════════════════════════════════════════════════════════════
-- RLS
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.agent_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_objectives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_objective_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_automations ENABLE ROW LEVEL SECURITY;

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
];

// Default Soul & Identity
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
      template_flowpilot,
    } = body;

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

      if (existingSkills && existingSkills.length > 0 && !seed_skills) {
        console.log('[setup-flowpilot] Already set up with skills, skipping (pass seed_skills=true to upsert)');
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
    ]);

    const missingTables = ['agent_skills', 'agent_memory', 'agent_activity', 'agent_objectives', 'agent_automations']
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

    // 3. Seed skills
    let skillsSeeded = 0;
    if (seed_skills) {
      console.log('[setup-flowpilot] Seeding default skills...');
      for (const skill of DEFAULT_SKILLS) {
        const { data: existing } = await supabase
          .from('agent_skills')
          .select('id')
          .eq('name', skill.name)
          .maybeSingle();

        if (!existing) {
          const { error } = await supabase.from('agent_skills').insert(skill);
          if (error) {
            console.error(`[setup-flowpilot] Failed to seed skill ${skill.name}:`, error);
          } else {
            skillsSeeded++;
          }
        }
      }
      console.log(`[setup-flowpilot] Seeded ${skillsSeeded} skills`);
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

    console.log('[setup-flowpilot] Bootstrap complete!');

    return new Response(
      JSON.stringify({
        success: true,
        message: 'FlowPilot agentic layer bootstrapped successfully!',
        details: {
          skills_seeded: skillsSeeded,
          soul_seeded: soulSeeded,
          objectives_seeded: objectivesSeeded,
          total_default_skills: DEFAULT_SKILLS.length,
          template_configured: !!template_flowpilot,
        },
        next_steps: [
          'Configure AI provider in Site Settings → System AI',
          'Set OPENAI_API_KEY or GEMINI_API_KEY as secrets',
          'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in vault for heartbeat self-invocation',
          'Deploy edge functions: agent-execute, agent-operate, flowpilot-heartbeat',
          'Open /admin/copilot to start using FlowPilot',
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
