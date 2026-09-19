-- Innehållet och leadsen håller sina löften.
--
-- Processbatteriet 2026-09-19 (content-to-conversion, lead-to-customer):
--
--   PUBLICERING  publish_scheduled_pages skrev v_page.id::TEXT (och sedan sluggen)
--                i audit_logs.entity_id, som är uuid. Funktionen kraschade så fort
--                EN sida var förfallen: loopen rullades tillbaka, ingen schemalagd
--                sida gick någonsin live, och 15-minuterscronen föll så länge sidan
--                låg kvar. Artiklar rördes aldrig, trots "pages and blog posts".
--   SAMTYCKET    manage_consent revoke(newsletter) skrevs i samtyckesliggaren, men
--                utskicket läser bara newsletter_subscribers.status. Kopplingen
--                gick åt ETT håll (prenumerant → samtycke): den som återkallat
--                sitt samtycke fick ändå nyhetsbrevet.
--   SAMMANSLAGNING merge_leads flyttar lead_activities med UPDATE … SET lead_id,
--                vilket aktivitetsliggarens vakt vägrar (posten är orubblig). Varje
--                formulärlead föds med en aktivitet — så dubbletthanteringen var
--                död för i praktiken varje lead.
--   SKIFTLÄGET   leads_email_unique ligger på råtexten: Anna.Berg@… blev ett andra lead.
--
-- Idempotent: CREATE OR REPLACE, DROP … IF EXISTS.

-- ── Schemalagd publicering: sidor OCH artiklar ──────────────────────────────
CREATE OR REPLACE FUNCTION public.publish_scheduled_pages()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_now timestamptz := now();
  v_row record;
  v_published int := 0;
  v_failed int := 0;
  v_results jsonb := '[]'::jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR auth.role() IS NULL OR public.can_access_module(auth.uid(), 'pages') OR public.can_access_module(auth.uid(), 'blog')) THEN
    RAISE EXCEPTION 'Publishing scheduled content requires the pages or blog module' USING ERRCODE = '42501';
  END IF;

  FOR v_row IN
    SELECT 'page'::text AS kind, id, title, slug, scheduled_at FROM public.pages
     WHERE status = 'reviewing' AND scheduled_at IS NOT NULL AND scheduled_at <= v_now
    UNION ALL
    SELECT 'blog_post', id, title, slug, scheduled_at FROM public.blog_posts
     WHERE status = 'reviewing' AND scheduled_at IS NOT NULL AND scheduled_at <= v_now
  LOOP
    -- Ett dokument som inte går att publicera får inte ta de andra med sig.
    BEGIN
      IF v_row.kind = 'page' THEN
        UPDATE public.pages SET status = 'published', scheduled_at = NULL, updated_at = v_now WHERE id = v_row.id;
      ELSE
        UPDATE public.blog_posts SET status = 'published', scheduled_at = NULL, published_at = COALESCE(published_at, v_now), updated_at = v_now WHERE id = v_row.id;
      END IF;

      -- entity_id är uuid: id:t hör hemma där, sluggen i metadata.
      INSERT INTO public.audit_logs (action, entity_type, entity_id, metadata)
      VALUES ('scheduled_publish', v_row.kind, v_row.id,
              jsonb_build_object('title', v_row.title, 'slug', v_row.slug, 'scheduled_at', v_row.scheduled_at));
      INSERT INTO public.audit_logs (action, entity_type, entity_id, metadata)
      VALUES ('cache_invalidate', 'cache', v_row.id,
              jsonb_build_object('slug', v_row.slug, 'kind', v_row.kind, 'source', 'scheduled_publish', 'timestamp', v_now));

      v_published := v_published + 1;
      v_results := v_results || jsonb_build_object('id', v_row.id, 'kind', v_row.kind, 'title', v_row.title, 'success', true);
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      v_results := v_results || jsonb_build_object('id', v_row.id, 'kind', v_row.kind, 'title', v_row.title, 'success', false, 'error', SQLERRM);
      RAISE WARNING 'publish_scheduled_pages: % % (%) was due and could not be published: %', v_row.kind, v_row.id, v_row.slug, SQLERRM;
    END;
  END LOOP;

  RETURN jsonb_build_object('success', v_failed = 0, 'published', v_published, 'failed', v_failed, 'results', v_results);
