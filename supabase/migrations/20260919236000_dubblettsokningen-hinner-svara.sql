-- Dubblettsökningen hinner svara.
--
-- find_duplicate_leads jämförde VARJE par av leads (a.id < b.id) med similarity()
-- — kvadratiskt. Med 800 leads tog den nio sekunder och slog i databasens
-- tidsgräns ungefär varannan gång (processbatteriet 2026-09-19 fann den som en
-- kontroll som flippade); en instans med ett par tusen leads får aldrig ett svar.
-- Den gick heller inte att avgränsa: i ett CRM med många exakta namnpar föll det
-- par en operatör frågade om utanför p_limit.
--
-- Nu: namnkandidaterna hämtas genom trigramindexet (operatorn %), adressparen
-- genom en likhetsjoin på den normaliserade adressen (indexerad), och p_lead_id
-- avgränsar sökningen till ETT leads dubbletter. Samma svar, samma poäng.
--
-- Idempotent: IF NOT EXISTS, DROP … IF EXISTS, CREATE OR REPLACE.
CREATE INDEX IF NOT EXISTS leads_name_trgm_idx ON public.leads USING gin (lower(name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS leads_normalized_email_idx ON public.leads (public.normalize_email(email));

-- En signatur: p_lead_id läggs sist med DEFAULT, och den gamla tvåargumentsformen tas bort
-- så PostgREST aldrig står mellan två kandidater.
DROP FUNCTION IF EXISTS public.find_duplicate_leads(numeric, integer);
CREATE OR REPLACE FUNCTION public.find_duplicate_leads(p_threshold numeric DEFAULT 0.45, p_limit integer DEFAULT 25, p_lead_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_rows jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'leads')) THEN
    RAISE EXCEPTION 'Finding duplicate leads requires the leads module' USING ERRCODE = '42501';
  END IF;
  -- % använder trigramindexet; tröskeln för kandidaterna får aldrig vara hårdare än den begärda.
  PERFORM set_config('pg_trgm.similarity_threshold', LEAST(GREATEST(COALESCE(p_threshold, 0.45), 0.05), 1.0)::text, true);

  WITH pairs AS (
    SELECT a.id AS a_id, b.id AS b_id
      FROM leads a JOIN leads b ON a.id < b.id AND lower(a.name) % lower(b.name)
     WHERE a.name IS NOT NULL AND b.name IS NOT NULL
       AND (p_lead_id IS NULL OR a.id = p_lead_id OR b.id = p_lead_id)
    UNION
    SELECT a.id, b.id
      FROM leads a JOIN leads b ON a.id < b.id AND normalize_email(a.email) = normalize_email(b.email)
     WHERE normalize_email(a.email) IS NOT NULL
       AND (p_lead_id IS NULL OR a.id = p_lead_id OR b.id = p_lead_id)
  ), scored AS (
    SELECT a.id AS lead_a, a.name AS name_a, a.email AS email_a, a.status::text AS status_a,
           b.id AS lead_b, b.name AS name_b, b.email AS email_b, b.status::text AS status_b,
           round(GREATEST(
             similarity(lower(coalesce(a.name, '')), lower(coalesce(b.name, ''))),
             CASE WHEN normalize_email(a.email) IS NOT NULL
                   AND normalize_email(a.email) = normalize_email(b.email) THEN 1.0 ELSE 0 END
           )::numeric, 2) AS score,
           (normalize_email(a.email) IS NOT NULL
             AND normalize_email(a.email) = normalize_email(b.email)) AS same_email
      FROM pairs p JOIN leads a ON a.id = p.a_id JOIN leads b ON b.id = p.b_id
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.score DESC, x.same_email DESC), '[]'::jsonb) INTO v_rows
    FROM (SELECT * FROM scored WHERE score >= COALESCE(p_threshold, 0.45) OR same_email
           ORDER BY score DESC, same_email DESC LIMIT GREATEST(COALESCE(p_limit, 25), 1)) x;
  RETURN jsonb_build_object('success', true, 'pairs', v_rows, 'scoped_to_lead', p_lead_id);
END $function$;

REVOKE ALL ON FUNCTION public.find_duplicate_leads(numeric, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_duplicate_leads(numeric, integer, uuid) TO authenticated, service_role;

DO $proof$
DECLARE v_a uuid; v_b uuid; v_r jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  BEGIN
    INSERT INTO leads (email, name) VALUES ('proof.dupe@example.test', 'Proof Dubblett Andersson') RETURNING id INTO v_a;
    INSERT INTO leads (email, name) VALUES ('proof.dupe+event@example.test', 'Proof Dubblet Anderson') RETURNING id INTO v_b;
    v_r := public.find_duplicate_leads(0.95, 10, v_a);
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_r->'pairs') e
                    WHERE (e->>'lead_a')::uuid IN (v_a, v_b) AND (e->>'lead_b')::uuid IN (v_a, v_b) AND (e->>'same_email')::boolean) THEN
      RAISE EXCEPTION 'proof: the plus-address twin of one lead was not found when the search was scoped to it: %', v_r;
    END IF;
    RAISE EXCEPTION 'proof-rollback';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'proof-rollback' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'dubblettsokningen: proof passed';
END $proof$;
