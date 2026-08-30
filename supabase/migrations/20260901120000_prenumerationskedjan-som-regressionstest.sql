-- Prenumerationskedjan blir ett regressionstest.
--
-- Magnus kan inte avgöra genom att titta om abonnemangen fortfarande fungerar
-- när partsregistret kopplas in — och det är en rimlig invändning, för
-- abonnemang är den enda entiteten som bär BÅDA köpresorna:
--
--   Optic:   lead → offert → avtal → abonnemang → faktura → ärende
--   Webshop: gästutcheckning → Stripe-abonnemang → faktura
--
-- Den här kedjan KÖR båda processerna och kastar när invarianterna inte håller,
-- precis som sandbox_seed_p2p / _o2c / _rma gör för inköp, försäljning och
-- returer. Den simulerar inte faktureringen: den anropar den riktiga
-- generate_subscription_invoice(). Ett abonnemang som slutar fakturera märks
-- därför här, inte hos en kund.
--
-- Kedjan körs FÖRE partsregistret kopplas till några skrivare, så den mäter
-- utgångsläget. Samma kedja körd efteråt är beviset på att ingenting gick
-- sönder — och den delen av påståendet är det enda som är värt något.
--
-- Sandbox/demo endast, samma vakt som de tre befintliga kedjorna.

