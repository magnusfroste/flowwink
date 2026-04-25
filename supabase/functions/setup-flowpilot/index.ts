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

// ⚠️ DEFAULT_SKILLS removed in modular refactor (2026-04).
// Skills are now defined per-module in src/lib/modules/<id>-module.ts → skillSeeds[]
// and seeded only when that module is enabled (via bootstrapModule).
// FlowPilot's own core skills live in flowpilot-module.ts.
const DEFAULT_SKILLS: any[] = [];

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

    // 3. Skill seeding REMOVED — now handled per-module via bootstrapModule()
    //    in src/lib/module-bootstrap.ts. setup-flowpilot only seeds the
    //    schema, soul, identity and FlowPilot's own automations now.
    //    See: docs/reference/skills-source.md
    const skillsSeeded = 0;
    if (seed_skills) {
      console.log('[setup-flowpilot] Skill seeding skipped — per-module bootstrap owns this now.');
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
