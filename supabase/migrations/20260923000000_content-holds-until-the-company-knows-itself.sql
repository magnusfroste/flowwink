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

  -- At most ONE row per goal is woken, and only when that goal has no active
  -- row already. agent_objectives_one_active_goal (#487) is a PARTIAL unique
  -- index — UNIQUE (goal) WHERE status = 'active' — so it neither prevents nor
  -- cleans up two 'paused' rows carrying the same gated goal, which a race
  -- between the template install and the FlowPilot bootstrap can still create
  -- while identity is absent. A blanket UPDATE would then try to activate both,
  -- violate the index, abort this trigger, and take the site_settings write
  -- with it: the operator's attempt to SAVE their Business Identity would fail
  -- with a unique violation, and the profile would never land. Waking one and
  -- leaving the twin paused keeps the write safe; the twin is inert and
  -- removable from the UI.
  --
  -- Oldest wins, matching #487's own de-duplication: it is the row that has had
  -- time to accumulate progress.
  WITH wakeable AS (
    SELECT DISTINCT ON (o.goal) o.id
      FROM public.agent_objectives o
     WHERE o.status = 'paused'
       AND coalesce(o.constraints->>'requires_business_identity', '') = 'true'
       AND o.progress->'hold'->>'reason' = 'awaiting_business_identity'
       AND NOT EXISTS (
         SELECT 1
           FROM public.agent_objectives a
          WHERE a.goal = o.goal
            AND a.status = 'active'
       )
     ORDER BY o.goal, o.created_at, o.id
  )
  UPDATE public.agent_objectives t
  SET status = 'active',
      progress = (t.progress - 'hold') || jsonb_build_object(
        'woken_by', 'business_identity',
        'woken_at', to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      ),
      updated_at = now()
  FROM wakeable w
  WHERE t.id = w.id;

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
