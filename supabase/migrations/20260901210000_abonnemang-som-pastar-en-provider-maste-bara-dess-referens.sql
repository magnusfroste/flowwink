-- Ett abonnemang som påstår sig ha en provider måste bära providerns referens.
--
-- Fällan: subscriptions.provider har DEFAULT 'stripe'. En skrivare som glömmer
-- kolumnen föder ett avtalsabonnemang som är provider-backat, och
-- generate_subscription_invoice vägrar det med "only applies to manual
-- subscriptions". Abonnemanget blir TYST OFAKTURERBART — ingen felar, ingen
-- larmar, pengarna kommer bara aldrig. Regressionskedjan gick rakt in i den
-- första gången den kördes, och det var mitt eget test som skrev raden.
--
-- ÖVERVÄGT OCH FÖRKASTAT: att flippa defaulten till 'manual'. Det vore sämre.
-- Glömd kolumn med 'stripe' → tyst ofakturerbart, vi förlorar intäkt.
-- Glömd kolumn med 'manual' → vi fakturerar något Stripe också fakturerar, och
-- KUNDEN DUBBELDEBITERAS. Defaulten faller alltså redan åt det mindre farliga
-- hållet; problemet är inte vilket värde den har utan att det inkonsekventa
-- tillståndet över huvud taget går att skriva.
--
-- Regeln blir därför: provider ≠ 'manual' kräver provider_subscription_id.
-- Stripe-webhooken sätter alltid båda (stripe-webhook/index.ts:195-196), så
-- inget riktigt flöde påverkas — bara det som skedde av misstag.

CREATE OR REPLACE FUNCTION public.subscriptions_provider_needs_reference()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- På UPDATE: bara när kombinationen NYSS uppstod. En gammal rad med det här
  -- felet ska inte blockera varje orelaterad uppdatering på den; den fångas av
  -- find_unreferenced_provider_subscriptions() i stället.
  IF TG_OP = 'UPDATE'
     AND NEW.provider IS NOT DISTINCT FROM OLD.provider
     AND NEW.provider_subscription_id IS NOT DISTINCT FROM OLD.provider_subscription_id THEN
    RETURN NEW;
  END IF;

  IF coalesce(NEW.provider, '') <> 'manual'
     AND (NEW.provider_subscription_id IS NULL OR trim(NEW.provider_subscription_id) = '') THEN
    RAISE EXCEPTION
      'Subscription claims provider "%" but carries no provider_subscription_id. '
      'If this is a contract-driven subscription WE invoice, set provider => ''manual'' — '
      'the column defaults to ''stripe'', so leaving it out makes the subscription '
      'silently unbillable. If it really is provider-backed, set the provider''s own id.',
      NEW.provider;
  END IF;

  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.subscriptions_provider_needs_reference() IS
  'Vägrar ett abonnemang som påstår sig ha en provider utan att bära dess '
  'referens — tillståndet som gör ett avtalsabonnemang tyst ofakturerbart.';

DROP TRIGGER IF EXISTS subscriptions_provider_reference ON public.subscriptions;
CREATE TRIGGER subscriptions_provider_reference
  BEFORE INSERT OR UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.subscriptions_provider_needs_reference();

-- ── Befintliga rader: rapportera, rätta aldrig automatiskt ─────────────────
-- Om en rad redan står fel är svaret ett omdöme: skulle den faktureras av oss
-- eller av Stripe? Att gissa åt operatören är att antingen tappa en intäkt
-- eller dubbeldebitera en kund. Funktionen visar raderna och håller tyst.
CREATE OR REPLACE FUNCTION public.find_unreferenced_provider_subscriptions()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rows jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role'
          OR can_access_module(auth.uid(), 'subscriptions')
          OR has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden: reading subscription health requires the subscriptions module';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id,
           'customer_email', s.customer_email,
           'provider', s.provider,
           'status', s.status,
           'unit_amount_cents', s.unit_amount_cents,
           'created_at', s.created_at) ORDER BY s.created_at), '[]'::jsonb)
    INTO v_rows
  FROM subscriptions s
  WHERE coalesce(s.provider,'') <> 'manual'
    AND (s.provider_subscription_id IS NULL OR trim(s.provider_subscription_id) = '');

  RETURN jsonb_build_object(
    'unbillable', v_rows,
    'count', jsonb_array_length(v_rows),
    'note', 'These claim a provider but carry no provider reference, so our billing '
         || 'engine refuses them and the provider does not know about them either. '
         || 'Decide per row: provider => manual if we invoice it, or fill in the '
         || 'provider id. Guessing would either lose revenue or double-charge.');
END $$;

REVOKE ALL ON FUNCTION public.find_unreferenced_provider_subscriptions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_unreferenced_provider_subscriptions() TO authenticated, service_role;

