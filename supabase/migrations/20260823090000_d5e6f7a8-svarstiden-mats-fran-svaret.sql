-- SLA: svarstiden mäts från svaret — `metric` slutar vara dekoration
--
-- VERIFIERAT FEL (QA av support-processen):
--   `run_sla_sweep` mätte ALLA metrics likadant: från entitetens created_at
--   till dess entiteten inte längre var "öppen". Kolumnen `metric` kopierades
--   bara in i violation-raden. Följden:
--     • ett ärende som besvarades på 30 minuter loggades som
--       first_response-brott på 1020 minuter (klockan fortsatte till stängning)
--     • två policies med OLIKA metric gav byte-identiska actual_minutes
--     • ett ärende som besvarades FÖR SENT och sedan stängdes loggades aldrig,
--       eftersom svepet bara tittar på entiteter som fortfarande är öppna
--   Alltså: "vi svarar inom X" gick inte att mäta alls. Plattformen kunde inte
--   mäta det den säljer.
--
-- DATAMODELLEN BAR REDAN SKILLNADEN. `ticket_comments` har `is_internal` och
-- `author_type` ('customer' | 'agent' | 'system'), och båda fylls konsekvent av
-- alla skrivare (admin-UI:t, kundportalen, Gmail-inkorgen, agent-execute).
-- Ett FAKTISKT svar TILL kunden = is_internal = false AND author_type <> 'customer'.
-- En intern anteckning (is_internal = true) stoppar inte klockan. Inget nytt
-- fält behövdes.
--
-- Vad den här migrationen gör:
--   1. business_minutes_add() — motsatsen till business_minutes_between().
--      Behövs för att kunna skriva en DEADLINE (en tidsstämpel) ur ett
--      tröskelvärde i ARBETSminuter.
--   2. sla_clock_spec(entity_type, metric) — EN karta över vad som stoppar
--      klockan per (entitet, metric). Enda sanningen; svepet och
--      deadline-skrivaren läser samma karta.
--   3. run_sla_sweep() skrivs om:
--        • per-metric klockslut (first_response ≠ resolution)
--        • retroaktivt fönster (7 dygn) så ett för sent besvarat ärende
--          fångas även om svepet inte råkade köra medan klockan tickade
--        • severity blir severity igen: warning|breach|critical ur
--          overage-kvoten, i stället för entitetens prioritet
--        • entitetens prioritet flyttar till sin egen kolumn
--        • tickets.sla_deadline fylls (den lästes av tre konsumenter men
--          skrevs aldrig)
--   4. sla_ticket_deadline() + trigger — deadlinen finns från sekund ett,
--      inte först efter nästa svep. EN funktion äger kolumnen; svepet och
--      triggarna är bara anropare.
--
-- Idempotent. Framåtdaterad (Lovables migrate-runner hoppar tyst över
-- backdaterade filer).

-- ── 1. Schema ────────────────────────────────────────────────────────────────

-- Svepet smugglade in entitetens prioritet i `severity`. Prioriteten är
-- värdefull — den ska bara inte bo i severity-kolumnen.
ALTER TABLE public.sla_violations
  ADD COLUMN IF NOT EXISTS entity_priority text;

-- Vilken klocka deadlinen gäller. Utan den kan UI:t inte säga "first response
-- om 20 min" utan att gissa.
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS sla_metric text;

-- ── 2. business_minutes_add ──────────────────────────────────────────────────
-- business_minutes_between() ger förfluten ARBETStid mellan två stämplar.
-- För att skriva en deadline behövs motsatsen: "vilken tidpunkt ligger N
-- arbetsminuter fram?". Utan den kan ett tröskelvärde i arbetsminuter aldrig
-- bli en läsbar tidsstämpel, och UI:t tvingas räkna kalendertid själv — vilket
-- är exakt den andra motorn vi vill bli av med.
CREATE OR REPLACE FUNCTION public.business_minutes_add(
  p_start timestamptz,
  p_minutes numeric
) RETURNS timestamptz
LANGUAGE plpgsql STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_left numeric := GREATEST(COALESCE(p_minutes, 0), 0);
  v_day date;
  v_win record;
  v_open timestamptz;
  v_close timestamptz;
  v_seg_start timestamptz;
  v_avail numeric;
  v_guard integer := 0;
