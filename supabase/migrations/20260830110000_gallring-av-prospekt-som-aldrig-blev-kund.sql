-- Gallring: prospekt som aldrig blev kund rensas efter 24 månader
-- (Magnus beslut 2026-08-30).
--
-- Säljliggaren bär fri text om identifierbara människor — mötesanteckningar,
-- omdömen, namngivna beslutsfattare. En bokföring har en bevarandetid; det ska
-- den här också ha, och beslutet är lättare att fatta nu än vid tiotusen rader.
--
-- ── Vad som ALDRIG rensas ───────────────────────────────────────────────────
-- Radering är oåterkallelig, så gränserna är breda med flit:
--   · någon som ÄR eller HAR VARIT kund (status='customer' eller converted_at)
--   · varje kontakt med kommersiellt spår — affär, offert, order via faktura,
--     ärende, uppgift, prislista. Ett affärsförhållande har egna
--     bevarandekrav, och de går före en städrutin.
--   · allt yngre än fönstret, räknat från SENASTE aktiviteten (inte från när
--     raden skapades) — en kontakt man rörde i förrgår är levande oavsett
--     ålder.
--
-- Klockan räknas alltså från greatest(sista aktivitet, skapad). Ett prospekt
-- utan aktiviteter mäts från sitt skapande.
--
-- ── Torrkörning är standard ─────────────────────────────────────────────────
-- p_dry_run default TRUE: den som anropar för hand får se vad som SKULLE
-- försvinna. Cron:en anropar med false. Ingen ska kunna radera ett år av
-- kunddata genom att gissa ett funktionsnamn.
--
-- Varje körning skrivs till data_retention_runs — antal, fönster, torrkörning
-- eller inte. Inga personuppgifter i loggen: den ska visa ATT policyn
-- tillämpas, inte vem den träffade.
--
-- Skarp körning vägrar på en testbädd (assert_not_testbed): en testbädd
-- ackumulerar data med flit, och en gallring som river den är precis vad det
-- vetot finns för. Torrkörning tillåts överallt — den rör ingenting.
--
-- Idempotent + forward-daterad.

CREATE TABLE IF NOT EXISTS public.data_retention_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at timestamptz NOT NULL DEFAULT now(),
  policy text NOT NULL,
  window_months integer NOT NULL,
  dry_run boolean NOT NULL,
  contacts_removed integer NOT NULL DEFAULT 0,
  activities_removed integer NOT NULL DEFAULT 0
);

ALTER TABLE public.data_retention_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read retention runs" ON public.data_retention_runs;
CREATE POLICY "Admins read retention runs" ON public.data_retention_runs
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.purge_stale_prospects(
  p_months integer DEFAULT 24,
  p_dry_run boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_cutoff timestamptz := now() - (p_months || ' months')::interval;
  v_ids uuid[];
  v_acts integer := 0;
  v_contacts integer := 0;
BEGIN
  IF NOT (
       auth.role() = 'service_role'
    OR has_role(auth.uid(), 'admin'::app_role)
    OR session_user IN ('postgres', 'supabase_admin')
  ) THEN
    RAISE EXCEPTION 'purge_stale_prospects: admin or service_role required';
  END IF;

  -- En testbädd ackumulerar data med flit; en gallring som river den vore
  -- exakt det testbädds-vetot finns för. Grinden fångade att den saknades.
  IF NOT p_dry_run THEN
    PERFORM public.assert_not_testbed('purge_stale_prospects');
  END IF;

  IF p_months < 6 THEN
    -- En gallring som når innevarande säljcykel är inte gallring, det är
    -- dataförlust. Golvet finns för att ett tryckfel inte ska kosta ett år.
    RAISE EXCEPTION 'purge_stale_prospects: window must be at least 6 months (got %)', p_months;
  END IF;

  SELECT array_agg(l.id) INTO v_ids
  FROM leads l
  WHERE l.status <> 'customer'
    AND l.converted_at IS NULL
    AND GREATEST(
          COALESCE((SELECT max(a.created_at) FROM lead_activities a WHERE a.lead_id = l.id), l.created_at),
          l.created_at
        ) < v_cutoff
    AND NOT EXISTS (SELECT 1 FROM deals      d WHERE d.lead_id = l.id)
    AND NOT EXISTS (SELECT 1 FROM quotes     q WHERE q.lead_id = l.id)
    AND NOT EXISTS (SELECT 1 FROM invoices   i WHERE i.lead_id = l.id)
    AND NOT EXISTS (SELECT 1 FROM tickets    t WHERE t.lead_id = l.id)
    AND NOT EXISTS (SELECT 1 FROM crm_tasks  c WHERE c.lead_id = l.id)
    AND NOT EXISTS (SELECT 1 FROM pricelists p WHERE p.lead_id = l.id);

  v_contacts := COALESCE(array_length(v_ids, 1), 0);

  IF v_contacts > 0 AND NOT p_dry_run THEN
    -- Aktiviteterna först: en kontakt som försvinner medan dess liggare ligger
    -- kvar är exakt den halvskrivning som dyker upp långt senare.
    WITH removed AS (
      DELETE FROM lead_activities WHERE lead_id = ANY(v_ids) RETURNING 1
    ) SELECT count(*) INTO v_acts FROM removed;
    DELETE FROM leads WHERE id = ANY(v_ids);
  ELSIF v_contacts > 0 THEN
    SELECT count(*) INTO v_acts FROM lead_activities WHERE lead_id = ANY(v_ids);
  END IF;

  INSERT INTO data_retention_runs (policy, window_months, dry_run, contacts_removed, activities_removed)
  VALUES ('stale_prospects', p_months, p_dry_run, v_contacts, v_acts);

  RETURN jsonb_build_object(
    'success', true,
    'dry_run', p_dry_run,
    'window_months', p_months,
    'cutoff', v_cutoff,
    'contacts', v_contacts,
    'activities', v_acts
  );
END;
$$;

REVOKE ALL ON FUNCTION public.purge_stale_prospects(integer, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_stale_prospects(integer, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.purge_stale_prospects(integer, boolean) TO authenticated, service_role;

-- Månadsvis, ren SQL (ingen URL, inga nycklar — cron-giftkedjan kan inte uppstå).
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-stale-prospects') THEN
      PERFORM cron.schedule(
        'purge-stale-prospects',
        '15 3 1 * *',
        'SELECT public.purge_stale_prospects(24, false);'
      );
    END IF;
  END IF;
END;
$do$;

NOTIFY pgrst, 'reload schema';
