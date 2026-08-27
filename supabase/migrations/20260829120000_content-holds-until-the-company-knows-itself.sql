-- Content-producing objectives hold until Business Identity exists — and wake
-- the moment it is written.
--
-- Fresh-install class (Restagård 2026-08-27): the starter objective "Establish
-- content presence — publish 3 blog posts within the first week" was seeded
-- 'active', and FlowPilot's loop ran it BEFORE any Business Identity existed —
-- three generic English blog posts, ungrounded by construction. The grounding
-- doctrine says outward-facing generation grounds in identity.
--
-- The gate has three rails; this migration is the wake rail:
--   1. Seeding (src/lib/modules/flowpilot-module.ts): objectives declaring
--      constraints.requires_business_identity are born 'paused' with
--      progress.hold.reason = 'awaiting_business_identity' while
--      company_profile lacks company_name + services.
--   2. THIS TRIGGER: any write of a complete company_profile — from the admin
--      editor, the update_company_profile skill, or SQL — flips those held
--      objectives to 'active'. A DB trigger covers every writer; no surface
--      can forget to wake them.
--   3. Runtime belt (partitionByIdentityGate in _shared/pilot/reason.ts):
--      a gated objective that is 'active' anyway is held out of the working
--      set while the profile is incomplete.
--
-- The wake matches ONLY hold.reason = 'awaiting_business_identity': an
-- objective an operator paused by hand carries no hold marker and is never
-- auto-woken. Readiness deliberately mirrors hasCoreBusinessIdentity
-- (business-identity-block.ts / business-identity-gate.ts) including the
-- legacy service shapes (string, object map) that predate the structured
-- [{name, description}] form.

CREATE OR REPLACE FUNCTION public.business_identity_is_ready(v jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    v IS NOT NULL
    AND jsonb_typeof(v) = 'object'
    AND btrim(coalesce(v->>'company_name', '')) <> ''
    AND (
      (jsonb_typeof(v->'services') = 'array'  AND jsonb_array_length(v->'services') > 0)
      OR (jsonb_typeof(v->'services') = 'object' AND v->'services' <> '{}'::jsonb)
      OR (jsonb_typeof(v->'services') = 'string' AND btrim(v->'services' #>> '{}') <> '')
    );
$$;

CREATE OR REPLACE FUNCTION public.wake_identity_gated_objectives()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.key <> 'company_profile' THEN
    RETURN NEW;
  END IF;
  IF NOT public.business_identity_is_ready(NEW.value) THEN
    RETURN NEW;
  END IF;

  UPDATE public.agent_objectives
  SET status = 'active',
      progress = (progress - 'hold') || jsonb_build_object(
        'woken_by', 'business_identity',
        'woken_at', to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      ),
      updated_at = now()
  WHERE status = 'paused'
    AND coalesce(constraints->>'requires_business_identity', '') = 'true'
    AND progress->'hold'->>'reason' = 'awaiting_business_identity';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wake_identity_gated_objectives ON public.site_settings;
CREATE TRIGGER trg_wake_identity_gated_objectives
AFTER INSERT OR UPDATE OF value ON public.site_settings
FOR EACH ROW
WHEN (NEW.key = 'company_profile')
EXECUTE FUNCTION public.wake_identity_gated_objectives();

-- Catch-up for the ordering gap: an instance where the identity was written
-- BEFORE this trigger existed would strand its held objectives asleep forever.
-- A self-assignment write on the profile row fires the trigger just created,
-- which re-runs the same readiness check and wake — no logic duplicated, and
-- a no-op when the profile is absent or incomplete.
UPDATE public.site_settings
SET value = value
WHERE key = 'company_profile';