END;
$function$;

-- ── Återkallat samtycke avregistrerar ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.newsletter_consent_reaches_the_subscriber()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  -- Djup > 1: raden skrevs av sync_subscriber_consent (prenumeranten ändrades först).
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF NEW.consent_type = 'newsletter' AND NEW.status = 'revoked' THEN
    UPDATE public.newsletter_subscribers
       SET status = 'unsubscribed', unsubscribed_at = COALESCE(unsubscribed_at, now())
     WHERE lower(email) = lower(NEW.email) AND status <> 'unsubscribed';
  END IF;
  RETURN NEW;
END $fn$;

REVOKE ALL ON FUNCTION public.newsletter_consent_reaches_the_subscriber() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS newsletter_consent_reaches_the_subscriber_trg ON public.contact_consents;
CREATE TRIGGER newsletter_consent_reaches_the_subscriber_trg
  AFTER INSERT ON public.contact_consents
  FOR EACH ROW EXECUTE FUNCTION public.newsletter_consent_reaches_the_subscriber();

-- Den som redan återkallat men står kvar som bekräftad: senaste händelsen avgör.
UPDATE public.newsletter_subscribers s
   SET status = 'unsubscribed', unsubscribed_at = COALESCE(s.unsubscribed_at, now())
 WHERE s.status <> 'unsubscribed'
   AND (SELECT c.status FROM public.contact_consents c
         WHERE lower(c.email) = lower(s.email) AND c.consent_type = 'newsletter'
         ORDER BY c.occurred_at DESC, c.created_at DESC LIMIT 1) = 'revoked';

-- ── Leadets adress är en adress i vilket skiftläge som helst ────────────────
CREATE OR REPLACE FUNCTION public.lead_email_is_lowercase()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF NEW.email IS NOT NULL THEN NEW.email := lower(trim(NEW.email)); END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS lead_email_is_lowercase_trg ON public.leads;
CREATE TRIGGER lead_email_is_lowercase_trg
  BEFORE INSERT OR UPDATE OF email ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.lead_email_is_lowercase();

-- Befintliga rader: gemena, utom där det skulle krocka med ett lead som redan har
-- den gemena adressen (de är dubbletter att slå ihop, inte att skriva över).
UPDATE public.leads l SET email = lower(trim(l.email))
 WHERE l.email <> lower(trim(l.email))
   AND NOT EXISTS (SELECT 1 FROM public.leads o WHERE o.id <> l.id AND o.email = lower(trim(l.email)));