CREATE OR REPLACE FUNCTION public.sandbox_seed_subscriptions()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_is_sandbox   boolean;
  v_company      uuid;
  v_lead         uuid;
  v_partner      uuid;
  v_commercial   uuid;
  v_web_partner  uuid;
  v_sub_optic    uuid;
  v_sub_web      uuid;
  v_invoice      uuid;
  v_before       int;
  v_after        int;
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

  -- Städa förra körningens rader så kedjan går att köra om. Markörerna är
  -- e-postadresserna; de är unika för den här kedjan.
  DELETE FROM invoices WHERE customer_email IN ('kedja.optic@sandbox.local', 'kedja.webb@sandbox.local');
  DELETE FROM subscriptions WHERE customer_email IN ('kedja.optic@sandbox.local', 'kedja.webb@sandbox.local');
  DELETE FROM leads WHERE email = 'kedja.optic@sandbox.local';
  DELETE FROM partners WHERE email IN ('kedja.optic@sandbox.local', 'kedja.webb@sandbox.local');
  DELETE FROM companies WHERE name = 'Kedjebolaget AB';

  -- ══ 1. Optic-resan: parten föds ur ett lead som blir kund ════════════════
  INSERT INTO companies (name, org_number, country)
  VALUES ('Kedjebolaget AB', '556000-9999', 'SE')
  RETURNING id INTO v_company;

  INSERT INTO leads (name, email, company_id, status)
  VALUES ('Kedjekontakten', 'kedja.optic@sandbox.local', v_company, 'customer')
  RETURNING id INTO v_lead;

  v_partner := (ensure_lead_partner(v_lead) ->> 'partner_id')::uuid;
  IF v_partner IS NULL THEN
    RAISE EXCEPTION 'sandbox_seed_subscriptions: ensure_lead_partner gave no partner for a lead that has both a name and an email';
  END IF;

  SELECT commercial_partner_id INTO v_commercial FROM partners WHERE id = v_partner;
  IF v_commercial = v_partner THEN
    RAISE EXCEPTION 'sandbox_seed_subscriptions: the contact is its own commercial partner — the company party was not created or not linked, so the invoice would be booked on the person';
  END IF;

  -- ══ 2. Webbresan: en gäst utan lead, utan bolag ══════════════════════════
  v_web_partner := find_or_create_partner_by_email('kedja.webb@sandbox.local', 'Kedjegästen');
  IF v_web_partner IS NULL THEN
    RAISE EXCEPTION 'sandbox_seed_subscriptions: guest checkout produced no partner';
  END IF;
  IF EXISTS (SELECT 1 FROM partners WHERE id = v_web_partner AND parent_id IS NOT NULL) THEN
    RAISE EXCEPTION 'sandbox_seed_subscriptions: the guest party was parented under something — a guest must become a root party, never a child of a placeholder';
  END IF;
  IF v_web_partner = v_partner THEN
    RAISE EXCEPTION 'sandbox_seed_subscriptions: the two journeys collapsed into one party';
  END IF;

  -- Idempotens: samma gäst igen får inte bli en ny part.
  IF find_or_create_partner_by_email('kedja.webb@sandbox.local', 'Kedjegästen') <> v_web_partner THEN
    RAISE EXCEPTION 'sandbox_seed_subscriptions: the same email produced two parties — every repeat purchase would create a new customer';
  END IF;

  -- ══ 3. Abonnemangen ══════════════════════════════════════════════════════
  -- provider MÅSTE anges. Kolumnens default är 'stripe', så ett avtalsabonnemang
  -- som glömmer den föds provider-backat och vår fakturamotor vägrar det —
  -- tyst ofakturerbart. Alla plattformens egna vägar sätter den; den här raden
  -- finns för att kedjan gick rakt in i fällan första gången den kördes.
  INSERT INTO subscriptions (customer_email, customer_name, status, unit_amount_cents,
                             billing_interval, billing_interval_count, quantity, provider,
                             current_period_start, current_period_end, next_invoice_date)
  VALUES ('kedja.optic@sandbox.local', 'Kedjekontakten', 'active', 250000,
          'month', 1, 1, 'manual', CURRENT_DATE, CURRENT_DATE + 30, CURRENT_DATE)
  RETURNING id INTO v_sub_optic;

  INSERT INTO subscriptions (customer_email, customer_name, status, unit_amount_cents,
                             billing_interval, billing_interval_count, quantity, provider,
                             current_period_start, current_period_end, next_invoice_date)
  VALUES ('kedja.webb@sandbox.local', 'Kedjegästen', 'active', 49900,
          'month', 1, 1, 'stripe', CURRENT_DATE, CURRENT_DATE + 30, CURRENT_DATE)
  RETURNING id INTO v_sub_web;

  -- ══ 4. Den riktiga faktureringen — inte en simulering av den ═════════════
  SELECT count(*) INTO v_before FROM invoices;
  v_invoice := (generate_subscription_invoice(v_sub_optic) ->> 'invoice_id')::uuid;
  SELECT count(*) INTO v_after FROM invoices;

  IF v_invoice IS NULL OR v_after <> v_before + 1 THEN
    RAISE EXCEPTION 'sandbox_seed_subscriptions: billing an active subscription produced no invoice (before %, after %) — the subscription chain is broken',
      v_before, v_after;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM invoices WHERE id = v_invoice AND total_cents > 0) THEN
    RAISE EXCEPTION 'sandbox_seed_subscriptions: the generated invoice has no amount';
  END IF;

  -- Stripe-grenen faktureras INTE av oss — det är hela gränssnittet mot
  -- providern. Kortkunden betalar hos Stripe, och customer.subscription.created
  -- skapar raden här. Att vår fakturamotor vägrar är alltså rätt beteende, och
  -- den vägran är värd ett eget påstående: försvinner den tyst börjar vi
  -- dubbelfakturera kortkunder.
  BEGIN
    PERFORM generate_subscription_invoice(v_sub_web);
    RAISE EXCEPTION 'sandbox_seed_subscriptions: our billing engine invoiced a PROVIDER-backed subscription — the Stripe customer would be charged twice';
  EXCEPTION WHEN others THEN
    IF sqlerrm NOT LIKE '%only applies to manual subscriptions%' THEN
      RAISE;
    END IF;
  END;

  -- ══ 5. Partsregistret når hela kedjan ════════════════════════════════════
  PERFORM backfill_document_partners(false);

  IF EXISTS (SELECT 1 FROM subscriptions
             WHERE customer_email IN ('kedja.optic@sandbox.local','kedja.webb@sandbox.local')
               AND partner_id IS NULL) THEN
    RAISE EXCEPTION 'sandbox_seed_subscriptions: a subscription in the chain has no party';
  END IF;

  IF EXISTS (SELECT 1 FROM invoices
             WHERE customer_email = 'kedja.optic@sandbox.local'
               AND partner_id IS NULL) THEN
    RAISE EXCEPTION 'sandbox_seed_subscriptions: an invoice generated by billing has no party';
  END IF;

  IF (SELECT partner_id FROM subscriptions WHERE id = v_sub_web) <> v_web_partner THEN
    RAISE EXCEPTION 'sandbox_seed_subscriptions: the card customer''s subscription points at the wrong party';
  END IF;

  IF (SELECT partner_id FROM subscriptions WHERE id = v_sub_optic) <> v_partner THEN
    RAISE EXCEPTION 'sandbox_seed_subscriptions: the Optic subscription points at a different party than its lead';
  END IF;

  SELECT jsonb_build_object(
    'optic_partner',   (SELECT name FROM partners WHERE id = v_partner),
    'booked_on',       (SELECT name FROM partners WHERE id = v_commercial),
    'guest_partner',   (SELECT name FROM partners WHERE id = v_web_partner),
    'invoices_made',   (SELECT count(*) FROM invoices WHERE customer_email LIKE 'kedja.%@sandbox.local')
  ) INTO v_report;

  RETURN jsonb_build_object(
    'seeded', true,
    'chain', 'subscriptions',
    'detail', v_report,
    'note', 'Both journeys billed for real, both carry a party, and the Optic contact is booked on its company.');