-- ── Invarianten in i kedjan ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assert_no_silently_unbillable_subscriptions()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM subscriptions
  WHERE customer_email LIKE 'kedja.%@sandbox.local'
    AND coalesce(provider,'') <> 'manual'
    AND (provider_subscription_id IS NULL OR trim(provider_subscription_id) = '');
  IF v_n > 0 THEN
    RAISE EXCEPTION 'billing check: % subscription(s) in this chain claim a provider without its reference — they are unbillable by us and unknown to the provider', v_n;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.assert_no_silently_unbillable_subscriptions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_no_silently_unbillable_subscriptions() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.sandbox_seed_subscriptions()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $outer$
DECLARE v jsonb;
BEGIN
  v := public.sandbox_seed_subscriptions_core();
  PERFORM public.assert_ledger_rolls_up_to_company();
  PERFORM public.assert_invoiced_customer_is_visible();
  PERFORM public.assert_no_silently_unbillable_subscriptions();
  RETURN v || jsonb_build_object(
    'ledger_rolls_up_to_the_company', true,
    'invoiced_customers_visible_in_the_lens', true,
    'no_silently_unbillable_subscriptions', true);
END $outer$;

REVOKE ALL ON FUNCTION public.sandbox_seed_subscriptions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sandbox_seed_subscriptions() TO authenticated, service_role;

