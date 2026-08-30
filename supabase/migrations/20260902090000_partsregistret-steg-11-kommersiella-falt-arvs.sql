-- Kundryggraden, steg 11: de kommersiella fälten ärvs.
--
-- I steg 5 skrev jag in i migrationen att arvet var ett senare steg som inte
-- skulle gissas fram. Här är det, kontrollerat mot Odoo 18:s källa.
--
-- _commercial_fields() i basen returnerar ['vat', 'company_registry',
-- 'industry_id']; account-modulen utökar listan med kreditgräns,
-- betalningsvillkor och kontoinställningar. _commercial_sync_from_company()
-- HÄMTAR dem när parent_id ändras, och _commercial_sync_to_children() TRYCKER
-- ned dem när parten är sin egen kommersiella enhet.
--
-- Den avgörande detaljen: synken träffar bara ICKE-BOLAG. Ett dotterbolag
-- behåller sitt eget momsnummer och sina egna villkor — det är en egen
-- juridisk person. Bara kontaktpersoner och adresser ärver.
--
-- Varför det spelar roll hos oss: i dag ärver Maja Sol ingenting från Bageriet
-- Solrosen AB. Betalningsvillkoren måste därför sättas per dokument i stället
-- för en gång på bolaget, och nästa faktura till en annan kontaktperson på
-- samma bolag får gissa om dem igen.
--
-- Och en sak som förvånar: Odoo SKRIVER ÖVER lokala värden vid omflyttning.
-- Byter en anställd arbetsgivare hämtas momsnummer och villkor från den NYA
-- föräldern; det gamla försvinner. Det är avsiktligt — fälten tillhör den
-- juridiska personen, inte personen. Vi gör likadant, men RAPPORTERAR hur
-- många värden som skrevs över, för en tyst överskrivning av ett
-- betalningsvillkor är en tyst ändring av vad kunden ska betala när.

ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS credit_limit_cents bigint;

COMMENT ON COLUMN public.partners.credit_limit_cents IS
  'Kreditgräns. Kommersiellt fält: bor på den juridiska personen och ärvs ned '
  'till kontaktpersoner (Odoo credit_limit).';

-- ── Fältlistan på ETT ställe ────────────────────────────────────────────────
-- Triggern och backfillen läser samma funktion. Två listor som ska hållas i
-- synk hålls aldrig i synk.
CREATE OR REPLACE FUNCTION public.partner_commercial_fields()
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['vat', 'company_registry', 'payment_terms', 'currency', 'credit_limit_cents']
$$;

COMMENT ON FUNCTION public.partner_commercial_fields() IS
  'Fälten som tillhör den kommersiella parten och ärvs ned till icke-bolag '
  '(Odoo _commercial_fields). Lägg till ett fält HÄR, inte i triggern.';

-- ── Hämta uppåt: parten ärver från sin kommersiella part ───────────────────
-- BEFORE, så värdena finns på raden innan den skrivs. Namnet börjar med
-- 'partners_zz' för att köra EFTER partners_commercial_before, som räknar ut
-- commercial_partner_id — utan den ordningen ärver vi från fel förälder.
CREATE OR REPLACE FUNCTION public.partners_inherit_commercial_fields()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_src partners%ROWTYPE;
BEGIN
  -- Ett bolag, eller en rotpart, ÄR sin kommersiella enhet. Den ärver inget.
  IF NEW.is_company OR NEW.commercial_partner_id IS NULL
     OR NEW.commercial_partner_id = NEW.id THEN
    RETURN NEW;
  END IF;

  -- Bara när tillhörigheten faktiskt ändrades. En vanlig namnändring ska inte
  -- tvätta över fälten.
  IF TG_OP = 'UPDATE'
     AND NEW.commercial_partner_id IS NOT DISTINCT FROM OLD.commercial_partner_id THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_src FROM partners WHERE id = NEW.commercial_partner_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  NEW.vat                := v_src.vat;
  NEW.company_registry   := v_src.company_registry;
  NEW.payment_terms      := v_src.payment_terms;
  NEW.currency           := v_src.currency;
  NEW.credit_limit_cents := v_src.credit_limit_cents;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS partners_zz_inherit_commercial ON public.partners;
CREATE TRIGGER partners_zz_inherit_commercial
  BEFORE INSERT OR UPDATE OF parent_id, is_company ON public.partners
  FOR EACH ROW EXECUTE FUNCTION public.partners_inherit_commercial_fields();

