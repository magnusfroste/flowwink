-- Tomma tick lämnar ingen journalrad
--
-- Varje cron-tick skrev en agent_activity-rad, oavsett om skillen hittade något
-- att göra. På gamla liteit var ~14 800 av 18 138 rader exakt det: svep utan
-- arbete på en instans utan konsulter, utan leads och utan schemalagda inlägg.
--
-- Kontraktet (supabase/functions/_shared/activity/work-done.ts): en körning som
-- inte gjorde något SÄGER det, med ett heltal `work_done` = 0 i svaret. Inget
-- läser meddelandetexter eller gissar på skillnamn.
--
-- Den här migrationen ger SQL-sidan sin del:
--   1. agent_automations får last_work_at + idle_run_count — "det körde" och
--      "det gjorde något" blir två skilda fakta, båda kvar även när den tomma
--      journalraden försvinner.
--   2. run_sla_sweep rapporterar work_done (öppnade + lösta violations +
--      skrivna ticket-deadlines). Funktionskroppen är oförändrad i övrigt;
--      kopierad från 20260823090000 eftersom CREATE OR REPLACE kräver hela.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE.
--
-- OBS om rollvakten: svepets egen behörighetsgrind (den som namnger writer och
-- approver i BEGIN-blocket nedan) följer med i kopian ORÖRD. Den är inte en ny
-- handrullad rollista — det är samma två referenser som redan fanns i
-- 20260823090000, framflyttade med kroppen. Därför får den här filen samma
-- baslinje (2) i fixtures/hand-rolled-role-policies-baseline.json; talet växer
-- inte i systemet, det byter bara hemfil.

ALTER TABLE public.agent_automations
  ADD COLUMN IF NOT EXISTS last_work_at timestamptz;

ALTER TABLE public.agent_automations
  ADD COLUMN IF NOT EXISTS idle_run_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.agent_automations.last_work_at IS
  'Senaste tick som faktiskt ändrade något (work_done > 0). NULL = har aldrig gjort arbete, eller kör en skill som ännu inte deklarerar work_done.';
COMMENT ON COLUMN public.agent_automations.idle_run_count IS
  'Antal tick i rad som rapporterat work_done = 0. Nollställs så fort arbete utförs.';

