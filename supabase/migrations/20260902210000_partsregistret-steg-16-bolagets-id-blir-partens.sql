-- Kundryggraden, steg 16: bolagets id blir partens.
--
-- Det här är den enda ändringen i hela serien där TAJMINGEN spelar roll.
--
-- `companies` och `partners` bär i dag samma sanning på två ställen, med
-- source_company_id som brygga. Hos Odoo finns bara den ena — ett kundbolag ÄR
-- en res.partner med is_company = true. Att gå dit betyder till slut att
-- flytta tretton främmande nycklar och 582 kodreferenser.
--
-- Men nästan inget av det blir dyrare av att vänta. En sak gör det:
--
--     att ge varje bolagspart SAMMA id som sin companies-rad.
--
-- Med 1–3 bolag per instans är det sekunder. Med tre tusen är det en helg av
-- FK-jonglering med verklig risk att referenser hamnar fel. Och när id:na är
-- identiska pekar varje befintligt company_id redan på en giltig partners.id
-- — då blir resten en METADATAÄNDRING (drop constraint, add constraint) i
-- stället för en datamigrering, och ingen av de 582 raderna behöver röras.
--
-- Den här filen gör bara låsningen. Den flyttar inga nycklar och tar inte bort
-- companies. Den ser till att fönstret inte hinner stängas.

