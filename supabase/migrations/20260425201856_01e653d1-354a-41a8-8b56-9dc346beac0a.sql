-- ═══════════════════════════════════════════════════════════════════════════════
-- PLATFORM CORE: Agentic Layer Schema
-- 
-- Owns the agent_* tables that the platform uses for skills/memory/automations.
-- These tables are PLATFORM infrastructure, not FlowPilot-owned. They exist
-- in every install regardless of whether FlowPilot is enabled, so that:
--   - MCP server can expose skills to external operators (OpenClaw, etc.)
--   - Modules can register skillSeeds when activated
--   - Automations engine can run platform-level cron jobs
-- 
-- Idempotent — safe to run on fresh installs and upgrades.
-- ═══════════════════════════════════════════════════════════════════════════════

-- Enums (idempotent)
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

-- Core tables (idempotent — already exist in current installs)
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

CREATE TABLE IF NOT EXISTS public.agent_objective_activities (
  objective_id UUID NOT NULL REFERENCES public.agent_objectives(id) ON DELETE CASCADE,
  activity_id UUID NOT NULL REFERENCES public.agent_activity(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (objective_id, activity_id)
);

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

CREATE TABLE IF NOT EXISTS public.agent_locks (
  lane TEXT PRIMARY KEY,
  locked_by TEXT NOT NULL,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '5 minutes'
);

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
-- NEW: executor field on automations — enables platform/operator separation
-- 
-- 'platform'  → cron-runner edge function executes directly (deterministic)
-- 'flowpilot' → FlowPilot heartbeat picks it up (needs reasoning)
-- 'openclaw'  → MCP callback to external operator
-- 'external'  → Some other registered operator
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'agent_automations' AND column_name = 'executor'
  ) THEN
    ALTER TABLE public.agent_automations
      ADD COLUMN executor TEXT NOT NULL DEFAULT 'flowpilot';
    
    -- Backfill: existing automations stay on flowpilot
    UPDATE public.agent_automations SET executor = 'flowpilot' WHERE executor IS NULL;
  END IF;
END $$;

-- Index for cron-runner lookups
CREATE INDEX IF NOT EXISTS idx_agent_automations_executor_enabled
  ON public.agent_automations(executor, enabled) WHERE enabled = true;

-- ═══════════════════════════════════════════════════════════════════════════════
-- RLS (idempotent)
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

-- ═══════════════════════════════════════════════════════════════════════════════
-- Database Functions (concurrency / objective checkout)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.checkout_objective(p_objective_id uuid, p_locked_by text DEFAULT 'heartbeat')
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rows_affected integer;
BEGIN
  UPDATE agent_objectives SET locked_by = p_locked_by, locked_at = now()
  WHERE id = p_objective_id AND (locked_by IS NULL OR locked_at < now() - interval '30 minutes');
  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  RETURN rows_affected > 0;
END; $$;

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