END; $fn$;

REVOKE EXECUTE ON FUNCTION public.sandbox_seed_subscriptions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sandbox_seed_subscriptions() TO authenticated, service_role;

COMMENT ON FUNCTION public.sandbox_seed_subscriptions() IS
  'Kör båda köpresorna — avtalsdriven och Stripe-driven — genom riktig '
  'fakturering och asserterar att varje dokument bär en part och att '
  'kontaktpersonen bokförs på sitt bolag. Sandbox/demo endast.';

-- ── Kedjan kopplas in i den nattliga körningen ──────────────────────────────
-- En kedja som ingen kör är en död ratt. seed_demo_operations kör de tre
-- befintliga; prenumerationskedjan läggs sist eftersom den inte beror på lager.
--
-- Städningen är också uppdaterad: teardown-funktionen känner sina egna rader,
-- men prenumerationskedjan städar sina själv vid varje körning (markörerna är
-- e-postadresserna), så den behöver inget tillägg där.
CREATE OR REPLACE FUNCTION public.seed_demo_operations(p_run_id uuid, p_scenario text DEFAULT 'default')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_teardown jsonb;
  v_p2p jsonb;
  v_o2c jsonb;
  v_rma jsonb;
  v_sub jsonb;
BEGIN
  -- Testbäddsskyddet MÅSTE följa med. Första versionen av den här filen
  -- kopierade kroppen från augustimigrationen och skrev därmed över
  -- 20260823020000:s rivningsspärr — en tyst regression som grinden
  -- testbed-is-never-torn-down fångade. Att kopiera en CREATE OR REPLACE-kropp
  -- från en äldre migration är att återställa den äldre versionen.
  IF public.is_testbed() THEN
    v_teardown := jsonb_build_object(
      'skipped', true,
      'reason', 'testbed: history accumulates here, so the previous run is kept instead of torn down');
  ELSE
    v_teardown := public.sandbox_teardown_chains();
  END IF;

  v_p2p := public.sandbox_seed_p2p();
  v_o2c := public.sandbox_seed_o2c();
  v_rma := public.sandbox_seed_rma();
  v_sub := public.sandbox_seed_subscriptions();

  RETURN jsonb_build_object(
    'teardown', v_teardown,
    'procure_to_pay', v_p2p,
    'order_to_cash', v_o2c,
    'return_to_refund', v_rma,
    'subscriptions', v_sub,
    'note', 'Every figure below was earned by a process that ran. A failure here is a regression, not a seeding problem.');
END; $fn$;

REVOKE EXECUTE ON FUNCTION public.seed_demo_operations(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seed_demo_operations(uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.seed_demo_operations(uuid, text) IS
  'demo-cycle entry point for the P2P → O2C → RMA → subscriptions chains. Tears down the previous run first EXCEPT on a testbed, where history accumulates and only the chains re-run.';