-- ── Tryck nedåt: ändras bolagets fält följer kontaktpersonerna med ─────────
CREATE OR REPLACE FUNCTION public.partners_push_commercial_fields()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Bara den kommersiella enheten trycker ned.
  IF NEW.commercial_partner_id IS DISTINCT FROM NEW.id THEN
    RETURN NULL;
  END IF;
  -- Bara när ett kommersiellt fält faktiskt ändrades. Utan den kontrollen
  -- skulle varje uppdatering av en part skriva om hela dess subträd.
  IF NEW.vat IS NOT DISTINCT FROM OLD.vat
     AND NEW.company_registry IS NOT DISTINCT FROM OLD.company_registry
     AND NEW.payment_terms IS NOT DISTINCT FROM OLD.payment_terms
     AND NEW.currency IS NOT DISTINCT FROM OLD.currency
     AND NEW.credit_limit_cents IS NOT DISTINCT FROM OLD.credit_limit_cents THEN
    RETURN NULL;
  END IF;

  -- Icke-bolag inom samma kommersiella part. Ett dotterbolag har sin egen
  -- commercial_partner_id och träffas därför inte — det är en egen juridisk
  -- person och behåller sitt momsnummer.
  UPDATE partners c
     SET vat                = NEW.vat,
         company_registry   = NEW.company_registry,
         payment_terms      = NEW.payment_terms,
         currency           = NEW.currency,
         credit_limit_cents = NEW.credit_limit_cents
   WHERE c.commercial_partner_id = NEW.id
     AND c.id <> NEW.id
     AND NOT c.is_company
     AND (c.vat IS DISTINCT FROM NEW.vat
       OR c.company_registry IS DISTINCT FROM NEW.company_registry
       OR c.payment_terms IS DISTINCT FROM NEW.payment_terms
       OR c.currency IS DISTINCT FROM NEW.currency
       OR c.credit_limit_cents IS DISTINCT FROM NEW.credit_limit_cents);

  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS partners_zz_push_commercial ON public.partners;
CREATE TRIGGER partners_zz_push_commercial
  AFTER UPDATE ON public.partners
  FOR EACH ROW EXECUTE FUNCTION public.partners_push_commercial_fields();

-- ── Momsgränsen: Odoos vägran ──────────────────────────────────────────────
-- account/models/partner.py vägrar en omflyttning som korsar en momsgräns när
-- parten har fakturor: "You cannot set a partner as an invoicing address of
-- another if they have a different VAT."
--
-- Skälet är att omflyttningen skriver om historiken — verifikationsraderna
-- bokas om till den nya juridiska personen. Går det över en momsgräns har man
-- flyttat bokförda belopp mellan två skattesubjekt, vilket ingen får göra av
-- misstag.
CREATE OR REPLACE FUNCTION public.partners_refuse_vat_boundary_move()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old_vat text; v_new_vat text; v_docs int;
BEGIN
  IF TG_OP <> 'UPDATE' OR NEW.parent_id IS NOT DISTINCT FROM OLD.parent_id THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_docs FROM invoices WHERE partner_id = NEW.id;
  IF v_docs = 0 THEN RETURN NEW; END IF;

  SELECT vat INTO v_old_vat FROM partners WHERE id = OLD.commercial_partner_id;
  SELECT vat INTO v_new_vat FROM partners
   WHERE id = coalesce(
     (SELECT commercial_partner_id FROM partners WHERE id = NEW.parent_id), NEW.id);

  IF coalesce(trim(v_old_vat), '') <> '' AND coalesce(trim(v_new_vat), '') <> ''
     AND trim(v_old_vat) <> trim(v_new_vat) THEN
    RAISE EXCEPTION
      'Cannot move % to a parent with a different VAT number (% → %): the partner has % invoice(s), '
      'and reparenting rewrites them to the new legal entity. Moving booked amounts between two tax '
      'subjects must be a deliberate act, not a side effect of an org change.',
      NEW.name, v_old_vat, v_new_vat, v_docs;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS partners_vat_boundary ON public.partners;
CREATE TRIGGER partners_vat_boundary
  BEFORE UPDATE OF parent_id ON public.partners
  FOR EACH ROW EXECUTE FUNCTION public.partners_refuse_vat_boundary_move();

