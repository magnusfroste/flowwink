-- Kundryggraden, steg 7: raden föds med sin part.
--
-- Kartläggningen hittade 118 skrivställen som sätter en kundidentitet. Att
-- redigera dem ett och ett är 118 tillfällen att göra fel, och nästa skrivare
-- som någon lägger till missar rälsen ändå. Odoo löser det i ORM:en: partnern
-- är ett beräknat/defaultat fält på modellen, inte något varje anropare måste
-- komma ihåg. Vår motsvarighet är en trigger på tabellen.
--
-- Regeln är avsiktligt SNÅL:
--   * En part som redan är satt rörs aldrig. Skrivaren vet bäst.
--   * Upplösningen sker i styrkeordning — lead_id, company_id, leverantör,
--     sedan exakt e-postmatch mot en part som REDAN FINNS.
--   * Den SKAPAR aldrig en part. En felstavad adress i ett bokningsformulär
--     ska inte föda en kund. Skapandet hör hemma på de två ställen där en part
--     ÄR poängen: leadkonverteringen (steg 2) och kortköpet (steg 7b).
--   * Löser inget upp blir kolumnen NULL. Det är ett ärligt tillstånd och
--     backfillen kan hämta raden senare.
--
-- Alltså: inget beteende går sönder om upplösningen misslyckas, och varje
-- skrivare — även de som skrivs nästa år — får parten gratis.

CREATE OR REPLACE FUNCTION public.documents_resolve_partner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER          -- upplösningen får inte bero på om skrivaren råkar
SET search_path = public  -- ha läsrätt på partners; en support-användare som
AS $$                     -- skapar ett ärende ska ändå få rätt part.
DECLARE
  v_row    jsonb := to_jsonb(NEW);
  v_mail   text  := CASE WHEN TG_NARGS > 0 THEN TG_ARGV[0] ELSE NULL END;
  v_email  text;
  v_id     uuid;
BEGIN
  -- Redan satt av skrivaren: rör den inte.
  IF NEW.partner_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- 1. Leadet — någon har pekat ut personen.
  IF v_row ? 'lead_id' AND (v_row->>'lead_id') IS NOT NULL THEN
    SELECT l.partner_id INTO v_id FROM leads l WHERE l.id = (v_row->>'lead_id')::uuid;
    IF v_id IS NOT NULL THEN NEW.partner_id := v_id; RETURN NEW; END IF;
  END IF;

  -- 2. Bolaget — någon har pekat ut organisationen.
  IF v_row ? 'company_id' AND (v_row->>'company_id') IS NOT NULL THEN
    SELECT p.id INTO v_id FROM partners p
     WHERE p.source_company_id = (v_row->>'company_id')::uuid;
    IF v_id IS NOT NULL THEN NEW.partner_id := v_id; RETURN NEW; END IF;
  END IF;

  -- 3. Leverantören — inköpssidans motsvarighet.
  IF v_row ? 'vendor_id' AND (v_row->>'vendor_id') IS NOT NULL THEN
    SELECT p.id INTO v_id FROM partners p
     WHERE p.source_vendor_id = (v_row->>'vendor_id')::uuid;
    IF v_id IS NOT NULL THEN NEW.partner_id := v_id; RETURN NEW; END IF;
  END IF;

  -- 4. Adressen — men bara mot en part som redan finns. Samma deterministiska
  --    ordning som find_or_create_partner_by_email och backfillen: personen
  --    före bolaget, sedan äldst. Tre skrivare som väljer olika part för samma
  --    adress är en bugg som ser ut som slump.
  IF v_mail IS NOT NULL AND v_row ? v_mail THEN
    v_email := lower(trim(coalesce(v_row->>v_mail, '')));
    IF v_email <> '' THEN
      SELECT p.id INTO v_id FROM partners p
       WHERE lower(p.email) = v_email AND p.active
       ORDER BY p.is_company ASC, p.created_at ASC
       LIMIT 1;
      IF v_id IS NOT NULL THEN NEW.partner_id := v_id; RETURN NEW; END IF;
    END IF;
  END IF;

  -- Ingen träff. NULL är ett ärligt svar; backfillen kan hämta raden senare.
  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.documents_resolve_partner() IS
  'BEFORE INSERT/UPDATE-trigger: fyller partner_id från lead_id, company_id, '
  'vendor_id eller en BEFINTLIG part med samma e-post. Skapar aldrig en part '
  'och skriver aldrig över en som skrivaren satt.';