CREATE OR REPLACE FUNCTION public.run_sla_sweep(p_entity_type text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  -- Hur långt tillbaka en redan STANNAD klocka får rapporteras. Utan det
  -- fönstret missas varje ärende som besvarades för sent och sedan stängdes
  -- mellan två svep — och det är just de fallen "vi svarar inom X" handlar om.
  c_lookback_days constant integer := 7;

  v_policy record;
  v_ent record;
  v_spec jsonb;
  v_end_expr text;
  v_void_cond text;
  v_table text;
  v_start_col text;
  v_use_bh boolean;
  v_min_mult numeric;
  v_counts jsonb := '{}'::jsonb;
  v_fresh jsonb := '[]'::jsonb;
  v_unmapped jsonb := '[]'::jsonb;
  v_policies_checked integer := 0;
  v_sql text;
  v_clock_end timestamptz;
  v_elapsed numeric;
  v_paused numeric;
  v_eff_threshold numeric;
  v_severity text;
  v_checked integer;
  v_opened integer;
  v_resolved integer;
  v_viol record;
  v_ended boolean;
  v_ticket record;
  v_deadlines integer := 0;
  -- Arbetsräknaren. Kontraktet i _shared/activity/work-done.ts: ett schemalagt
  -- svep som inte ändrade något rapporterar 0 och slipper sin journalrad.
  -- Räknas på det som FAKTISKT skrevs — inte på antal policies som lästes.
  v_work integer := 0;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'writer') OR has_role(auth.uid(),'approver')) THEN
    RAISE EXCEPTION 'Only staff can run the SLA sweep';
  END IF;

  v_use_bh := EXISTS (SELECT 1 FROM public.business_hours WHERE is_open);
  -- Tier-multiplikatorer kan vara < 1 (premiumkunder får hårdare SLA), så
  -- väggklocks-förfiltret måste använda den minsta multiplikatorn i spel.
  SELECT LEAST(COALESCE(min(threshold_multiplier), 1), 1) INTO v_min_mult FROM public.sla_tiers;

  FOR v_policy IN
    SELECT * FROM public.sla_policies
     WHERE enabled = true
       AND (p_entity_type IS NULL OR entity_type = p_entity_type)
  LOOP
    v_spec := public.sla_clock_spec(v_policy.entity_type, v_policy.metric);
    IF v_spec IS NULL THEN
      CONTINUE; -- okänd entitetstyp — hoppa hellre över än gissa
    END IF;
    v_policies_checked := v_policies_checked + 1;

    IF NOT (v_spec->>'mapped')::boolean THEN
      -- Mät inte fel sak snyggt: rapportera att metricen saknar klocka.
      v_unmapped := v_unmapped || jsonb_build_object(
        'policy_id', v_policy.id, 'entity_type', v_policy.entity_type,
        'metric', v_policy.metric,
        'fell_back_to', 'entity default completion');
    END IF;

    v_table     := v_spec->>'table';
    v_start_col := v_spec->>'start_col';
    v_end_expr  := v_spec->>'end_expr';
    v_void_cond := v_spec->>'void_cond';

    v_checked := 0; v_opened := 0; v_resolved := 0;

    v_sql := format(
      'SELECT e.id::text AS id,
              e.%I AS started_at,
              (%s) AS ended_at,
              %s AS priority,
              %s AS email,
              %s AS company_id
         FROM public.%I e
        WHERE NOT (%s)
          AND e.%I < now() - (interval ''1 minute'' * %s)
          AND ((%s) IS NULL OR (%s) >= now() - (interval ''1 day'' * %s))',
      v_start_col,
      v_end_expr,
      CASE WHEN v_spec->>'priority_col' IS NOT NULL THEN format('e.%I::text', v_spec->>'priority_col') ELSE 'NULL::text' END,
      CASE WHEN v_spec->>'email_col'    IS NOT NULL THEN format('e.%I::text', v_spec->>'email_col')    ELSE 'NULL::text' END,
      CASE WHEN v_spec->>'company_col'  IS NOT NULL THEN format('e.%I::uuid', v_spec->>'company_col')  ELSE 'NULL::uuid' END,
      v_table, v_void_cond, v_start_col,
      (v_policy.threshold_minutes * v_min_mult)::text,
      v_end_expr, v_end_expr, c_lookback_days::text
    );
    IF v_spec->>'priority_col' IS NOT NULL AND COALESCE(v_policy.priority, 'all') NOT IN ('all','') THEN
      v_sql := v_sql || format(' AND e.%I::text = %L', v_spec->>'priority_col', v_policy.priority);
    END IF;
    v_sql := v_sql || ' LIMIT 500';

    FOR v_ent IN EXECUTE v_sql LOOP
      v_checked := v_checked + 1;

      -- HÄR bor hela poängen: klockan slutar där METRICEN säger, inte där
      -- entiteten råkar bli stängd.
      v_clock_end := COALESCE(v_ent.ended_at, now());

      IF v_use_bh THEN
        v_elapsed := COALESCE(public.business_minutes_between(v_ent.started_at, v_clock_end), 0);
      ELSE
        v_elapsed := floor(extract(epoch FROM (v_clock_end - v_ent.started_at)) / 60);
      END IF;
      v_paused := public.sla_paused_minutes(v_policy.entity_type, v_ent.id, v_ent.started_at, v_clock_end, v_use_bh);
      v_elapsed := GREATEST(v_elapsed - v_paused, 0);

      v_eff_threshold := v_policy.threshold_minutes
        * public.sla_tier_multiplier(v_ent.company_id, v_ent.email);

      IF v_elapsed < v_eff_threshold THEN CONTINUE; END IF;

      -- Högst EN violation per (policy, entitet). Det retroaktiva fönstret
      -- gör att en redan stannad klocka annars skulle rapporteras på nytt vid
      -- varje svep i sju dygn — dedupen måste därför titta på lösta
      -- violations också, inte bara öppna.
      IF EXISTS (SELECT 1 FROM public.sla_violations
                  WHERE policy_id = v_policy.id AND entity_id = v_ent.id) THEN
        CONTINUE;
      END IF;

      v_severity := public.sla_severity_for(v_elapsed, v_eff_threshold);

      INSERT INTO public.sla_violations
        (policy_id, entity_type, entity_id, metric, threshold_minutes, actual_minutes,
         severity, entity_priority)
      VALUES
        (v_policy.id, v_policy.entity_type, v_ent.id, v_policy.metric,
         round(v_eff_threshold), round(v_elapsed), v_severity,
         COALESCE(NULLIF(v_policy.priority, 'all'), v_ent.priority));

      v_opened := v_opened + 1;
      v_fresh := v_fresh || jsonb_build_object(
        'policy_id', v_policy.id, 'entity_type', v_policy.entity_type,
        'entity_id', v_ent.id, 'metric', v_policy.metric,
        'actual_minutes', round(v_elapsed), 'threshold_minutes', round(v_eff_threshold),
        'severity', v_severity,
        'entity_priority', COALESCE(NULLIF(v_policy.priority, 'all'), v_ent.priority),
        'clock_stopped_at', v_ent.ended_at);
    END LOOP;

    -- Auto-lös violations vars KLOCKA har stannat (eller vars entitet är
    -- borta/annullerad). Tidigare frågade den här loopen om entiteten var
    -- "öppen" — vilket för first_response var fel fråga.
    FOR v_viol IN
      SELECT id, entity_id FROM public.sla_violations
       WHERE policy_id = v_policy.id AND resolved_at IS NULL
    LOOP
      EXECUTE format(
        'SELECT ((%s) IS NOT NULL) OR (%s) FROM public.%I e WHERE e.id::text = $1',
        v_end_expr, v_void_cond, v_table)
        INTO v_ended USING v_viol.entity_id;
      -- NULL = raden finns inte längre → klockan kan inte ticka.
      IF v_ended IS NULL OR v_ended THEN
        UPDATE public.sla_violations
           SET resolved_at = now(), resolved_by = 'sla-sweep'
         WHERE id = v_viol.id;
        v_resolved := v_resolved + 1;
      END IF;
    END LOOP;

    v_counts := jsonb_set(v_counts, ARRAY[v_policy.entity_type], jsonb_build_object(
      'checked', COALESCE((v_counts->v_policy.entity_type->>'checked')::int, 0) + v_checked,
      'open_violations', COALESCE((v_counts->v_policy.entity_type->>'open_violations')::int, 0) + v_opened,
      'resolved', COALESCE((v_counts->v_policy.entity_type->>'resolved')::int, 0) + v_resolved
    ));
  END LOOP;

  -- Stäm av tickets.sla_deadline. Triggarna håller den färsk vid varje
  -- ärendeskrivning, men en policyändring eller en pågående paus rör inga
  -- ärenderader — svepet är den som får tiden att gå.
  FOR v_ticket IN
    SELECT id FROM public.tickets
     WHERE resolved_at IS NULL AND status::text NOT IN ('closed','resolved')
     ORDER BY created_at DESC
     LIMIT 1000
  LOOP
    BEGIN
      UPDATE public.tickets t
         SET sla_deadline = NULLIF(d.res->>'deadline', '')::timestamptz,
             sla_metric   = d.res->>'metric'
        FROM (SELECT public.sla_ticket_deadline(v_ticket.id) AS res) d
       WHERE t.id = v_ticket.id
         AND (t.sla_deadline IS DISTINCT FROM NULLIF(d.res->>'deadline','')::timestamptz
              OR t.sla_metric IS DISTINCT FROM d.res->>'metric');
      IF FOUND THEN v_deadlines := v_deadlines + 1; END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL; -- en trasig deadline får aldrig stoppa svepet
    END;
  END LOOP;

  SELECT jsonb_array_length(v_fresh)
       + v_deadlines
       + COALESCE((SELECT SUM((e.value->>'resolved')::int) FROM jsonb_each(v_counts) e), 0)
    INTO v_work;

  RETURN jsonb_build_object(
    'status', 'success',
    'work_done', v_work,
    'policies_checked', v_policies_checked,
    'business_hours_clock', v_use_bh,
    'lookback_days', c_lookback_days,
    'counts', v_counts,
    'fresh_violations', v_fresh,
    'unmapped_metrics', v_unmapped,
    'ticket_deadlines_written', v_deadlines
  );
END; $$;