-- ── Kedjans egen testdata var orealistisk ──────────────────────────────────
-- Grinden ovan fångade kedjan SJÄLV: dess Stripe-gren skapade ett abonnemang
-- utan provider_subscription_id, vilket en riktig Stripe-prenumeration aldrig
-- gör (webhooken sätter sub.id på rad 196). Grinden hade rätt; testet hade fel.
--
-- Kroppen skrivs inte av för hand utan läses ur steg 6 och patchas på en rad,
-- eftersom en avskriven CREATE OR REPLACE-kropp återställer den äldre versionen
-- — den läxan kostade testbäddsskyddet en gång redan i den här serien.
CREATE OR REPLACE FUNCTION public.sandbox_seed_subscriptions_body()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_is_sandbox   boolean;
  v_company      uuid;  v_lead        uuid;
  v_partner      uuid;  v_commercial  uuid;
  v_web_partner  uuid;  v_sub_optic   uuid;
  v_sub_web      uuid;  v_invoice     uuid;
  v_before       int;   v_after       int;
  v_report       jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'Only admins can seed the sandbox';
  END IF;

  SELECT COALESCE(
           (SELECT (value #>> '{}')::boolean FROM public.site_settings WHERE key = 'sandbox_mode'),
           (SELECT (value ->> 'enabled')::boolean FROM public.site_settings WHERE key = 'demo_mode'),
           false)
    INTO v_is_sandbox;
  IF NOT COALESCE(v_is_sandbox, false) THEN
    RAISE EXCEPTION 'sandbox_seed_subscriptions refused: this instance is neither a sandbox nor a demo';
  END IF;

  DELETE FROM invoices WHERE customer_email IN ('kedja.optic@sandbox.local', 'kedja.webb@sandbox.local');
  DELETE FROM subscriptions WHERE customer_email IN ('kedja.optic@sandbox.local', 'kedja.webb@sandbox.local');
  DELETE FROM leads WHERE email = 'kedja.optic@sandbox.local';
  DELETE FROM partners WHERE email IN ('kedja.optic@sandbox.local', 'kedja.webb@sandbox.local');
  DELETE FROM companies WHERE name = 'Kedjebolaget AB';

  INSERT INTO companies (name, org_number, country)
  VALUES ('Kedjebolaget AB', '556000-9999', 'SE') RETURNING id INTO v_company;
  INSERT INTO leads (name, email, company_id, status)
  VALUES ('Kedjekontakten', 'kedja.optic@sandbox.local', v_company, 'customer')
  RETURNING id INTO v_lead;

  v_partner := (ensure_lead_partner(v_lead) ->> 'partner_id')::uuid;
  IF v_partner IS NULL THEN
    RAISE EXCEPTION 'sandbox_seed_subscriptions: ensure_lead_partner gave no partner for a lead that has both a name and an email';
  END IF;

  SELECT commercial_partner_id INTO v_commercial FROM partners WHERE id = v_partner;
  IF v_commercial = v_partner THEN
    RAISE EXCEPTION 'sandbox_seed_subscriptions: the contact is its own commercial partner — the invoice would be booked on the person';
  END IF;

  v_web_partner := find_or_create_partner_by_email('kedja.webb@sandbox.local', 'Kedjegästen');
  IF v_web_partner IS NULL THEN
    RAISE EXCEPTION 'sandbox_seed_subscriptions: guest checkout produced no partner';
  END IF;
  IF EXISTS (SELECT 1 FROM partners WHERE id = v_web_partner AND parent_id IS NOT NULL) THEN
    RAISE EXCEPTION 'sandbox_seed_subscriptions: the guest party was parented under something — a guest must become a root party';
  END IF;
  IF v_web_partner = v_partner THEN
    RAISE EXCEPTION 'sandbox_seed_subscriptions: the two journeys collapsed into one party';
  END IF;
  IF find_or_create_partner_by_email('kedja.webb@sandbox.local', 'Kedjegästen') <> v_web_partner THEN
    RAISE EXCEPTION 'sandbox_seed_subscriptions: the same email produced two parties';
  END IF;

  -- FYND 1 fast i kedjan: en gäst som SEDAN blir lead måste återanvända parten.
  -- Det var buggen som gjorde en människa till två kundreskontror.
  IF (SELECT count(*) FROM partners WHERE lower(email) = 'kedja.optic@sandbox.local') <> 1 THEN
    RAISE EXCEPTION 'sandbox_seed_subscriptions: one email carries more than one party';
  END IF;

  INSERT INTO subscriptions (customer_email, customer_name, status, unit_amount_cents,
                             billing_interval, billing_interval_count, quantity, provider,
                             current_period_start, current_period_end, next_invoice_date)
  VALUES ('kedja.optic@sandbox.local', 'Kedjekontakten', 'active', 250000,
          'month', 1, 1, 'manual', CURRENT_DATE, CURRENT_DATE + 30, CURRENT_DATE)
  RETURNING id INTO v_sub_optic;

  INSERT INTO subscriptions (customer_email, customer_name, status, unit_amount_cents,
                             billing_interval, billing_interval_count, quantity, provider,
                             provider_subscription_id,
                             current_period_start, current_period_end, next_invoice_date)
  VALUES ('kedja.webb@sandbox.local', 'Kedjegästen', 'active', 49900,
          'month', 1, 1, 'stripe',
          -- En riktig Stripe-prenumeration bär ALLTID sitt id (webhooken sätter
          -- sub.id). Testdatan gjorde inte det, och den nya grinden fångade
          -- kedjan själv — testet var orealistiskt, inte grinden fel.
          'sub_chain_' || substr(md5(random()::text), 1, 12),
          CURRENT_DATE, CURRENT_DATE + 30, CURRENT_DATE)
  RETURNING id INTO v_sub_web;

  SELECT count(*) INTO v_before FROM invoices;
  v_invoice := (generate_subscription_invoice(v_sub_optic) ->> 'invoice_id')::uuid;
  SELECT count(*) INTO v_after FROM invoices;
  IF v_invoice IS NULL OR v_after <> v_before + 1 THEN
    RAISE EXCEPTION 'sandbox_seed_subscriptions: billing an active subscription produced no invoice (before %, after %)', v_before, v_after;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM invoices WHERE id = v_invoice AND total_cents > 0) THEN
    RAISE EXCEPTION 'sandbox_seed_subscriptions: the generated invoice has no amount';
  END IF;

  BEGIN
    PERFORM generate_subscription_invoice(v_sub_web);
    RAISE EXCEPTION 'sandbox_seed_subscriptions: our billing engine invoiced a PROVIDER-backed subscription — the Stripe customer would be charged twice';
  EXCEPTION WHEN others THEN
    IF sqlerrm NOT LIKE '%only applies to manual subscriptions%' THEN RAISE; END IF;
  END;

  -- Endast referenslänkning. E-postgissning över hela instansen är ett
  -- operatörsbeslut, inte något en nattlig såning ska fatta åt någon.
  PERFORM backfill_document_partners(false, false);

  -- Abonnemang bär varken lead_id eller company_id, så backfillen kan bara nå
  -- dem via e-post — och den slutsatsen ska inte dras nattetid. Här sätts
  -- parten uttryckligen, precis som den kommande SKRIVAREN kommer att göra vid
  -- skapandet. Kedjan speglar den framtida vägen, inte backfillens räckvidd.
  UPDATE subscriptions s SET partner_id = v_partner
   WHERE s.id = v_sub_optic AND s.partner_id IS NULL;
  UPDATE subscriptions s SET partner_id = v_web_partner
   WHERE s.id = v_sub_web AND s.partner_id IS NULL;

  IF (SELECT partner_id FROM subscriptions WHERE id = v_sub_optic) IS DISTINCT FROM v_partner THEN
    RAISE EXCEPTION 'sandbox_seed_subscriptions: the Optic subscription points at a different party than its lead';
  END IF;
  IF EXISTS (SELECT 1 FROM invoices WHERE customer_email = 'kedja.optic@sandbox.local' AND partner_id IS NULL) THEN
    RAISE EXCEPTION 'sandbox_seed_subscriptions: an invoice generated by billing has no party';
  END IF;

  SELECT jsonb_build_object(
    'optic_partner', (SELECT name FROM partners WHERE id = v_partner),
    'booked_on',     (SELECT name FROM partners WHERE id = v_commercial),
    'guest_partner', (SELECT name FROM partners WHERE id = v_web_partner),
    'invoices_made', (SELECT count(*) FROM invoices WHERE customer_email LIKE 'kedja.%@sandbox.local')
  ) INTO v_report;

  RETURN jsonb_build_object('seeded', true, 'chain', 'subscriptions', 'detail', v_report,
    'note', 'Both journeys billed for real, one email carries one party, and the Optic contact is booked on its company.');
END; $fn$;

REVOKE ALL ON FUNCTION public.sandbox_seed_subscriptions_body() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sandbox_seed_subscriptions_body() TO authenticated, service_role;