-- ── Triggarna ───────────────────────────────────────────────────────────────
-- Ett par per tabell: e-postkolumnens namn skickas som triggerargument,
-- eftersom den heter olika i varje del av systemet (customer_email,
-- counterparty_email, contact_email) — själva dialektsplittringen som gjorde
-- ryggraden nödvändig, här hanterad på ett ställe i stället för sjutton.
DO $$
DECLARE
  spec  text[];
  specs text[][] := ARRAY[
    ARRAY['quotes',              'customer_email'],
    ARRAY['invoices',            'customer_email'],
    ARRAY['orders',              'customer_email'],
    ARRAY['subscriptions',       'customer_email'],
    ARRAY['contracts',           'counterparty_email'],
    ARRAY['tickets',             'contact_email'],
    ARRAY['bookings',            'customer_email'],
    ARRAY['service_orders',      'customer_email'],
    ARRAY['deals',               NULL],
    ARRAY['projects',            NULL],
    ARRAY['purchase_orders',     NULL],
    ARRAY['vendor_invoices',     NULL],
    ARRAY['vendor_credit_memos', NULL],
    ARRAY['return_to_vendor',    NULL],
    ARRAY['rfq_bids',            NULL],
    ARRAY['vendor_products',     NULL],
    ARRAY['inventory_receipts',  NULL]
  ];
  i int;
BEGIN
  FOR i IN 1 .. array_length(specs, 1) LOOP
    IF to_regclass('public.' || specs[i][1]) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I',
                   specs[i][1] || '_resolve_partner', specs[i][1]);
    IF specs[i][2] IS NULL THEN
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON public.%I
           FOR EACH ROW EXECUTE FUNCTION public.documents_resolve_partner()',
        specs[i][1] || '_resolve_partner', specs[i][1]);
    ELSE
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON public.%I
           FOR EACH ROW EXECUTE FUNCTION public.documents_resolve_partner(%L)',
        specs[i][1] || '_resolve_partner', specs[i][1], specs[i][2]);
    END IF;
  END LOOP;
END $$;

-- ── Kortköpet: den enda platsen som SKAPAR en part ur en främling ───────────
-- Gästen som betalar med kort har ingen lead, inget bolag och ingen tidigare
-- relation. Odoos regel är att den FÖRSTA riktiga adressen blir en egen
-- rotpart — aldrig ett barn under en platshållare — och att ordern pekas om på
-- den i samma transaktion.
--
-- Triggern ovan skapar aldrig; den här gör det, och bara här, och bara för
-- orders och subscriptions. En bokning med felstavad adress ska inte föda en
-- kund; ett betalt köp ska.
CREATE OR REPLACE FUNCTION public.commerce_ensure_partner()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email text := lower(trim(coalesce(NEW.customer_email, '')));
  v_id    uuid;
BEGIN
  IF NEW.partner_id IS NOT NULL OR v_email = '' THEN
    RETURN NEW;
  END IF;

  -- Samma lås som find_or_create_partner_by_email och ensure_lead_partner.
  -- Stripe skickar customer.subscription.created och
  -- checkout.session.completed utan garanterad ordning; utan ett DELAT lås
  -- hinner båda läsa "finns inte" och kortkunden får två parter.
  PERFORM pg_advisory_xact_lock(hashtext('partner_by_email:' || v_email));

  SELECT p.id INTO v_id FROM partners p
   WHERE lower(p.email) = v_email AND p.active
   ORDER BY p.is_company ASC, p.created_at ASC
   LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO partners (name, is_company, type, email, customer_rank)
    VALUES (coalesce(nullif(trim(NEW.customer_name), ''), v_email),
            false, 'contact', v_email, 1)
    RETURNING id INTO v_id;
  ELSE
    UPDATE partners SET customer_rank = greatest(customer_rank, 1)
     WHERE id = v_id AND customer_rank = 0;
  END IF;

  NEW.partner_id := v_id;
  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.commerce_ensure_partner() IS
  'Kortköpets part. Kör EFTER documents_resolve_partner och skapar en rotpart '
  'ur customer_email när ingen annan väg gav en. Endast orders och '
  'subscriptions — ett betalt köp föder en kund, ett formulär gör det inte.';

-- Namnet avgör ordningen: Postgres kör triggrar i bokstavsordning per
-- händelse, och zz_ garanterar att upplösningen har fått försöka först.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['orders', 'subscriptions'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'zz_' || t || '_ensure_partner', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.commerce_ensure_partner()',
      'zz_' || t || '_ensure_partner', t);
  END LOOP;
END $$;
