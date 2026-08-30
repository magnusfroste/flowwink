-- Kundryggraden, steg 4: dokumentkedjan får en part.
--
-- Målet är EN arkitektur för två köpresor:
--   Optic:   lead → offert → avtal → abonnemang → faktura → ärende
--   Webshop: Stripe-checkout → abonnemang → faktura
-- I dag identifieras kunden olika i varje led — och i Stripe-grenen bara med en
-- e-poststräng. Samma part ska bära båda kedjorna.
--
-- Det här steget lägger BARA till kolumnen och fyller den. Inget beteende
-- ändras: ingen skrivare börjar sätta den här, ingen läsare börjar kräva den.
-- Att koppla in skrivarna är ett eget steg, för då ändras faktiskt hur systemet
-- beter sig och det ska inte gömmas i en kolumnmigration.
--
-- Kartläggningen bakom urvalet: 151 skrivställen, varav 80 där en part redan
-- går att härleda, 38 där bara en e-poststräng finns och 33 som inte handlar om
-- kunder alls (kanalhandtag, demoseeder, personalens chattrådar). De 33 rörs
-- inte. subscription_winback_sends.customer_email har noll skrivare — en död
-- kolumn, och den får INTE en partner_id bara för symmetrins skull.

-- ── Kolumnen på dokumentkedjan ──────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'quotes', 'invoices', 'orders', 'subscriptions', 'contracts',
    'tickets', 'projects', 'bookings', 'service_orders', 'deals'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL', t);
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (partner_id) WHERE partner_id IS NOT NULL',
      t || '_partner_idx', t);
    EXECUTE format(
      'COMMENT ON COLUMN public.%I.partner_id IS %L', t,
      'Parten dokumentet gäller (Odoo partner_id). Nullbar under övergången: '
      'de gamla identitetsfälten är fortfarande sanningen tills skrivarna kopplats om.');
  END LOOP;
END $$;