BEGIN
  -- Ingen kalender konfigurerad → dygnet-runt-klocka, samma antagande som
  -- business_minutes_between() gör i svepet.
  IF NOT EXISTS (SELECT 1 FROM public.business_hours WHERE is_open) THEN
    RETURN p_start + (v_left * interval '1 minute');
  END IF;

  v_day := p_start::date;
  WHILE v_guard < 800 LOOP
    v_guard := v_guard + 1;
    IF NOT EXISTS (SELECT 1 FROM public.business_holidays h WHERE h.day = v_day) THEN
      FOR v_win IN
        SELECT open_time, close_time FROM public.business_hours
         WHERE is_open AND weekday = EXTRACT(DOW FROM v_day)::int
         ORDER BY open_time
      LOOP
        v_open  := (v_day + v_win.open_time)::timestamptz;
        v_close := (v_day + v_win.close_time)::timestamptz;
        v_seg_start := GREATEST(v_open, p_start);
        IF v_close > v_seg_start THEN
          v_avail := EXTRACT(EPOCH FROM (v_close - v_seg_start)) / 60.0;
          IF v_left <= v_avail THEN
            RETURN v_seg_start + (v_left * interval '1 minute');
          END IF;
          v_left := v_left - v_avail;
        END IF;
      END LOOP;
    END IF;
    v_day := v_day + 1;
  END LOOP;

  -- Budgeten överlever horisonten (>800 dygn öppettid). Hellre ett monotont
  -- väggklocksvar än NULL — en NULL-deadline läses som "ingen SLA" i UI:t.
  RETURN p_start + (GREATEST(COALESCE(p_minutes, 0), 0) * interval '1 minute');
END; $$;

REVOKE ALL ON FUNCTION public.business_minutes_add(timestamptz, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.business_minutes_add(timestamptz, numeric)
  TO authenticated, service_role;

-- ── 3. Klockkartan ───────────────────────────────────────────────────────────
-- EN karta: vad stoppar klockan för (entity_type, metric)?
--   end_expr   — SQL-uttryck som ger tidsstämpeln då klockan stannade, eller
--                NULL medan den fortfarande tickar. Utvärderas med entitetens
--                rad aliasad som `e`.
--   void_cond  — rader som aldrig var på klockan (annullerad order osv).
--   mapped     — false betyder "den här metricen är inte kartlagd för den här
--                entiteten"; svepet faller tillbaka på entitetens
--                huvudavslut OCH rapporterar det i unmapped_metrics, så drift
--                syns i stället för att mätas fel snyggt.
-- Uttrycken är konstanter i funktionen, aldrig användarinput.
CREATE OR REPLACE FUNCTION public.sla_clock_spec(p_entity_type text, p_metric text)
RETURNS jsonb
LANGUAGE sql IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE p_entity_type

    WHEN 'ticket' THEN jsonb_build_object(
      'table', 'tickets',
      'start_col', 'created_at',
      'priority_col', 'priority',
      'email_col', 'contact_email',
      'company_col', 'company_id',
      'void_cond', 'false',
      'end_expr', CASE p_metric
        -- Första FAKTISKA svaret till kunden. is_internal = true är en intern
        -- anteckning och stoppar inte klockan; author_type = 'customer' är
        -- kundens egna inlägg och är inte ett svar.
        WHEN 'first_response' THEN
          '(SELECT min(c.created_at) FROM public.ticket_comments c
              WHERE c.ticket_id = e.id
                AND c.is_internal = false
                AND c.author_type <> ''customer'')'
        ELSE
          'COALESCE(e.resolved_at, e.closed_at,
             CASE WHEN e.status::text IN (''resolved'',''closed'') THEN e.updated_at END)'
      END,
      'mapped', (p_metric IN ('first_response', 'resolution')))

    WHEN 'order' THEN jsonb_build_object(
      'table', 'orders',
      'start_col', 'created_at',
      'priority_col', NULL,
      'email_col', 'customer_email',
      'company_col', 'company_id',
      'void_cond', 'e.status::text IN (''cancelled'',''refunded'')',
      'end_expr', 'e.shipped_at',
      'mapped', (p_metric = 'fulfillment'))

    WHEN 'lead' THEN jsonb_build_object(
      'table', 'leads',
      'start_col', 'created_at',
      'priority_col', NULL,
      'email_col', 'email',
      'company_col', 'company_id',
      'void_cond', 'false',
      'end_expr', 'COALESCE(e.ai_qualified_at, e.converted_at)',
      'mapped', (p_metric IN ('follow_up', 'first_response')))

    WHEN 'chat' THEN jsonb_build_object(
      'table', 'chat_conversations',
      'start_col', 'created_at',
      'priority_col', 'priority',
      'email_col', 'customer_email',
      'company_col', NULL,
      'void_cond', 'false',
      'end_expr', CASE p_metric
        WHEN 'first_response' THEN
          '(SELECT min(m.created_at) FROM public.chat_messages m
              WHERE m.conversation_id = e.id
                AND m.role IN (''assistant'',''agent''))'
        ELSE
          'CASE WHEN e.conversation_status = ''closed'' THEN e.updated_at END'
      END,
      'mapped', (p_metric IN ('first_response', 'resolution')))

    WHEN 'booking' THEN jsonb_build_object(
      'table', 'bookings',
      'start_col', 'created_at',
      'priority_col', NULL,
      'email_col', 'customer_email',
      'company_col', NULL,
      'void_cond', 'e.status::text = ''cancelled''',
      'end_expr', 'e.confirmation_sent_at',
      'mapped', (p_metric = 'confirmation'))

    ELSE NULL
  END;