-- ── Sammanslagningen får flytta historiken ──────────────────────────────────
-- Liggaren är orubblig för alla UTOM den namngivna operationen: merge_leads
-- annonserar sitt mål i en transaktionslokal inställning, och bara en flytt TILL
-- det leadet släpps igenom. Ingen kolumn, ingen skill och ingen PostgREST-väg kan
-- sätta den.
DO $patch$
DECLARE v_def text; MARK constant text := '20260919200000';
BEGIN
  v_def := pg_get_functiondef('public.lead_activity_ledger_guard()'::regprocedure);
  IF position('-- merge-door ' || MARK in v_def) = 0 THEN
    IF position('  IF NEW.lead_id    IS DISTINCT FROM OLD.lead_id' in v_def) = 0 THEN
      RAISE EXCEPTION 'innehallet-och-leadsen: anchor missing in lead_activity_ledger_guard';
    END IF;
    v_def := replace(v_def, '  IF NEW.lead_id    IS DISTINCT FROM OLD.lead_id',
      '  -- merge-door ' || MARK || E'\n' ||
      '  IF (NEW.lead_id IS DISTINCT FROM OLD.lead_id' || E'\n' ||
      '      AND COALESCE(current_setting(''flowwink.lead_merge_target'', true), '''') IS DISTINCT FROM NEW.lead_id::text)');
    EXECUTE v_def;
  END IF;

  v_def := pg_get_functiondef('public.merge_leads(uuid,uuid)'::regprocedure);
  IF position('-- merge-door ' || MARK in v_def) = 0 THEN
    IF position('  -- Reassign child rows duplicate -> primary' in v_def) = 0 THEN
      RAISE EXCEPTION 'innehallet-och-leadsen: anchor missing in merge_leads';
    END IF;
    v_def := replace(v_def, '  -- Reassign child rows duplicate -> primary',
      '  -- merge-door ' || MARK || E'\n' ||
      '  PERFORM set_config(''flowwink.lead_merge_target'', p_primary_id::text, true);' || E'\n' ||
      '  -- Reassign child rows duplicate -> primary');
    EXECUTE v_def;
  END IF;
END $patch$;

-- ── Beviset ─────────────────────────────────────────────────────────────────
DO $proof$
DECLARE v_page uuid; v_post uuid; v_r jsonb; v_a uuid; v_b uuid; v_n int; v_sub uuid;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  BEGIN
    INSERT INTO pages (title, slug, status, scheduled_at, content_json) VALUES ('proof: due page', 'proof-due-page-20260919', 'reviewing', now() - interval '1 hour', '[]'::jsonb) RETURNING id INTO v_page;
    INSERT INTO blog_posts (title, slug, status, scheduled_at) VALUES ('proof: due post', 'proof-due-post-20260919', 'reviewing', now() - interval '1 hour') RETURNING id INTO v_post;
    v_r := public.publish_scheduled_pages();
    IF (SELECT status::text FROM pages WHERE id = v_page) <> 'published' THEN RAISE EXCEPTION 'proof: the due page did not go live: %', v_r; END IF;
    IF (SELECT status::text FROM blog_posts WHERE id = v_post) <> 'published' THEN RAISE EXCEPTION 'proof: the due article did not go live: %', v_r; END IF;

    -- Återkallat samtycke avregistrerar, i vilket skiftläge som helst.
    INSERT INTO newsletter_subscribers (email, status) VALUES ('Proof.Consent@example.test', 'confirmed') RETURNING id INTO v_sub;
    INSERT INTO contact_consents (email, consent_type, status, source) VALUES ('proof.consent@EXAMPLE.test', 'newsletter', 'revoked', 'proof');
    IF (SELECT status FROM newsletter_subscribers WHERE id = v_sub) <> 'unsubscribed' THEN RAISE EXCEPTION 'proof: a revoked newsletter consent left the subscriber confirmed'; END IF;

    -- Samma adress i annat skiftläge är samma lead; sammanslagningen flyttar historiken.
    INSERT INTO leads (email, name) VALUES ('Proof.Merge@example.test', 'Proof Merge') RETURNING id INTO v_a;
    IF (SELECT email FROM leads WHERE id = v_a) <> 'proof.merge@example.test' THEN RAISE EXCEPTION 'proof: the lead address was not lower-cased'; END IF;
    BEGIN
      INSERT INTO leads (email, name) VALUES ('PROOF.MERGE@example.test', 'Proof Merge');
      RAISE EXCEPTION 'proof: the same address in another case became a second lead';
    EXCEPTION WHEN unique_violation THEN NULL; END;
    INSERT INTO leads (email, name) VALUES ('proof.merge+event@example.test', 'Proof Merge') RETURNING id INTO v_b;
    INSERT INTO lead_activities (lead_id, type, points, metadata) VALUES (v_b, 'form_submit', 10, '{}'::jsonb);
    v_r := public.merge_leads(v_a, v_b);
    IF NOT COALESCE((v_r->>'success')::boolean, false) THEN RAISE EXCEPTION 'proof: merge_leads failed: %', v_r; END IF;
    SELECT count(*) INTO v_n FROM lead_activities WHERE lead_id = v_a AND type = 'form_submit';
    IF v_n <> 1 THEN RAISE EXCEPTION 'proof: the duplicate''s history did not follow (% rows)', v_n; END IF;
    -- …och liggaren är fortfarande orubblig för alla andra.
    BEGIN
      UPDATE lead_activities SET points = 999 WHERE lead_id = v_a AND type = 'form_submit';
      RAISE EXCEPTION 'proof: a ledger entry was rewritten';
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM NOT LIKE 'lead_activities: the entry is immutable%' THEN RAISE; END IF;
    END;

    RAISE EXCEPTION 'proof-rollback';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'proof-rollback' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'innehallet-och-leadsen: proof passed';
END $proof$;