-- ── Backfill av befintliga hierarkier ──────────────────────────────────────
-- Rapporterar hur många värden som SKRIVS ÖVER, inte bara hur många rader som
-- fylls. En tyst överskrivning av ett betalningsvillkor är en tyst ändring av
-- när kunden ska betala.
CREATE OR REPLACE FUNCTION public.backfill_commercial_fields(
  p_dry_run boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_empty int; v_conflicting int; v_synced int := 0;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden: backfilling commercial fields requires the admin role';
  END IF;

  -- Rader som bara saknar värden.
  SELECT count(*) INTO v_empty
    FROM partners c JOIN partners m ON m.id = c.commercial_partner_id
   WHERE c.id <> m.id AND NOT c.is_company
     AND (coalesce(c.vat,'') = '' AND coalesce(m.vat,'') <> ''
       OR coalesce(c.payment_terms,'') = '' AND coalesce(m.payment_terms,'') <> '');

  -- Rader som har ETT EGET värde som skiljer sig — de skrivs över.
  SELECT count(*) INTO v_conflicting
    FROM partners c JOIN partners m ON m.id = c.commercial_partner_id
   WHERE c.id <> m.id AND NOT c.is_company
     AND (coalesce(c.vat,'') <> '' AND coalesce(c.vat,'') IS DISTINCT FROM coalesce(m.vat,'')
       OR coalesce(c.payment_terms,'') <> '' AND coalesce(c.payment_terms,'') IS DISTINCT FROM coalesce(m.payment_terms,''));

  IF NOT p_dry_run THEN
    WITH upd AS (
      UPDATE partners c
         SET vat = m.vat, company_registry = m.company_registry,
             payment_terms = m.payment_terms, currency = m.currency,
             credit_limit_cents = m.credit_limit_cents
        FROM partners m
       WHERE m.id = c.commercial_partner_id AND c.id <> m.id AND NOT c.is_company
         AND (c.vat IS DISTINCT FROM m.vat
           OR c.company_registry IS DISTINCT FROM m.company_registry
           OR c.payment_terms IS DISTINCT FROM m.payment_terms
           OR c.currency IS DISTINCT FROM m.currency
           OR c.credit_limit_cents IS DISTINCT FROM m.credit_limit_cents)
      RETURNING 1
    ) SELECT count(*) INTO v_synced FROM upd;
  END IF;

  RETURN jsonb_build_object(
    'dry_run', p_dry_run,
    'contacts_missing_values', v_empty,
    'contacts_whose_own_value_differs', v_conflicting,
    'contacts_synced', v_synced,
    'note', 'Odoo overwrites local values on the contact: these fields belong to the '
         || 'legal entity, not the person. The second number is how many had a value '
         || 'of their own — read it before running, because a silently overwritten '
         || 'payment term silently changes when the customer has to pay.');
END $$;

REVOKE ALL ON FUNCTION public.backfill_commercial_fields(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.backfill_commercial_fields(boolean) TO authenticated, service_role;

-- ── Bolagets villkor når kontaktpersonen ur companies ──────────────────────
-- companies bär kreditgränsen redan; utan den här raden föds partsregistret
-- utan den och kreditkontrollen har inget att läsa.
UPDATE public.partners p
   SET credit_limit_cents = c.credit_limit_cents
  FROM public.companies c
 WHERE p.source_company_id = c.id
   AND c.credit_limit_cents IS NOT NULL
   AND p.credit_limit_cents IS DISTINCT FROM c.credit_limit_cents;

-- ── Invarianten in i kedjan ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assert_commercial_fields_inherit()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_co uuid; v_person uuid; v_terms text; v_vat text;
BEGIN
  INSERT INTO partners (name, is_company, vat, company_registry, payment_terms)
  VALUES ('Arvsbolaget AB', true, 'SE556000777701', '556000-7777', 'net_45')
  RETURNING id INTO v_co;
  INSERT INTO partners (name, is_company, parent_id, email)
  VALUES ('Arvskontakten', false, v_co, 'arv@sandbox.local')
  RETURNING id INTO v_person;

  SELECT payment_terms, vat INTO v_terms, v_vat FROM partners WHERE id = v_person;
  IF v_terms IS DISTINCT FROM 'net_45' OR v_vat IS DISTINCT FROM 'SE556000777701' THEN
    RAISE EXCEPTION 'inheritance check: the contact did not inherit the company''s terms (% / %) — payment terms would have to be set per document instead of once on the company', v_terms, v_vat;
  END IF;

  -- Ändras bolagets villkor följer kontaktpersonen med.
  UPDATE partners SET payment_terms = 'net_10' WHERE id = v_co;
  SELECT payment_terms INTO v_terms FROM partners WHERE id = v_person;
  IF v_terms IS DISTINCT FROM 'net_10' THEN
    RAISE EXCEPTION 'inheritance check: changing the company''s payment terms did not reach its contact (got %)', v_terms;
  END IF;

  DELETE FROM partners WHERE id IN (v_person, v_co);
END $$;

REVOKE ALL ON FUNCTION public.assert_commercial_fields_inherit() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_commercial_fields_inherit() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.sandbox_seed_subscriptions()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $outer$
DECLARE v jsonb;
BEGIN
  v := public.sandbox_seed_subscriptions_core();
  PERFORM public.assert_ledger_rolls_up_to_company();
  PERFORM public.assert_invoiced_customer_is_visible();
  PERFORM public.assert_no_silently_unbillable_subscriptions();
  PERFORM public.assert_commercial_fields_inherit();
  RETURN v || jsonb_build_object(
    'ledger_rolls_up_to_the_company', true,
    'invoiced_customers_visible_in_the_lens', true,
    'no_silently_unbillable_subscriptions', true,
    'commercial_fields_inherit', true);
END $outer$;

REVOKE ALL ON FUNCTION public.sandbox_seed_subscriptions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sandbox_seed_subscriptions() TO authenticated, service_role;