-- ── Arbetshästen för e-postgrenen ───────────────────────────────────────────
-- 38 skrivställen har bara en e-poststräng: gästutcheckning, publika formulär,
-- Stripe-webhooken. Odoos svar på anonym utcheckning är att den FÖRSTA riktiga
-- adressen blir en egen rotpart — aldrig ett barn under en platshållare — och
-- att ordern pekas om på den i samma transaktion. Vi gör detsamma.
--
-- Den skapar aldrig en identitetslös part: utan e-post finns ingen nyckel att
-- känna igen den på nästa gång, och då blir det en ny part varje köp.
CREATE OR REPLACE FUNCTION public.find_or_create_partner_by_email(
  p_email       text,
  p_name        text DEFAULT NULL,
  p_company_id  uuid DEFAULT NULL,
  p_as_customer boolean DEFAULT true
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email   text := lower(trim(coalesce(p_email, '')));
  v_id      uuid;
  v_parent  uuid;
BEGIN
  IF NOT (auth.role() = 'service_role'
          OR can_access_module(auth.uid(), 'crm')
          OR can_access_module(auth.uid(), 'companies')) THEN
    RAISE EXCEPTION 'Forbidden: creating a partner requires the crm or companies module (Users → Role Permissions)';
  END IF;

  IF v_email = '' THEN
    RETURN NULL;  -- ingen nyckel, ingen part. Se kommentaren ovan.
  END IF;

  -- Serialisera på adressen. Stripe skickar customer.subscription.created och
  -- checkout.session.completed utan garanterad ordning och de kan landa
  -- samtidigt — utan lås hinner båda läsa "finns inte" och kortkunden får två
  -- parter. En UNIK e-post vore fel modell: hos Odoo delar ett bolag och dess
  -- kontaktperson ofta adress, och den friheten vill vi behålla. Låset gäller
  -- transaktionen och släpps automatiskt.
  PERFORM pg_advisory_xact_lock(hashtext('partner_by_email:' || v_email));

  -- Finns den redan? Personen före bolaget: en faktura till info@bolaget.se
  -- ska hitta bolaget, men en till anna@bolaget.se ska hitta Anna.
  SELECT id INTO v_id FROM partners
  WHERE lower(email) = v_email
  ORDER BY is_company ASC, created_at ASC
  LIMIT 1;

  IF v_id IS NULL THEN
    IF p_company_id IS NOT NULL THEN
      SELECT id INTO v_parent FROM partners WHERE source_company_id = p_company_id;
    END IF;
    INSERT INTO partners (name, is_company, type, email, parent_id, customer_rank)
    VALUES (
      coalesce(nullif(trim(p_name), ''), v_email), false, 'contact', v_email, v_parent,
      CASE WHEN p_as_customer THEN 1 ELSE 0 END
    )
    RETURNING id INTO v_id;
  ELSIF p_as_customer THEN
    -- Odoo räknar upp customer_rank vid varje försäljning. Vi nöjer oss med att
    -- markera att parten ÄR kund; själva räkningen har inget värde för oss än.
    UPDATE partners SET customer_rank = greatest(customer_rank, 1)
    WHERE id = v_id AND customer_rank = 0;
  END IF;

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.find_or_create_partner_by_email(text, text, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_or_create_partner_by_email(text, text, uuid, boolean) TO authenticated, service_role;

COMMENT ON FUNCTION public.find_or_create_partner_by_email(text, text, uuid, boolean) IS
  'Hittar eller skapar parten bakom en e-postadress. Roten skapas fristående '
  'när inget bolag är känt — aldrig under en platshållare. Returnerar NULL för '
  'tom e-post i stället för att skapa en identitetslös part.';

-- ── Backfillen ──────────────────────────────────────────────────────────────
-- Varje tabell länkas från sin STARKASTE dialekt, i tur och ordning:
--   1. lead_id      → leads.partner_id        (någon har pekat ut personen)
--   2. company_id   → partners.source_company_id (någon har pekat ut bolaget)
--   3. e-post       → exakt match på partners.email
--
-- De två första är fakta någon registrerat. Den tredje är en SLUTSATS, och
-- redovisas därför som ett eget tal — inte hopblandat med de andra. Den går
-- att stänga av med p_match_by_email => false om siffran ser fel ut.
--
-- projects saknar allt utom client_name (fritext) och kommer att stå kvar på
-- noll. Det är inte ett fel i backfillen; det är vad kedjan faktiskt bär.
CREATE OR REPLACE FUNCTION public.backfill_document_partners(
  p_dry_run        boolean DEFAULT true,
  p_match_by_email boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_report   jsonb := '{}'::jsonb;
  v_by_fk    int;
  v_by_email int;
  v_can_fk   int;
  v_can_email int;
  v_left     int;
  r          record;
  -- tabell, e-postkolumn (NULL = ingen), har lead_id, har company_id
  v_specs    text[][] := ARRAY[
    ARRAY['quotes',         'customer_email',     'y', 'y'],
    ARRAY['invoices',       'customer_email',     'y', 'y'],
    ARRAY['orders',         'customer_email',     'n', 'y'],
    ARRAY['subscriptions',  'customer_email',     'n', 'n'],
    ARRAY['contracts',      'counterparty_email', 'n', 'y'],
    ARRAY['tickets',        'contact_email',      'y', 'y'],
    ARRAY['bookings',       'customer_email',     'n', 'n'],
    ARRAY['service_orders', 'customer_email',     'n', 'n'],
    ARRAY['deals',          NULL,                 'y', 'n'],
    ARRAY['projects',       NULL,                 'n', 'n']
  ];
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden: backfilling document partners requires the admin role';
  END IF;

  FOR r IN SELECT v_specs[i][1] AS tbl, v_specs[i][2] AS mail,
                  v_specs[i][3] = 'y' AS has_lead, v_specs[i][4] = 'y' AS has_company
           FROM generate_subscripts(v_specs, 1) AS i
  LOOP
    IF to_regclass('public.' || r.tbl) IS NULL THEN CONTINUE; END IF;
    v_by_fk := 0; v_by_email := 0; v_can_fk := 0; v_can_email := 0;

    -- Räkna vad som GÅR att länka innan något skrivs. Utan det här visar en
    -- torrkörning noll överallt, och den som läser "linked_by_email: 0" drar
    -- den rimliga slutsatsen att e-postmatchningen inte hittade något. Ett tal
    -- som betyder "vi räknade inte" får inte se ut som ett tal som betyder noll.
    IF r.has_lead THEN
      EXECUTE format($q$
        SELECT count(*) FROM public.%I d JOIN public.leads l ON d.lead_id = l.id
        WHERE l.partner_id IS NOT NULL AND d.partner_id IS NULL$q$, r.tbl) INTO v_left;
      v_can_fk := v_can_fk + v_left;
    END IF;
    IF r.has_company THEN
      EXECUTE format($q$
        SELECT count(*) FROM public.%I d JOIN public.partners p ON p.source_company_id = d.company_id
        WHERE d.partner_id IS NULL$q$, r.tbl) INTO v_left;
      v_can_fk := v_can_fk + v_left;
    END IF;
    IF p_match_by_email AND r.mail IS NOT NULL THEN
      EXECUTE format($q$
        SELECT count(*) FROM public.%I d JOIN public.partners p ON lower(p.email) = lower(trim(d.%I))
        WHERE d.%I IS NOT NULL AND trim(d.%I) <> '' AND d.partner_id IS NULL$q$,
        r.tbl, r.mail, r.mail, r.mail) INTO v_can_email;
    END IF;

    IF NOT p_dry_run THEN
      IF r.has_lead THEN
        EXECUTE format($q$
          UPDATE public.%I d SET partner_id = l.partner_id
          FROM public.leads l
          WHERE d.lead_id = l.id AND l.partner_id IS NOT NULL AND d.partner_id IS NULL$q$, r.tbl);
        GET DIAGNOSTICS v_by_fk = ROW_COUNT;
      END IF;

      IF r.has_company THEN
        EXECUTE format($q$
          UPDATE public.%I d SET partner_id = p.id
          FROM public.partners p
          WHERE p.source_company_id = d.company_id AND d.partner_id IS NULL$q$, r.tbl);
        GET DIAGNOSTICS v_left = ROW_COUNT;
        v_by_fk := v_by_fk + v_left;
      END IF;

      IF p_match_by_email AND r.mail IS NOT NULL THEN
        EXECUTE format($q$
          UPDATE public.%I d SET partner_id = p.id
          FROM public.partners p
          WHERE lower(p.email) = lower(trim(d.%I))
            AND d.%I IS NOT NULL AND trim(d.%I) <> '' AND d.partner_id IS NULL$q$,
          r.tbl, r.mail, r.mail, r.mail);
        GET DIAGNOSTICS v_by_email = ROW_COUNT;
      END IF;
    END IF;

    EXECUTE format('SELECT count(*) FROM public.%I WHERE partner_id IS NULL', r.tbl) INTO v_left;
    v_report := v_report || jsonb_build_object(r.tbl, jsonb_build_object(
      'resolvable_by_reference', v_can_fk,
      'resolvable_by_email', v_can_email,
      'linked_by_reference', v_by_fk,
      'linked_by_email', v_by_email,
      'still_without_partner', v_left
    ));
  END LOOP;

  RETURN jsonb_build_object(
    'dry_run', p_dry_run,
    'matched_by_email', p_match_by_email,
    'tables', v_report
  );
END $$;

REVOKE ALL ON FUNCTION public.backfill_document_partners(boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.backfill_document_partners(boolean, boolean) TO authenticated, service_role;

COMMENT ON FUNCTION public.backfill_document_partners(boolean, boolean) IS
  'Länkar dokumentkedjan till partsregistret från starkaste dialekt: lead_id, '
  'sedan company_id, sist exakt e-postmatch. E-postmatchen redovisas separat '
  'eftersom den är en slutsats och inte ett registrerat faktum.';