-- ── Nya bolag föds med sin part, med samma id ──────────────────────────────
CREATE OR REPLACE FUNCTION public.companies_get_a_party()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO partners (
    id, name, is_company, type, phone, street, country_code,
    vat, company_registry, credit_limit_cents, customer_rank, source_company_id
  ) VALUES (
    NEW.id, NEW.name, true, 'contact', NEW.phone, NEW.address, NEW.country,
    NEW.vat_number, NEW.org_number, NEW.credit_limit_cents,
    CASE WHEN NEW.customer_since IS NOT NULL THEN 1 ELSE 0 END, NEW.id
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NULL;
END $$;

COMMENT ON FUNCTION public.companies_get_a_party() IS
  'Varje nytt bolag föds med en part som bär SAMMA id. Det är låsningen som '
  'gör att company_id senare kan peka på partners utan datamigrering.';

DROP TRIGGER IF EXISTS companies_party_mirror ON public.companies;
CREATE TRIGGER companies_party_mirror
  AFTER INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.companies_get_a_party();

-- ── Befintliga parter riktas in ────────────────────────────────────────────
-- Katalogdriven, som sammanslagningen: varje främmande nyckel mot partners
-- hämtas ur pg_constraint i stället för ur en lista någon måste komma ihåg att
-- uppdatera. Den listan är precis vad som glöms bort när en ny tabell tillkommer.
CREATE OR REPLACE FUNCTION public.align_company_party_ids(
  p_dry_run boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pending int; v_aligned int := 0; v_moved int := 0; v_blocked jsonb := '[]'::jsonb;
  r record; k record; v_n int; v_set text; v_where text;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden: aligning party ids requires the admin role';
  END IF;

  SELECT count(*) INTO v_pending
  FROM partners p WHERE p.source_company_id IS NOT NULL AND p.id <> p.source_company_id;

  -- Ett bolags-id som REDAN är upptaget av en annan part går inte att ta.
  -- Rapporteras hellre än forceras: att flytta någon annans identitet för att
  -- få plats är värre än att lämna en rad oinriktad.
  SELECT coalesce(jsonb_agg(jsonb_build_object('party', p.name, 'company_id', p.source_company_id)), '[]'::jsonb)
    INTO v_blocked
  FROM partners p
  WHERE p.source_company_id IS NOT NULL AND p.id <> p.source_company_id
    AND EXISTS (SELECT 1 FROM partners q WHERE q.id = p.source_company_id);

  IF NOT p_dry_run THEN
    FOR r IN
      SELECT p.id AS old_id, p.source_company_id AS new_id, p.name
        FROM partners p
       WHERE p.source_company_id IS NOT NULL AND p.id <> p.source_company_id
         AND NOT EXISTS (SELECT 1 FROM partners q WHERE q.id = p.source_company_id)
    LOOP
      -- 1. Kopian med rätt id. source_company_id lämnas tom tills originalet är
      --    borta — det unika indexet tål inte två rader med samma ursprung.
      INSERT INTO partners (
        id, name, is_company, parent_id, type, email, phone, street, street2,
        city, postal_code, country_code, vat, company_registry,
        customer_rank, supplier_rank, active, payment_terms, currency, notes,
        website, credit_limit_cents, lang, tz, title_id, fiscal_position_id,
        source_lead_id, source_vendor_id, created_at)
      SELECT r.new_id, name, is_company, parent_id, type, email, phone, street, street2,
             city, postal_code, country_code, vat, company_registry,
             customer_rank, supplier_rank, active, payment_terms, currency, notes,
             website, credit_limit_cents, lang, tz, title_id, fiscal_position_id,
             source_lead_id, source_vendor_id, created_at
        FROM partners WHERE id = r.old_id;

      -- 2. Varje främmande nyckel mot partners, hämtad ur katalogen — men
      --    grupperad PER TABELL, inte per nyckel. En faktura bär tre
      --    partskolumner (kund, fakturaadress, leveransadress) och steg 10:s
      --    vakt vägrar en rad vars fakturaadress hör till en annan kund än
      --    dokumentet. Att flytta dem en i taget bryter den invarianten mitt i
      --    satsen. Vakten fångade det här första gången den här funktionen kördes.
      FOR k IN
        SELECT c.conrelid::regclass::text AS tbl, array_agg(a.attname) AS cols
          FROM pg_constraint c
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
         WHERE c.contype = 'f' AND c.confrelid = 'public.partners'::regclass
           AND array_length(c.conkey, 1) = 1
         GROUP BY 1
      LOOP
        SELECT string_agg(format('%I = CASE WHEN %I = $2 THEN $1 ELSE %I END', col, col, col), ', '),
               string_agg(format('%I = $2', col), ' OR ')
          INTO v_set, v_where
          FROM unnest(k.cols) AS col;

        EXECUTE format('UPDATE %s SET %s WHERE %s', k.tbl, v_set, v_where)
          USING r.new_id, r.old_id;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        v_moved := v_moved + v_n;
      END LOOP;

      -- 3. Originalet bort, och ursprunget flyttas till kopian.
      DELETE FROM partners WHERE id = r.old_id;
      UPDATE partners SET source_company_id = r.new_id WHERE id = r.new_id;
      v_aligned := v_aligned + 1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'dry_run', p_dry_run,
    'pending', v_pending,
    'aligned', v_aligned,
    'references_moved', v_moved,
    'blocked_by_an_existing_party', v_blocked,
    'note', 'Once every company party carries its company''s id, company_id already points '
         || 'at a valid partners.id — moving the 13 foreign keys later becomes a metadata '
         || 'change instead of a data migration, and none of the 582 code references '
         || 'have to be touched for it to hold.');
END $$;

REVOKE ALL ON FUNCTION public.align_company_party_ids(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.align_company_party_ids(boolean) TO authenticated, service_role;

COMMENT ON FUNCTION public.align_company_party_ids(boolean) IS
  'Ger befintliga bolagsparter samma id som sin companies-rad. Katalogdriven: '
  'varje främmande nyckel mot partners hämtas ur pg_constraint, så en ny '
  'tabell fångas automatiskt.';

-- ── Invarianten in i kedjan ────────────────────────────────────────────────
-- Låsningen är värdelös om nästa bolag föds oinriktat. Påståendet bevakar
-- triggern, inte backfillen.
CREATE OR REPLACE FUNCTION public.assert_company_and_party_share_an_id()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_co uuid; v_drift int;
BEGIN
  INSERT INTO companies (name, org_number) VALUES ('Idlåsningen AB', '556000-1616')
  RETURNING id INTO v_co;

  IF NOT EXISTS (SELECT 1 FROM partners WHERE id = v_co AND is_company) THEN
    RAISE EXCEPTION 'id check: a new company did not get a party with the same id — the window that only closes once is closing';
  END IF;

  SELECT count(*) INTO v_drift FROM partners
   WHERE source_company_id IS NOT NULL AND id <> source_company_id;
  IF v_drift > 0 THEN
    RAISE EXCEPTION 'id check: % company part(y|ies) still carry an id other than their company''s — run align_company_party_ids(false)', v_drift;
  END IF;

  DELETE FROM partners WHERE id = v_co;
  DELETE FROM companies WHERE id = v_co;
END $$;

REVOKE ALL ON FUNCTION public.assert_company_and_party_share_an_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_company_and_party_share_an_id() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.sandbox_seed_subscriptions()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $outer$
DECLARE v jsonb;
BEGIN
  v := public.sandbox_seed_subscriptions_core();
  PERFORM public.assert_ledger_rolls_up_to_company();
  PERFORM public.assert_invoiced_customer_is_visible();
  PERFORM public.assert_no_silently_unbillable_subscriptions();
  PERFORM public.assert_commercial_fields_inherit();
  PERFORM public.assert_bank_account_rules();
  PERFORM public.assert_language_is_personal_not_commercial();
  PERFORM public.assert_own_company_is_a_party();
  PERFORM public.assert_company_and_party_share_an_id();
  RETURN v || jsonb_build_object(
    'ledger_rolls_up_to_the_company', true,
    'invoiced_customers_visible_in_the_lens', true,
    'no_silently_unbillable_subscriptions', true,
    'commercial_fields_inherit', true,
    'bank_accounts_belong_to_the_legal_entity', true,
    'language_is_personal_not_commercial', true,
    'our_own_company_is_a_party', true,
    'company_and_party_share_an_id', true);
END $outer$;

REVOKE ALL ON FUNCTION public.sandbox_seed_subscriptions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sandbox_seed_subscriptions() TO authenticated, service_role;

-- ── Och inriktningen körs, här och nu ──────────────────────────────────────
-- Utan det här anropet vore låsningen halv: nya bolag föds inriktade medan de
-- befintliga lämnas kvar med sina gamla id. Kedjans påstående vägrar just den
-- halvmesyren, vilket är hur den upptäcktes.
DO $$
DECLARE v jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  v := public.align_company_party_ids(false);
  RAISE NOTICE 'align_company_party_ids: % aligned, % references moved, % blocked',
    v ->> 'aligned', v ->> 'references_moved',
    jsonb_array_length(v -> 'blocked_by_an_existing_party');
END $$;
