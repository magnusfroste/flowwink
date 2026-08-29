-- Kundryggraden, steg 6: granskningen av mitt eget arbete.
--
-- En motståndsgranskning av steg 1–5 hittade fjorton saker. Fyra av dem är
-- allvarliga och två av dem gör precis det som hela ryggraden finns för att
-- förhindra. Alla reproducerade mot en riktig databas innan de rättas här.

-- ═══ FYND 1 (HÖG): samma person blev två parter ═════════════════════════════
-- ensure_lead_partner var idempotent på source_lead_id — men BARA på den. En
-- gäst som köpt via Stripe har redan en part på sin adress; konverteras leadet
-- sedan föds en ANDRA part med samma e-post. Två kundreskontror, två
-- kreditgränser, två DSO-tal för en människa.
--
-- Reproducerat: find_or_create('kollision@test.se') följt av
-- ensure_lead_partner(leadet med samma adress) gav två rader.
--
-- Omvänd ordning fungerade, så felet såg intermittent ut — vilket är värre än
-- att det alltid inträffar.
--
-- backfill_vendor_partners hade redan rätt regel för leverantörer ("en
-- leverantör vars e-post redan tillhör en part ÄR den parten"). Människor fick
-- ingen sådan regel. Nu gör de det, och LÅSET är gemensamt: två skrivare som
-- tar olika lås skyddar ingenting.
CREATE OR REPLACE FUNCTION public.ensure_lead_partner(
  p_lead_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lead        leads%ROWTYPE;
  v_name        text;
  v_email       text;
  v_parent_id   uuid;
  v_partner_id  uuid;
  v_created     boolean := false;
  v_reused      boolean := false;
  v_parent_made boolean := false;
BEGIN
  -- 'leads' är CRM-modulens id. 'crm' är dess KATEGORI och finns inte i
  -- rollmatrisen — varje can_access_module(..., 'crm') var därför död kod som
  -- läste som "ingen åtkomst". Samma klass som spökrollistan i rollsvep 3.
  IF NOT (auth.role() = 'service_role'
          OR can_access_module(auth.uid(), 'leads')
          OR can_access_module(auth.uid(), 'companies')) THEN
    RAISE EXCEPTION 'Forbidden: creating a partner from a lead requires the leads or companies module (Users → Role Permissions)';
  END IF;

  SELECT * INTO v_lead FROM leads WHERE id = p_lead_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead % not found', p_lead_id;
  END IF;

  IF v_lead.partner_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'partner_id', v_lead.partner_id, 'created', false,
      'note', 'the lead already has a partner');
  END IF;

  v_email := lower(trim(coalesce(v_lead.email, '')));
  v_name  := coalesce(nullif(trim(v_lead.name), ''), nullif(v_email, ''));
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Lead % has neither a name nor an email — a partner without an identity would be duplicated on the next call', p_lead_id;
  END IF;

  -- Samma lås som find_or_create_partner_by_email. Delat, inte parallellt.
  IF v_email <> '' THEN
    PERFORM pg_advisory_xact_lock(hashtext('partner_by_email:' || v_email));
  END IF;

  SELECT id INTO v_partner_id FROM partners WHERE source_lead_id = p_lead_id;

  -- Adressen först: finns parten redan är det DEN parten.
  IF v_partner_id IS NULL AND v_email <> '' THEN
    SELECT id INTO v_partner_id FROM partners
    WHERE lower(email) = v_email
    ORDER BY is_company ASC, created_at ASC
    LIMIT 1;
    IF v_partner_id IS NOT NULL THEN
      v_reused := true;
      UPDATE partners
         SET source_lead_id = coalesce(source_lead_id, p_lead_id),
             customer_rank  = CASE WHEN v_lead.status = 'customer' OR v_lead.converted_at IS NOT NULL
                                   THEN greatest(customer_rank, 1) ELSE customer_rank END
       WHERE id = v_partner_id;
    END IF;
  END IF;

  IF v_partner_id IS NULL THEN
    IF v_lead.company_id IS NOT NULL THEN
      SELECT id INTO v_parent_id FROM partners WHERE source_company_id = v_lead.company_id;
      IF v_parent_id IS NULL THEN
        INSERT INTO partners (name, is_company, type, phone, street, country_code,
                              vat, company_registry, source_company_id)
        SELECT c.name, true, 'contact', c.phone, c.address, c.country,
               c.vat_number, c.org_number, c.id
        FROM companies c WHERE c.id = v_lead.company_id
        RETURNING id INTO v_parent_id;
        v_parent_made := v_parent_id IS NOT NULL;
      END IF;
    END IF;

    INSERT INTO partners (name, is_company, type, email, phone, parent_id,
                          customer_rank, source_lead_id)
    VALUES (v_name, false, 'contact', nullif(v_email, ''), v_lead.phone, v_parent_id,
            CASE WHEN v_lead.status = 'customer' OR v_lead.converted_at IS NOT NULL THEN 1 ELSE 0 END,
            p_lead_id)
    RETURNING id INTO v_partner_id;
    v_created := true;
  END IF;

  UPDATE leads SET partner_id = v_partner_id, updated_at = now() WHERE id = p_lead_id;

  RETURN jsonb_build_object(
    'partner_id', v_partner_id,
    'created', v_created,
    'reused_existing_party_on_email', v_reused,
    'parent_partner_id', v_parent_id,
    'parent_created', v_parent_made,
    'name', v_name);
END $$;

-- ═══ FYND 2 (HÖG): 'crm' finns inte i rollmatrisen ══════════════════════════
-- Modulens id är 'leads'. Policyerna och guarden i
-- find_or_create_partner_by_email namngav en modul som ingen kan tilldelas, så
-- felmeddelandet pekade på en ratt som inte finns i Users → Role Permissions.
-- Att det inte märktes beror på att rollen sales råkar ha 'companies'.
--
-- 'tickets' läggs till: support-rollen ser tickets.partner_id men hade ingen
-- läsrätt på parten bakom den — en dinglande uuid i gränssnittet.
DROP POLICY IF EXISTS "Partners readable by companies- or crm-module roles" ON public.partners;
DROP POLICY IF EXISTS "Partners readable by party-owning module roles" ON public.partners;
CREATE POLICY "Partners readable by party-owning module roles" ON public.partners
  FOR SELECT TO authenticated
  USING (can_access_module(auth.uid(), 'companies')
      OR can_access_module(auth.uid(), 'leads')
      OR can_access_module(auth.uid(), 'purchasing')
      OR can_access_module(auth.uid(), 'tickets'));

DROP POLICY IF EXISTS "Partners insertable by companies- or crm-module roles" ON public.partners;
DROP POLICY IF EXISTS "Partners insertable by party-owning module roles" ON public.partners;
CREATE POLICY "Partners insertable by party-owning module roles" ON public.partners
  FOR INSERT TO authenticated
  WITH CHECK (can_access_module(auth.uid(), 'companies')
           OR can_access_module(auth.uid(), 'leads')
           OR can_access_module(auth.uid(), 'purchasing'));

DROP POLICY IF EXISTS "Partners writable by companies- or crm-module roles" ON public.partners;
DROP POLICY IF EXISTS "Partners writable by party-owning module roles" ON public.partners;
CREATE POLICY "Partners writable by party-owning module roles" ON public.partners
  FOR UPDATE TO authenticated
  USING (can_access_module(auth.uid(), 'companies')
      OR can_access_module(auth.uid(), 'leads')
      OR can_access_module(auth.uid(), 'purchasing'))
  WITH CHECK (can_access_module(auth.uid(), 'companies')
           OR can_access_module(auth.uid(), 'leads')
           OR can_access_module(auth.uid(), 'purchasing'));

CREATE OR REPLACE FUNCTION public.find_or_create_partner_by_email(
  p_email       text,
  p_name        text DEFAULT NULL,
  p_company_id  uuid DEFAULT NULL,
  p_as_customer boolean DEFAULT true
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email  text := lower(trim(coalesce(p_email, '')));
  v_id     uuid;
  v_parent uuid;
BEGIN
  IF NOT (auth.role() = 'service_role'
          OR can_access_module(auth.uid(), 'leads')
          OR can_access_module(auth.uid(), 'companies')) THEN
    RAISE EXCEPTION 'Forbidden: creating a partner requires the leads or companies module (Users → Role Permissions)';
  END IF;

  IF v_email = '' THEN RETURN NULL; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('partner_by_email:' || v_email));

  -- Personen före bolaget. Kommentaren här sa tidigare motsatsen till vad koden
  -- gör: med ORDER BY is_company ASC vinner ALLTID personen. Det är avsiktligt
  -- — en adress som bärs av både ett bolag och en kontaktperson tillhör
  -- kontaktpersonen i praktiken — men motiveringen ska stämma med koden.
  SELECT id INTO v_id FROM partners
  WHERE lower(email) = v_email
  ORDER BY is_company ASC, created_at ASC
  LIMIT 1;

  IF v_id IS NULL THEN
    IF p_company_id IS NOT NULL THEN
      SELECT id INTO v_parent FROM partners WHERE source_company_id = p_company_id;
    END IF;
    INSERT INTO partners (name, is_company, type, email, parent_id, customer_rank)
    VALUES (coalesce(nullif(trim(p_name), ''), v_email), false, 'contact', v_email, v_parent,
            CASE WHEN p_as_customer THEN 1 ELSE 0 END)
    RETURNING id INTO v_id;
  ELSIF p_as_customer THEN
    UPDATE partners SET customer_rank = greatest(customer_rank, 1)
    WHERE id = v_id AND customer_rank = 0;
  END IF;

  RETURN v_id;
END $$;

-- ═══ FYND 4 (MEDEL): commercial_partner_id gick att skriva fritt ════════════
-- Triggern lyssnade bara på UPDATE OF parent_id, is_company. En rak UPDATE av
-- kolumnen själv gick igenom, som vanlig sales-användare, och kunde peka
-- huvudbokens grupperingsnyckel var som helst — inklusive på sig själv. Varje
-- UI eller agent som skickar tillbaka en hel partsrad via PostgREST hade skrivit
-- den. Det är exakt den splittrade reskontra kolumnen finns för att förhindra.
--
-- Nu räknas den om vid VARJE update och ett medskickat värde ignoreras. Den är
-- härledd; att den låg i samma tabell gjorde den inte redigerbar.
DROP TRIGGER IF EXISTS partners_commercial_before ON public.partners;
CREATE TRIGGER partners_commercial_before
  BEFORE INSERT OR UPDATE ON public.partners
  FOR EACH ROW EXECUTE FUNCTION public.partners_set_commercial();

-- ═══ FYND 6 (MEDEL): kaskaden kunde snurra i evighet på en cykel ════════════
-- Cykelvakten tar inget lås, så två motsatta omflyttningar kan passera
-- samtidigt och lämna en cykel i parent_id. Kaskadens UNION ALL saknade
-- cykeldetektering och en senare uppdatering på en rad i cykeln hade aldrig
-- terminerat. Vakten låser nu roten, och kaskaden bär sin egen väg.
CREATE OR REPLACE FUNCTION public.partners_reject_cycle()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_cursor uuid; v_depth int := 0;
BEGIN
  IF NEW.parent_id IS NULL THEN RETURN NEW; END IF;
  -- Serialisera omflyttningar. Två samtidiga UPDATE som pekar på varandra
  -- passerade båda sina kontroller och skapade en cykel ingen sedan kunde röra.
  PERFORM pg_advisory_xact_lock(hashtext('partner_hierarchy'));
  v_cursor := NEW.parent_id;
  WHILE v_cursor IS NOT NULL LOOP
    IF v_cursor = NEW.id THEN
      RAISE EXCEPTION 'Partner % cannot be its own ancestor', NEW.id;
    END IF;
    v_depth := v_depth + 1;
    IF v_depth > 64 THEN
      RAISE EXCEPTION 'Partner hierarchy deeper than 64 levels — refusing to walk further';
    END IF;
    SELECT parent_id INTO v_cursor FROM public.partners WHERE id = v_cursor;
  END LOOP;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.partners_cascade_commercial()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  WITH RECURSIVE subtree AS (
    SELECT id, commercial_partner_id, ARRAY[id] AS path FROM public.partners WHERE id = NEW.id
    UNION ALL
    SELECT c.id,
           CASE WHEN c.is_company THEN c.id ELSE s.commercial_partner_id END,
           s.path || c.id
    FROM public.partners c JOIN subtree s ON c.parent_id = s.id
    -- Bär vägen och vägra gå tillbaka. En cykel ska ge fel data i en rapport,
    -- aldrig en fråga som aldrig återvänder.
    WHERE NOT c.id = ANY(s.path) AND array_length(s.path, 1) < 64
  )
  UPDATE public.partners p
     SET commercial_partner_id = s.commercial_partner_id
    FROM subtree s
   WHERE p.id = s.id AND p.id <> NEW.id
     AND p.commercial_partner_id IS DISTINCT FROM s.commercial_partner_id;
  RETURN NULL;
END $$;

-- ═══ FYND 5 (MEDEL): "arkivera, aldrig radera" var en kommentar ═════════════
-- ON DELETE SET NULL på sjutton dokumenttabeller: en raderad part lämnade
-- fakturor med partner_id NULL och ingen möjlighet att skilja "aldrig länkad"
-- från "länkad, parten borta". Nu blir regeln verklig.
CREATE OR REPLACE FUNCTION public.partners_refuse_delete_with_history()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE t text; v_n int; v_found text[] := '{}';
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'quotes','invoices','orders','subscriptions','contracts','tickets','projects',
    'bookings','service_orders','deals','purchase_orders','vendor_invoices',
    'vendor_credit_memos','return_to_vendor','rfq_bids','vendor_products',
    'inventory_receipts','leads'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('SELECT count(*) FROM public.%I WHERE partner_id = $1', t)
      INTO v_n USING OLD.id;
    IF v_n > 0 THEN v_found := v_found || format('%s (%s)', t, v_n); END IF;
  END LOOP;

  IF array_length(v_found, 1) > 0 THEN
    RAISE EXCEPTION 'Partner % still carries history in % — archive it instead (set active = false); deleting would leave those documents without a customer',
      OLD.name, array_to_string(v_found, ', ');
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS partners_no_delete_with_history ON public.partners;
CREATE TRIGGER partners_no_delete_with_history
  BEFORE DELETE ON public.partners
  FOR EACH ROW EXECUTE FUNCTION public.partners_refuse_delete_with_history();

-- ═══ FYND 8 (MEDEL): anon hade kvar EXECUTE och SELECT ══════════════════════
-- Supabase ger anon EXECUTE på varje ny funktion som standard, och REVOKE FROM
-- PUBLIC tar inte bort det. Systerfilen i samma serie revokade anon uttryckligen
-- — utelämnandet var inkonsekvent, inte avsiktligt. Inget var exploaterbart
-- (guarden vägrar), men det är det lager som överlever nästa policymisstag.
REVOKE ALL ON public.partners FROM anon;
REVOKE ALL ON public.v_contacts, public.v_customers, public.v_vendors FROM anon;
REVOKE ALL ON FUNCTION public.backfill_partners(boolean) FROM anon;
REVOKE ALL ON FUNCTION public.backfill_document_partners(boolean, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.backfill_vendor_partners(boolean) FROM anon;
REVOKE ALL ON FUNCTION public.backfill_purchase_partners(boolean) FROM anon;
REVOKE ALL ON FUNCTION public.ensure_lead_partner(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.find_or_create_partner_by_email(text, text, uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.ensure_lead_partner(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.find_or_create_partner_by_email(text, text, uuid, boolean) TO authenticated, service_role;

-- ═══ FYND 12 (LÅG): linserna släppte igenom rader de inte visar ═════════════
CREATE OR REPLACE VIEW public.v_contacts
WITH (security_invoker = true) AS
  SELECT * FROM public.partners WHERE active WITH CASCADED CHECK OPTION;

CREATE OR REPLACE VIEW public.v_customers
WITH (security_invoker = true) AS
  SELECT * FROM public.partners WHERE active AND customer_rank > 0 WITH CASCADED CHECK OPTION;

CREATE OR REPLACE VIEW public.v_vendors
WITH (security_invoker = true) AS
  SELECT * FROM public.partners WHERE active AND supplier_rank > 0 WITH CASCADED CHECK OPTION;

-- ═══ FYND 3 och 10: rapporten måste visa OENIGHET, inte bara räckvidd ═══════
-- En faktura vars lead_id och company_id pekar på olika parter länkades tyst av
-- den svagare, och rapporten sa "klart". Och resolvable_by_reference
-- dubbelräknade just de raderna — ett tal uppfunnet för att stoppa en
-- felläsning blev självt oläsbart.
--
-- Nu räknas varje dokument EN gång, och de motstridiga redovisas för sig. En
-- siffra i 'conflicting_references' är inget fel i backfillen; det är ett
-- omdöme som hör hemma hos en människa.
CREATE OR REPLACE FUNCTION public.backfill_document_partners(
  p_dry_run        boolean DEFAULT true,
  p_match_by_email boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_report    jsonb := '{}'::jsonb;
  v_by_fk     int; v_by_email int;
  v_can_fk    int; v_can_email int; v_conflict int;
  v_pred      text;
  v_left      int;
  r           record;
  v_specs     text[][] := ARRAY[
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
    v_by_fk := 0; v_by_email := 0; v_can_fk := 0; v_can_email := 0; v_conflict := 0;

    -- Ett dokument räknas EN gång, oavsett hur många dialekter som når det.
    --
    -- Predikatet byggs som TEXT, inte gatas med true/false: Postgres parsar
    -- hela satsen innan den utvärderar den, så ett `false AND d.lead_id ...`
    -- kraschar ändå på tabeller utan kolumnen. Regressionskedjan fångade det
    -- inom en minut efter att jag skrev det (2026-08-31).
    v_pred := array_to_string(ARRAY[]::text[], '');
    v_pred := '';
    IF r.has_lead THEN
      v_pred := 'EXISTS (SELECT 1 FROM public.leads l WHERE l.id = d.lead_id AND l.partner_id IS NOT NULL)';
    END IF;
    IF r.has_company THEN
      v_pred := CASE WHEN v_pred = '' THEN '' ELSE v_pred || ' OR ' END
             || 'EXISTS (SELECT 1 FROM public.partners p WHERE p.source_company_id = d.company_id)';
    END IF;
    IF v_pred <> '' THEN
      EXECUTE format('SELECT count(*) FROM public.%I d WHERE d.partner_id IS NULL AND (%s)',
                     r.tbl, v_pred) INTO v_can_fk;
    END IF;

    -- Oenighet: leadets part och bolagets part är olika. Den som vinner i dag
    -- är leadet; att det är RÄTT är ett antagande och ska synas som ett tal.
    IF r.has_lead AND r.has_company THEN
      EXECUTE format($q$
        SELECT count(*) FROM public.%I d
        JOIN public.leads l ON l.id = d.lead_id AND l.partner_id IS NOT NULL
        JOIN public.partners p ON p.source_company_id = d.company_id
        WHERE d.partner_id IS NULL AND l.partner_id <> p.id$q$, r.tbl) INTO v_conflict;
    END IF;

    IF p_match_by_email AND r.mail IS NOT NULL THEN
      EXECUTE format($q$
        SELECT count(*) FROM public.%I d
        WHERE d.partner_id IS NULL AND d.%I IS NOT NULL AND trim(d.%I) <> ''
          AND EXISTS (SELECT 1 FROM public.partners p WHERE lower(p.email) = lower(trim(d.%I)))$q$,
        r.tbl, r.mail, r.mail, r.mail) INTO v_can_email;
    END IF;

    IF NOT p_dry_run THEN
      IF r.has_lead THEN
        EXECUTE format($q$
          UPDATE public.%I d SET partner_id = l.partner_id FROM public.leads l
          WHERE d.lead_id = l.id AND l.partner_id IS NOT NULL AND d.partner_id IS NULL$q$, r.tbl);
        GET DIAGNOSTICS v_by_fk = ROW_COUNT;
      END IF;
      IF r.has_company THEN
        EXECUTE format($q$
          UPDATE public.%I d SET partner_id = p.id FROM public.partners p
          WHERE p.source_company_id = d.company_id AND d.partner_id IS NULL$q$, r.tbl);
        GET DIAGNOSTICS v_left = ROW_COUNT;
        v_by_fk := v_by_fk + v_left;
      END IF;
      IF p_match_by_email AND r.mail IS NOT NULL THEN
        -- Deterministiskt val vid delad adress: personen först, sedan äldst —
        -- samma regel som find_or_create_partner_by_email. Utan ordningen valde
        -- de två skrivarna olika part för samma kund.
        EXECUTE format($q$
          UPDATE public.%I d SET partner_id = (
            SELECT p.id FROM public.partners p
            WHERE lower(p.email) = lower(trim(d.%I))
            ORDER BY p.is_company ASC, p.created_at ASC LIMIT 1)
          WHERE d.partner_id IS NULL AND d.%I IS NOT NULL AND trim(d.%I) <> ''
            AND EXISTS (SELECT 1 FROM public.partners q WHERE lower(q.email) = lower(trim(d.%I)))$q$,
          r.tbl, r.mail, r.mail, r.mail, r.mail);
        GET DIAGNOSTICS v_by_email = ROW_COUNT;
      END IF;
    END IF;

    EXECUTE format('SELECT count(*) FROM public.%I WHERE partner_id IS NULL', r.tbl) INTO v_left;
    v_report := v_report || jsonb_build_object(r.tbl, jsonb_build_object(
      'resolvable_by_reference', v_can_fk,
      'resolvable_by_email', v_can_email,
      'conflicting_references', v_conflict,
      'linked_by_reference', v_by_fk,
      'linked_by_email', v_by_email,
      'still_without_partner', v_left));
  END LOOP;

  RETURN jsonb_build_object(
    'dry_run', p_dry_run,
    'matched_by_email', p_match_by_email,
    'tables', v_report);
END $$;

REVOKE ALL ON FUNCTION public.backfill_document_partners(boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.backfill_document_partners(boolean, boolean) TO authenticated, service_role;

-- ═══ FYND 3b: en part som bytt arbetsgivare hängde kvar ═════════════════════
-- backfill_partners räknade bara koncernlänkar mellan BOLAG. Ändras
-- leads.company_id flyttas personens part aldrig, och rapporten sa noll kvar.
-- Nu räknas och rättas även person→bolag.
CREATE OR REPLACE FUNCTION public.reparent_lead_partners(
  p_dry_run boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pending int; v_moved int := 0;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden: reparenting partners requires the admin role';
  END IF;

  SELECT count(*) INTO v_pending
  FROM leads l
  JOIN partners p ON p.id = l.partner_id AND NOT p.is_company
  JOIN partners cp ON cp.source_company_id = l.company_id
  WHERE l.company_id IS NOT NULL AND p.parent_id IS DISTINCT FROM cp.id;

  IF NOT p_dry_run THEN
    WITH upd AS (
      UPDATE partners p SET parent_id = cp.id
      FROM leads l JOIN partners cp ON cp.source_company_id = l.company_id
      WHERE p.id = l.partner_id AND NOT p.is_company
        AND l.company_id IS NOT NULL AND p.parent_id IS DISTINCT FROM cp.id
      RETURNING 1
    ) SELECT count(*) INTO v_moved FROM upd;
  END IF;

  RETURN jsonb_build_object('dry_run', p_dry_run, 'pending', v_pending, 'moved', v_moved);
END $$;

REVOKE ALL ON FUNCTION public.reparent_lead_partners(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reparent_lead_partners(boolean) TO authenticated, service_role;

COMMENT ON FUNCTION public.reparent_lead_partners(boolean) IS
  'Flyttar personparter vars lead bytt bolag. Byter en anställd arbetsgivare '
  'ska fakturan bokas på den NYA juridiska personen — commercial_partner_id '
  'räknas om av triggern när parent_id ändras.';

-- ═══ FYND 14 (LÅG): nattkörningen drog e-postgissning över hela instansen ═══
-- sandbox_seed_subscriptions anropade backfill_document_partners(false) med
-- e-postmatchning påslagen som default — alltså en global slutsatsdragning på
-- varje demo- och sandboxinstans varje natt. Kedjan ska bevisa sin egen
-- kedja, inte massrätta instansen.
CREATE OR REPLACE FUNCTION public.sandbox_seed_subscriptions()
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
                             current_period_start, current_period_end, next_invoice_date)
  VALUES ('kedja.webb@sandbox.local', 'Kedjegästen', 'active', 49900,
          'month', 1, 1, 'stripe', CURRENT_DATE, CURRENT_DATE + 30, CURRENT_DATE)
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

REVOKE EXECUTE ON FUNCTION public.sandbox_seed_subscriptions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sandbox_seed_subscriptions() TO authenticated, service_role;

-- ═══ Sammanslagning av parter som redan hunnit delas ════════════════════════
-- Fynd 1 kan redan ha inträffat på en instans. Den här slår ihop dubbletter på
-- e-post: dokumenten pekas om till den vinnande parten och förloraren
-- ARKIVERAS, aldrig raderas — samma regel som triggern ovan upprätthåller.
-- Odoos merge introspekterar varje främmande nyckel i stället för att
-- underhålla en lista; det gör den här också.
CREATE OR REPLACE FUNCTION public.merge_duplicate_partners(
  p_dry_run boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_groups int; v_merged int := 0; v_moved int := 0;
  g record; k record; v_n int;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden: merging partners requires the admin role';
  END IF;

  SELECT count(*) INTO v_groups FROM (
    SELECT lower(email) FROM partners
    WHERE email IS NOT NULL AND trim(email) <> '' AND active
    GROUP BY lower(email) HAVING count(*) > 1) x;

  IF NOT p_dry_run THEN
    FOR g IN
      SELECT lower(email) AS mail,
             (array_agg(id ORDER BY is_company ASC, created_at ASC))[1] AS keep,
             array_agg(id) FILTER (WHERE true) AS all_ids
      FROM partners
      WHERE email IS NOT NULL AND trim(email) <> '' AND active
      GROUP BY lower(email) HAVING count(*) > 1
    LOOP
      -- Varje FK som pekar på partners, hämtad ur katalogen — inte ur en lista
      -- någon måste komma ihåg att uppdatera.
      FOR k IN
        SELECT c.conrelid::regclass AS tbl, a.attname AS col
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
        WHERE c.contype = 'f' AND c.confrelid = 'public.partners'::regclass
          AND array_length(c.conkey, 1) = 1
          AND c.conrelid <> 'public.partners'::regclass
      LOOP
        EXECUTE format('UPDATE %s SET %I = $1 WHERE %I = ANY($2) AND %I <> $1',
                       k.tbl, k.col, k.col, k.col)
          USING g.keep, g.all_ids;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        v_moved := v_moved + v_n;
      END LOOP;

      UPDATE partners SET active = false
       WHERE id = ANY(g.all_ids) AND id <> g.keep;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_merged := v_merged + v_n;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'dry_run', p_dry_run,
    'duplicate_email_groups', v_groups,
    'parties_archived', v_merged,
    'references_moved', v_moved,
    'note', 'Losers are archived, never deleted. Re-run after fixing an email to catch newly matching pairs.');
END $$;

REVOKE ALL ON FUNCTION public.merge_duplicate_partners(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_duplicate_partners(boolean) TO authenticated, service_role;

COMMENT ON FUNCTION public.merge_duplicate_partners(boolean) IS
  'Slår ihop parter som delar e-post. Vinnaren är personen före bolaget, sedan '
  'äldst. Varje främmande nyckel mot partners hämtas ur katalogen, så en ny '
  'tabell fångas automatiskt. Förloraren arkiveras, aldrig raderas.';
