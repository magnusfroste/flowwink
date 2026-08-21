-- Companies-skrivningar följer MATRISEN. UPDATE/INSERT var admin|approver —
-- spökrollistan (rollsvep 3-klassen) i RLS-form: sales/marketing med companies-
-- modulen fick tyst 403 när fit-analysen skulle sparas (persistFit är
-- fire-and-forget klientside; Magnus Redeye-fit beräknades, visades och
-- försvann, 2026-08-20). Läsningen följde redan matrisen — skrivningen inte.
-- approver behålls additivt (attest-axeln). DELETE förblir admin.

DROP POLICY IF EXISTS "Companies writable by companies-module roles" ON public.companies;
CREATE POLICY "Companies writable by companies-module roles" ON public.companies
  FOR UPDATE TO authenticated
  USING (can_access_module(auth.uid(), 'companies'))
  WITH CHECK (can_access_module(auth.uid(), 'companies'));

DROP POLICY IF EXISTS "Companies insertable by companies-module roles" ON public.companies;
CREATE POLICY "Companies insertable by companies-module roles" ON public.companies
  FOR INSERT TO authenticated
  WITH CHECK (can_access_module(auth.uid(), 'companies'));

-- Atomisk fit-sparning: kortets NULÄGE + tidslinjens OBSERVATION i ett anrop.
-- SECURITY DEFINER med samma matrisvakt; klienten slutar skriva två tabeller
-- själv och en nekad sparning blir ett ÄRLIGT fel i stället för tyst konsol-rad.
CREATE OR REPLACE FUNCTION public.save_fit_assessment(
  p_company_id uuid,
  p_fit jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_score int := (p_fit->>'fit_score')::int;
  v_activity_id uuid;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'companies')) THEN
    RAISE EXCEPTION 'Forbidden: saving a fit assessment requires the companies module (Users → Role Permissions)';
  END IF;
  IF v_score IS NULL OR v_score < 0 OR v_score > 100 THEN
    RAISE EXCEPTION 'fit_score must be an integer 0-100 (got %)', p_fit->>'fit_score';
  END IF;

  UPDATE companies SET
    fit_score = v_score,
    fit_analysis = p_fit,
    fit_analyzed_at = now(),
    updated_at = now()
  WHERE id = p_company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Company % not found', p_company_id; END IF;

  INSERT INTO activities (entity_type, entity_id, activity_type, subject, body, metadata, created_by, done_at)
  VALUES (
    'company', p_company_id, 'fit_analysis',
    'Fit-analys: ' || v_score || '/100',
    coalesce(p_fit->>'motivation', p_fit->>'summary', 'Se metadata för hela bedömningen.'),
    p_fit, auth.uid(), now()
  ) RETURNING id INTO v_activity_id;

  RETURN jsonb_build_object('saved', true, 'fit_score', v_score, 'activity_id', v_activity_id);
END $$;
