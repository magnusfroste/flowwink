-- Besökarens språk följer med (2026-10-26).
--
-- En engelsktalande besökare på /en/… som beställde, bokade eller anmälde sig
-- fick bekräftelser och påminnelser på sajtens språk: språket sparades
-- ingenstans. Odoo-principen gäller här också — kundens språk bor på parten
-- (partners.lang, läst av partner_language) — men en ny part föds i ett köp,
-- så språket måste fångas i ögonblicket och lämnas vidare:
--
--   * orders, bookings, webinar_registrations, newsletter_subscribers får
--     `lang` — det språk handlingen gjordes på (ui-text-språket i webbläsaren).
--   * En part UTAN språk tar det språk den talade i sitt första köp eller sin
--     första bokning. En part som redan har ett (satt av admin eller ett tidigare
--     köp) behåller det — ett köp på /en från en svensk kund byter inte hennes
--     fakturaspråk.
--   * request_booking släpper igenom metadata.lang; register_for_webinar får
--     p_lang (signaturen byts: DROP + CREATE, behörigheterna återställs).
-- Idempotent.

ALTER TABLE public.orders                 ADD COLUMN IF NOT EXISTS lang text;
ALTER TABLE public.bookings               ADD COLUMN IF NOT EXISTS lang text;
ALTER TABLE public.webinar_registrations  ADD COLUMN IF NOT EXISTS lang text;
ALTER TABLE public.newsletter_subscribers ADD COLUMN IF NOT EXISTS lang text;

COMMENT ON COLUMN public.orders.lang IS 'The language the visitor ordered in (ui-text language, e.g. en). Mail about this order speaks it.';
COMMENT ON COLUMN public.bookings.lang IS 'The language the visitor booked in. Confirmation and reminders speak it.';

-- A booking made through request_booking carries its language in metadata.
CREATE OR REPLACE FUNCTION public.bookings_lang_from_metadata()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.lang IS NULL AND NEW.metadata IS NOT NULL THEN
    NEW.lang := NULLIF(lower(trim(NEW.metadata->>'lang')), '');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS a_bookings_lang_from_metadata ON public.bookings;
CREATE TRIGGER a_bookings_lang_from_metadata BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.bookings_lang_from_metadata();

-- A party without a language takes the one it spoke in.
CREATE OR REPLACE FUNCTION public.partner_learns_language()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.lang IS NOT NULL AND NEW.partner_id IS NOT NULL THEN
    UPDATE public.partners SET lang = NEW.lang
     WHERE id = NEW.partner_id AND (lang IS NULL OR trim(lang) = '');
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS zzz_orders_partner_learns_language ON public.orders;
CREATE TRIGGER zzz_orders_partner_learns_language AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.partner_learns_language();
DROP TRIGGER IF EXISTS zzz_bookings_partner_learns_language ON public.bookings;
CREATE TRIGGER zzz_bookings_partner_learns_language AFTER INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.partner_learns_language();

-- request_booking: 'lang' is one of the metadata keys a block may set.
DO $$
DECLARE v_def text; v_new text;
BEGIN
  v_def := pg_get_functiondef('public.request_booking'::regproc);
  IF v_def NOT LIKE '%''lang'', p_metadata->>''lang''%' THEN
    v_new := replace(v_def,
      $o$'intake', CASE WHEN jsonb_typeof(p_metadata->'intake') = 'object' THEN p_metadata->'intake' END)$o$,
      $n$'intake', CASE WHEN jsonb_typeof(p_metadata->'intake') = 'object' THEN p_metadata->'intake' END,
            'lang', p_metadata->>'lang')$n$);
    IF v_new = v_def THEN
      RAISE EXCEPTION 'request_booking: the metadata whitelist was not found — patch by hand';
    END IF;
    EXECUTE v_new;
  END IF;
END $$;

-- register_for_webinar: p_lang (a new trailing parameter with a default needs
-- DROP + CREATE — two overloads would make every call ambiguous for PostgREST).
DO $$
DECLARE v_def text; v_new text;
BEGIN
  IF to_regprocedure('public.register_for_webinar(uuid,text,text,text)') IS NOT NULL THEN
    v_def := pg_get_functiondef('public.register_for_webinar(uuid,text,text,text)'::regprocedure);
    v_new := replace(v_def,
      'p_phone text DEFAULT NULL::text)',
      'p_phone text DEFAULT NULL::text, p_lang text DEFAULT NULL::text)');
    v_new := replace(v_new,
      $o$INSERT INTO webinar_registrations (webinar_id, name, email, phone)
  VALUES (p_webinar_id, p_name, v_email, p_phone)$o$,
      $n$INSERT INTO webinar_registrations (webinar_id, name, email, phone, lang)
  VALUES (p_webinar_id, p_name, v_email, p_phone, NULLIF(lower(trim(p_lang)), ''))$n$);
    IF v_new NOT LIKE '%p_lang text%' OR v_new NOT LIKE '%phone, lang)%' THEN
      RAISE EXCEPTION 'register_for_webinar: the body did not match — patch by hand';
    END IF;
    DROP FUNCTION public.register_for_webinar(uuid, text, text, text);
    EXECUTE v_new;
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.register_for_webinar(uuid, text, text, text, text) TO anon, authenticated, service_role;

-- ── Bevis vid varje applicering ────────────────────────────────────────────
DO $$
DECLARE v_partner uuid; v_order uuid; v_lang text;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO public.orders (customer_email, customer_name, total_cents, currency, status, lang)
    VALUES ('__lang_proof__@example.invalid', 'Proof', 100, public.business_currency(), 'pending', 'en')
    RETURNING id, partner_id INTO v_order, v_partner;
  IF v_partner IS NOT NULL THEN
    SELECT lang INTO v_lang FROM public.partners WHERE id = v_partner;
    IF v_lang IS DISTINCT FROM 'en' THEN
      RAISE EXCEPTION 'a new party did not learn the language of its first order (got %)', v_lang;
    END IF;
  END IF;
  -- Cleanup only; a party with history may refuse deletion by design.
  BEGIN
    DELETE FROM public.orders WHERE id = v_order;
    IF v_partner IS NOT NULL THEN
      DELETE FROM public.partners WHERE id = v_partner;
    END IF;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'language proof cleanup: %', SQLERRM;
  END;
END $$;