$$;

REVOKE ALL ON FUNCTION public.sla_clock_spec(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sla_clock_spec(text, text)
  TO authenticated, service_role;

-- ── 4. Severity ur overage-kvoten ────────────────────────────────────────────
-- Svepet skrev entitetens PRIORITET i severity ('low'|'medium'|'high'|'urgent').
-- Resten av systemet väntar sig warning|breach|critical: tabellens DEFAULT,
-- demo-seedarna, färgkartan i SlaMonitorPage och "Critical"-kortet. Kortet
-- "Compliance 100%" bredvid "Open Violations 3" var samma bugg — formeln
-- räknade severity-värden svepet aldrig skrev, så täljaren var konstant noll.
-- Linjen: svepet skriver det etablerade ordförrådet. Prioriteten bor nu i
-- entity_priority.
CREATE OR REPLACE FUNCTION public.sla_severity_for(p_actual numeric, p_threshold numeric)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN COALESCE(p_threshold, 0) <= 0 THEN 'breach'
    WHEN p_actual >= p_threshold * 2 THEN 'critical'
    ELSE 'breach'
  END;
$$;

REVOKE ALL ON FUNCTION public.sla_severity_for(numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sla_severity_for(numeric, numeric)
  TO authenticated, service_role;

-- ── 5. Deadlinen får en ägare ────────────────────────────────────────────────
-- tickets.sla_deadline lästes av tre konsumenter (useTicketSla,
-- MyDayWidget, ModuleDashboardWidgets) men skrevs aldrig av någon kodväg.
-- Den här funktionen är ENDA skrivaren av sanningen; svepet och triggarna
-- nedan är anropare.
--
-- Returnerar {deadline, metric, policy_id} för den närmaste klocka som
-- fortfarande tickar på ärendet — så ett ärende med både first_response- och
-- resolution-policy visar den som förfaller först, och byter till
-- resolution-klockan i samma sekund som svaret går ut.
CREATE OR REPLACE FUNCTION public.sla_ticket_deadline(p_ticket_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_t public.tickets;
  v_policy record;
  v_spec jsonb;
  v_ended timestamptz;
  v_use_bh boolean;
  v_eff numeric;
  v_paused numeric;
  v_deadline timestamptz;
  v_best timestamptz;
  v_best_metric text;
  v_best_policy uuid;
BEGIN
  SELECT * INTO v_t FROM public.tickets WHERE id = p_ticket_id;
  IF v_t.id IS NULL THEN RETURN NULL; END IF;

  v_use_bh := EXISTS (SELECT 1 FROM public.business_hours WHERE is_open);

  FOR v_policy IN
    SELECT * FROM public.sla_policies
     WHERE enabled = true AND entity_type = 'ticket'
       AND (COALESCE(priority, 'all') IN ('all', '') OR priority = v_t.priority::text)
  LOOP
    v_spec := public.sla_clock_spec('ticket', v_policy.metric);
    IF v_spec IS NULL THEN CONTINUE; END IF;

    EXECUTE format('SELECT (%s) FROM public.tickets e WHERE e.id = $1', v_spec->>'end_expr')
      INTO v_ended USING p_ticket_id;
    -- Klockan har redan stannat — den kan inte förfalla.
    IF v_ended IS NOT NULL THEN CONTINUE; END IF;

    v_eff := v_policy.threshold_minutes
      * public.sla_tier_multiplier(v_t.company_id, v_t.contact_email);
    v_paused := public.sla_paused_minutes('ticket', p_ticket_id::text, v_t.created_at, now(), v_use_bh);

    IF v_use_bh THEN
      v_deadline := public.business_minutes_add(v_t.created_at, v_eff + v_paused);
    ELSE
      v_deadline := v_t.created_at + ((v_eff + v_paused) * interval '1 minute');
    END IF;

    IF v_best IS NULL OR v_deadline < v_best THEN
      v_best := v_deadline;
      v_best_metric := v_policy.metric;
      v_best_policy := v_policy.id;
    END IF;
  END LOOP;

  IF v_best IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('deadline', v_best, 'metric', v_best_metric, 'policy_id', v_best_policy);
END; $$;

-- SECURITY DEFINER: REVOKE FROM PUBLIC från start (anon-ytshärdningen 2026-08 —
-- en ny definer-funktion är anon-körbar tills någon säger annat).
REVOKE ALL ON FUNCTION public.sla_ticket_deadline(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sla_ticket_deadline(uuid)
  TO authenticated, service_role;

-- Stämpla ett enskilt ärende. Fail-open: sla_deadline är en läsbar
-- avspegling, aldrig en grind. Ett fel här får ALDRIG stoppa en
-- ärendeskrivning — tickets är en het tabell med många skrivare.
CREATE OR REPLACE FUNCTION public.sla_stamp_ticket_deadline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
  v_res jsonb;
BEGIN
  BEGIN
    -- NEW nås via to_jsonb, inte via fältnamn. plpgsql kompilerar `NEW.ticket_id`
    -- i en trigger som delas av två tabeller och kastar "record new has no field
    -- ticket_id" på tickets-raden — ett fel som INTE fångas av blocket nedan
    -- eftersom det uppstår redan vid tilldelningen. Det gjorde triggern till en
    -- grind som stoppade varje ärendeskrivning. Verifierat på lokal instans.
    v_id := COALESCE(to_jsonb(NEW)->>'ticket_id', to_jsonb(NEW)->>'id')::uuid;
    v_res := public.sla_ticket_deadline(v_id);
    -- Uppdateringen nämner BARA sla_deadline/sla_metric. Triggern på tickets
    -- är UPDATE OF på andra kolumner, så den kan inte återutlösa sig själv.
    UPDATE public.tickets
       SET sla_deadline = NULLIF(v_res->>'deadline', '')::timestamptz,
           sla_metric   = v_res->>'metric'
     WHERE id = v_id
       AND (sla_deadline IS DISTINCT FROM NULLIF(v_res->>'deadline', '')::timestamptz
            OR sla_metric IS DISTINCT FROM v_res->>'metric');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NULL;
END; $$;

-- Triggerfunktionen körs av triggern, aldrig av en anropare.
REVOKE ALL ON FUNCTION public.sla_stamp_ticket_deadline() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sla_stamp_ticket_deadline ON public.tickets;
CREATE TRIGGER trg_sla_stamp_ticket_deadline
  AFTER INSERT OR UPDATE OF status, priority, resolved_at, closed_at, company_id, contact_email
  ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.sla_stamp_ticket_deadline();

-- Första svaret stoppar first_response-klockan → deadlinen ska genast byta
-- till resolution-klockan. Utan den här triggern visar UI:t en död
-- first_response-nedräkning tills nästa svep.
DROP TRIGGER IF EXISTS trg_sla_stamp_ticket_deadline_on_comment ON public.ticket_comments;
CREATE TRIGGER trg_sla_stamp_ticket_deadline_on_comment
  AFTER INSERT ON public.ticket_comments
  FOR EACH ROW EXECUTE FUNCTION public.sla_stamp_ticket_deadline();

-- ── 6. Svepet, per metric ────────────────────────────────────────────────────
-- Signaturen är OFÖRÄNDRAD med flit: run_sla_sweep(p_entity_type text) är
-- seedad som rpc:run_sla_sweep i sla-module. En extra defaultad parameter
-- skulle skapa en överlagring och göra namngivna anrop tvetydiga — precis den
-- överlagringsdrift som redan bitit oss en gång (refund_return p_final).
-- Det retroaktiva fönstret är därför en konstant.
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

  RETURN jsonb_build_object(
    'status', 'success',
    'policies_checked', v_policies_checked,
    'business_hours_clock', v_use_bh,
    'lookback_days', c_lookback_days,
    'counts', v_counts,
    'fresh_violations', v_fresh,
    'unmapped_metrics', v_unmapped,
    'ticket_deadlines_written', v_deadlines
  );
END; $$;

-- ── 7. Bakåtfyllnad ──────────────────────────────────────────────────────────
-- Befintliga violation-rader bär entitetens prioritet i severity. Flytta den
-- till entity_priority och sätt severity till det ordförråd resten av
-- systemet läser, så compliance-formeln inte fortsätter räkna på skräp.
UPDATE public.sla_violations
   SET entity_priority = severity,
       severity = public.sla_severity_for(actual_minutes, threshold_minutes)
 WHERE severity IN ('low','medium','high','urgent')
   AND entity_priority IS NULL;
