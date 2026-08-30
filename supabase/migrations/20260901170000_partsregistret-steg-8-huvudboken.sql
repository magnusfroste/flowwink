-- Kundryggraden, steg 8: huvudboken bokförs på den kommersiella parten.
--
-- Det här är hela poängen med commercial_partner_id, och det som gör
-- skillnaden mellan ett kundregister och en reskontra.
--
-- Odoos regel, ordagrant ur account_move.py: dokumentet adresseras till
-- kontaktpersonen, men vid bokföring skrivs VARJE verifikationsrads partner om
-- till move.commercial_partner_id. Kommentaren i deras kod motiverar det med
-- att adressaten är "the only one the user can see/edit" — alltså: låt
-- människan välja mottagare, låt maskinen bestämma vem skulden tillhör.
--
-- Utan den omskrivningen ackumulerar varje kontaktperson ett EGET fordringssaldo.
-- Fem personer på samma bolag ger fem reskontror, fem kreditgränser och fem
-- DSO-tal, och frågan "vad är Redeye skyldiga oss?" har inget svar. Det är
-- inte en rapportbugg utan en modellbugg, och den går inte att laga i efterhand
-- utan att gå tillbaka till varje rad.
--
-- Två saker den här filen INTE gör:
--   * Den grenar aldrig på land. Vilka konton som ÄR fordringar är en egenskap
--     hos kontot (partner_ledger_role), inte ett kontonummer i en if-sats.
--     Samma princip som momsrutkartan: rutan bor på kontot.
--   * Den gissar aldrig en part. En verifikation utan spårbar motpart får NULL,
--     och reskontran redovisar hur många sådana det finns i stället för att
--     låtsas att summan är fullständig.

-- ── Verifikationen: adressat och bokförd part ───────────────────────────────
ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS partner_id            uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS commercial_partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.journal_entries.partner_id IS
  'Motparten som dokumentet adresserades till — kan vara en kontaktperson.';
COMMENT ON COLUMN public.journal_entries.commercial_partner_id IS
  'Den juridiska person verifikationen BOKFÖRS på. Härledd; sätts av triggern '
  'och ignorerar medskickade värden. Reskontra, kreditgräns och DSO läser DEN.';

CREATE INDEX IF NOT EXISTS journal_entries_partner_idx
  ON public.journal_entries (partner_id) WHERE partner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS journal_entries_commercial_idx
  ON public.journal_entries (commercial_partner_id) WHERE commercial_partner_id IS NOT NULL;

ALTER TABLE public.journal_entry_lines
  ADD COLUMN IF NOT EXISTS partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.journal_entry_lines.partner_id IS
  'Alltid verifikationens KOMMERSIELLA part, aldrig adressaten. Odoo tvingar '
  'samma sak i account.move._post(). Det är den här kolumnen reskontran summerar.';

CREATE INDEX IF NOT EXISTS journal_entry_lines_partner_idx
  ON public.journal_entry_lines (partner_id) WHERE partner_id IS NOT NULL;

ALTER TABLE public.accounting_corrections
  ADD COLUMN IF NOT EXISTS partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL;

-- ── Upplösningen ────────────────────────────────────────────────────────────
-- journal_entries bär redan båda vägarna: invoice_id åt kundhållet, vendor_id
-- åt leverantörshållet. Ingen ny koppling behöver uppfinnas.
CREATE OR REPLACE FUNCTION public.journal_resolve_partner()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  -- 1. Adressaten, om den inte redan är satt av skrivaren.
  IF NEW.partner_id IS NULL THEN
    IF NEW.invoice_id IS NOT NULL THEN
      SELECT i.partner_id INTO v_id FROM invoices i WHERE i.id = NEW.invoice_id;
      NEW.partner_id := v_id;
    END IF;
    IF NEW.partner_id IS NULL AND NEW.vendor_id IS NOT NULL THEN
      SELECT p.id INTO v_id FROM partners p WHERE p.source_vendor_id = NEW.vendor_id;
      NEW.partner_id := v_id;
    END IF;
  END IF;

  -- 2. Den bokförda parten är ALLTID härledd. Ett medskickat värde ignoreras —
  --    huvudbokens grupperingsnyckel är inte ett fält någon får peka om.
  IF NEW.partner_id IS NULL THEN
    NEW.commercial_partner_id := NULL;
  ELSE
    SELECT p.commercial_partner_id INTO NEW.commercial_partner_id
    FROM partners p WHERE p.id = NEW.partner_id;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS journal_entries_resolve_partner ON public.journal_entries;
CREATE TRIGGER journal_entries_resolve_partner
  BEFORE INSERT OR UPDATE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.journal_resolve_partner();

-- ── Tvånget på raderna ──────────────────────────────────────────────────────
-- Odoo skriver om raderna vid bokföring. Vi gör det vid skrivning, vilket är
-- samma sak en transaktion tidigare och slipper frågan "vad hände med raderna
-- som skrevs innan posteringen".
CREATE OR REPLACE FUNCTION public.journal_line_force_commercial_partner()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  SELECT je.commercial_partner_id INTO NEW.partner_id
  FROM journal_entries je WHERE je.id = NEW.journal_entry_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS journal_entry_lines_force_partner ON public.journal_entry_lines;
CREATE TRIGGER journal_entry_lines_force_partner
  BEFORE INSERT OR UPDATE ON public.journal_entry_lines
  FOR EACH ROW EXECUTE FUNCTION public.journal_line_force_commercial_partner();

-- Ändras verifikationens part måste raderna följa med. En reskontra som bygger
-- på rader vars part är äldre än verifikationens är tyst fel.
CREATE OR REPLACE FUNCTION public.journal_cascade_partner_to_lines()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.commercial_partner_id IS DISTINCT FROM OLD.commercial_partner_id THEN
    UPDATE journal_entry_lines SET partner_id = NEW.commercial_partner_id
     WHERE journal_entry_id = NEW.id
       AND partner_id IS DISTINCT FROM NEW.commercial_partner_id;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS journal_entries_cascade_partner ON public.journal_entries;
CREATE TRIGGER journal_entries_cascade_partner
  AFTER UPDATE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.journal_cascade_partner_to_lines();

-- ── Kontots roll i reskontran — en egenskap, inte ett kontonummer ───────────
-- Odoo har account_type = asset_receivable / liability_payable. Vår kontoplan
-- har asset/liability plus en svensk kategoritext, och att grena på "Kortfristiga
-- fordringar" vore att bygga in Sverige i motorn. Rollen blir därför en kolumn
-- som en locale-pack eller en operatör sätter — precis som momsrutan.
ALTER TABLE public.chart_of_accounts
  ADD COLUMN IF NOT EXISTS partner_ledger_role text;

DO $$
BEGIN
  ALTER TABLE public.chart_of_accounts DROP CONSTRAINT IF EXISTS chart_of_accounts_ledger_role_check;
  ALTER TABLE public.chart_of_accounts ADD CONSTRAINT chart_of_accounts_ledger_role_check
    CHECK (partner_ledger_role IS NULL OR partner_ledger_role IN ('receivable', 'payable'));
END $$;

COMMENT ON COLUMN public.chart_of_accounts.partner_ledger_role IS
  'Kontots roll i partsreskontran: receivable, payable eller NULL. Sätts av '
  'kontoplanen eller en operatör — motorn känner inga kontonummer.';

CREATE OR REPLACE FUNCTION public.set_account_ledger_role(
  p_account_code text,
  p_role         text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n int;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'accounting')) THEN
    RAISE EXCEPTION 'Forbidden: setting an account''s ledger role requires the accounting module';
  END IF;
  IF p_role IS NOT NULL AND p_role NOT IN ('receivable', 'payable') THEN
    RAISE EXCEPTION 'Unknown ledger role % — use receivable, payable or null', p_role;
  END IF;

  UPDATE chart_of_accounts SET partner_ledger_role = p_role, updated_at = now()
   WHERE account_code = p_account_code;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'No account with code % in this chart', p_account_code;
  END IF;
  RETURN jsonb_build_object('account_code', p_account_code, 'role', p_role, 'rows', v_n);
END $$;

REVOKE ALL ON FUNCTION public.set_account_ledger_role(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_account_ledger_role(text, text) TO authenticated, service_role;

-- ── Reskontran ──────────────────────────────────────────────────────────────
-- Två vyer. Den första är landneutral och alltid sann: part × konto × saldo.
-- Den andra är den man vill ha, och den KAN bara svara om någon har talat om
-- vilka konton som är fordringar — så den säger det i stället för att tyst
-- returnera noll rader. (Ett tomt index som beter sig som "inga träffar" är
-- den dyraste lögnen vi haft.)
CREATE OR REPLACE VIEW public.v_partner_ledger
WITH (security_invoker = true) AS
  SELECT
    jel.partner_id,
    p.name                              AS partner_name,
    jel.account_code,
    coa.partner_ledger_role,
    sum(jel.debit_cents)                AS debit_cents,
    sum(jel.credit_cents)               AS credit_cents,
    sum(jel.debit_cents - jel.credit_cents) AS balance_cents,
    count(*)                            AS line_count,
    max(je.entry_date)                  AS last_entry_date
  FROM public.journal_entry_lines jel
  JOIN public.journal_entries je ON je.id = jel.journal_entry_id
  JOIN public.partners p ON p.id = jel.partner_id
  LEFT JOIN public.chart_of_accounts coa ON coa.account_code = jel.account_code
  WHERE jel.partner_id IS NOT NULL
  GROUP BY jel.partner_id, p.name, jel.account_code, coa.partner_ledger_role;

COMMENT ON VIEW public.v_partner_ledger IS
  'Part × konto × saldo, grupperat på den KOMMERSIELLA parten. Landneutral: '
  'inga kontonummer, ingen kontoklassificering krävs.';

CREATE OR REPLACE FUNCTION public.partner_open_items(
  p_role text DEFAULT 'receivable'
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_marked int;
  v_rows   jsonb;
  v_orphan int;
BEGIN
  SELECT count(*) INTO v_marked FROM chart_of_accounts WHERE partner_ledger_role = p_role;

  -- Verifikationsrader utan part: reskontran är per definition ofullständig,
  -- och det talet ska stå bredvid summan — inte utelämnas.
  SELECT count(*) INTO v_orphan FROM journal_entry_lines WHERE partner_id IS NULL;

  IF v_marked = 0 THEN
    RETURN jsonb_build_object(
      'role', p_role,
      'accounts_marked', 0,
      'items', '[]'::jsonb,
      'note', format(
        'No account is marked as %s in this chart, so the ledger cannot be computed. '
        'Mark them with set_account_ledger_role(<code>, %L) — an empty answer here means '
        'unconfigured, not zero.', p_role, p_role));
  END IF;

  SELECT coalesce(jsonb_agg(x ORDER BY x->>'partner_name'), '[]'::jsonb) INTO v_rows FROM (
    SELECT jsonb_build_object(
      'partner_id', l.partner_id,
      'partner_name', l.partner_name,
      'balance_cents', sum(l.balance_cents),
      'last_entry_date', max(l.last_entry_date)) AS x
    FROM v_partner_ledger l
    WHERE l.partner_ledger_role = p_role
    GROUP BY l.partner_id, l.partner_name
    HAVING sum(l.balance_cents) <> 0
  ) s;

  RETURN jsonb_build_object(
    'role', p_role,
    'accounts_marked', v_marked,
    'lines_without_a_party', v_orphan,
    'items', v_rows);
END $$;

REVOKE ALL ON FUNCTION public.partner_open_items(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.partner_open_items(text) TO authenticated, service_role;

COMMENT ON FUNCTION public.partner_open_items(text) IS
  'Öppna poster per kommersiell part. Rapporterar hur många konton som är '
  'markerade och hur många verifikationsrader som saknar part — en summa utan '
  'de talen går inte att lita på.';

-- ── Backfill av befintlig huvudbok ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.backfill_journal_partners(
  p_dry_run boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_can_invoice int; v_can_vendor int; v_entries int := 0; v_lines int := 0;
  v_left_entries int; v_left_lines int;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden: backfilling the ledger requires the admin role';
  END IF;

  SELECT count(*) INTO v_can_invoice FROM journal_entries je
   JOIN invoices i ON i.id = je.invoice_id
   WHERE je.partner_id IS NULL AND i.partner_id IS NOT NULL;

  SELECT count(*) INTO v_can_vendor FROM journal_entries je
   JOIN partners p ON p.source_vendor_id = je.vendor_id
   WHERE je.partner_id IS NULL AND je.vendor_id IS NOT NULL;

  IF NOT p_dry_run THEN
    -- Triggern gör jobbet; en tom UPDATE räcker för att väcka den, och då kan
    -- upplösningsregeln aldrig glida isär mellan backfill och skrivväg.
    WITH upd AS (
      UPDATE journal_entries je SET updated_at = updated_at
      WHERE je.partner_id IS NULL
        AND (EXISTS (SELECT 1 FROM invoices i WHERE i.id = je.invoice_id AND i.partner_id IS NOT NULL)
          OR EXISTS (SELECT 1 FROM partners p WHERE p.source_vendor_id = je.vendor_id))
      RETURNING 1
    ) SELECT count(*) INTO v_entries FROM upd;

    WITH upd AS (
      UPDATE journal_entry_lines jel SET partner_id = je.commercial_partner_id
      FROM journal_entries je
      WHERE je.id = jel.journal_entry_id
        AND jel.partner_id IS DISTINCT FROM je.commercial_partner_id
      RETURNING 1
    ) SELECT count(*) INTO v_lines FROM upd;
  END IF;

  SELECT count(*) INTO v_left_entries FROM journal_entries WHERE partner_id IS NULL;
  SELECT count(*) INTO v_left_lines   FROM journal_entry_lines WHERE partner_id IS NULL;

  RETURN jsonb_build_object(
    'dry_run', p_dry_run,
    'resolvable_via_invoice', v_can_invoice,
    'resolvable_via_vendor', v_can_vendor,
    'entries_updated', v_entries,
    'lines_updated', v_lines,
    'entries_still_without_party', v_left_entries,
    'lines_still_without_party', v_left_lines,
    'note', 'Entries with neither an invoice nor a vendor have no traceable counterparty. That is a fact about the data, not a failure of the backfill.');
END $$;

REVOKE ALL ON FUNCTION public.backfill_journal_partners(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.backfill_journal_partners(boolean) TO authenticated, service_role;

-- ── Invarianten görs permanent i regressionskedjan ─────────────────────────
-- Ett engångstest bevisar att koden fungerade en gång. Kedjan bevisar att den
-- fortfarande gör det. Den här biten är hela skälet till att ryggraden byggdes:
-- två personer på samma bolag ska ge EN reskontrapost, inte två.
CREATE OR REPLACE FUNCTION public.assert_ledger_rolls_up_to_company()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_co uuid; v_l1 uuid; v_l2 uuid; v_p1 uuid; v_p2 uuid;
  v_e1 uuid; v_e2 uuid; v_parties int; v_total bigint;
BEGIN
  INSERT INTO companies (name, org_number) VALUES ('Kedjereskontra AB','556000-8888')
  RETURNING id INTO v_co;
  INSERT INTO leads (name,email,company_id,status)
  VALUES ('Kedja Ett','kedja.ett@sandbox.local',v_co,'customer') RETURNING id INTO v_l1;
  INSERT INTO leads (name,email,company_id,status)
  VALUES ('Kedja Två','kedja.tva@sandbox.local',v_co,'customer') RETURNING id INTO v_l2;
  v_p1 := (ensure_lead_partner(v_l1)->>'partner_id')::uuid;
  v_p2 := (ensure_lead_partner(v_l2)->>'partner_id')::uuid;
  IF v_p1 = v_p2 THEN
    RAISE EXCEPTION 'ledger check: two different people collapsed into one party';
  END IF;

  INSERT INTO invoices (invoice_number,lead_id,customer_email,status,total_cents)
  VALUES ('KED-1',v_l1,'kedja.ett@sandbox.local','sent',100000) RETURNING id INTO v_e1;
  INSERT INTO invoices (invoice_number,lead_id,customer_email,status,total_cents)
  VALUES ('KED-2',v_l2,'kedja.tva@sandbox.local','sent',250000) RETURNING id INTO v_e2;

  INSERT INTO journal_entries (entry_date,description,invoice_id,status)
  VALUES (CURRENT_DATE,'Kedja 1',v_e1,'posted') RETURNING id INTO v_e1;
  INSERT INTO journal_entries (entry_date,description,invoice_id,status)
  VALUES (CURRENT_DATE,'Kedja 2',v_e2,'posted') RETURNING id INTO v_e2;
  INSERT INTO journal_entry_lines (journal_entry_id,account_code,account_name,debit_cents,credit_cents)
  VALUES (v_e1,'1510','Kundfordringar',100000,0), (v_e2,'1510','Kundfordringar',250000,0);

  SELECT count(DISTINCT jel.partner_id), sum(jel.debit_cents - jel.credit_cents)
    INTO v_parties, v_total
  FROM journal_entry_lines jel WHERE jel.journal_entry_id IN (v_e1, v_e2);

  IF v_parties <> 1 THEN
    RAISE EXCEPTION 'ledger check: two invoices to two people at ONE company produced % receivable parties — every contact would carry its own balance', v_parties;
  END IF;
  IF v_total <> 350000 THEN
    RAISE EXCEPTION 'ledger check: the company balance is % instead of 350000', v_total;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM journal_entry_lines jel
    JOIN partners p ON p.id = jel.partner_id
    WHERE jel.journal_entry_id = v_e1 AND p.is_company) THEN
    RAISE EXCEPTION 'ledger check: the line books on a person, not on the legal entity';
  END IF;

  DELETE FROM journal_entry_lines WHERE journal_entry_id IN (v_e1, v_e2);
  DELETE FROM journal_entries WHERE id IN (v_e1, v_e2);
  DELETE FROM invoices WHERE invoice_number IN ('KED-1','KED-2');
  DELETE FROM leads WHERE id IN (v_l1, v_l2);
  DELETE FROM partners WHERE id IN (v_p1, v_p2);
  DELETE FROM partners WHERE source_company_id = v_co;
  DELETE FROM companies WHERE id = v_co;
END $$;

REVOKE ALL ON FUNCTION public.assert_ledger_rolls_up_to_company() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_ledger_rolls_up_to_company() TO authenticated, service_role;

-- Kedjan kör den. Ett påstående ingen kör är ingen grind.
--
-- Kroppen dupliceras INTE hit: den döps om till _core och wrappas. Att kopiera
-- en CREATE OR REPLACE-kropp från en tidigare migration är att återställa den
-- tidigare versionen — den läxan kostade testbäddsskyddet en gång redan.
DO $rename$
BEGIN
  IF to_regprocedure('public.sandbox_seed_subscriptions_body()') IS NULL
     AND to_regprocedure('public.sandbox_seed_subscriptions()') IS NOT NULL THEN
    ALTER FUNCTION public.sandbox_seed_subscriptions() RENAME TO sandbox_seed_subscriptions_body;
  END IF;
END $rename$;

CREATE OR REPLACE FUNCTION public.sandbox_seed_subscriptions()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $outer$
DECLARE v jsonb;
BEGIN
  v := public.sandbox_seed_subscriptions_core();
  PERFORM public.assert_ledger_rolls_up_to_company();
  RETURN v || jsonb_build_object('ledger_rolls_up_to_the_company', true);
END $outer$;

REVOKE ALL ON FUNCTION public.sandbox_seed_subscriptions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sandbox_seed_subscriptions() TO authenticated, service_role;
-- _core får sina rättigheter där den definieras, längre ned. Att revoka en
-- funktion som ännu inte finns avbryter hela filen under ON_ERROR_STOP.
REVOKE ALL ON FUNCTION public.sandbox_seed_subscriptions_body() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sandbox_seed_subscriptions_body() TO authenticated, service_role;

-- ── Kedjan måste kunna köra på en TESTBÄDD ─────────────────────────────────
-- nordbrygg är varken sandbox eller demo: den är en testbädd, alltså en instans
-- där historiken AVSIKTLIGT ackumulerar över natten. Det är den mest värdefulla
-- platsen att köra kedjan på — en transaktion som rullas tillbaka bevisar att
-- koden fungerar en gång, medan en instans som behåller sina rader bevisar att
-- den fungerar mot data som vuxit i veckor.
--
-- Kedjan städar sina egna markörer vid varje körning och påståendet om
-- huvudboken städar efter sig, så den lämnar inget kvar som stör historiken.
CREATE OR REPLACE FUNCTION public.sandbox_seed_subscriptions_core()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $core$
DECLARE v jsonb; v_prev jsonb;
BEGIN
  -- Sätt sandbox_mode tillfälligt om vi står på en testbädd, så den befintliga
  -- kroppens vakt släpper igenom utan att kroppen behöver dupliceras hit.
  IF public.is_testbed()
     AND NOT coalesce((SELECT (value #>> '{}')::boolean FROM site_settings WHERE key='sandbox_mode'), false) THEN
    SELECT value INTO v_prev FROM site_settings WHERE key='sandbox_mode';
    INSERT INTO site_settings (key, value) VALUES ('sandbox_mode','true'::jsonb)
      ON CONFLICT (key) DO UPDATE SET value='true'::jsonb;
    BEGIN
      v := public.sandbox_seed_subscriptions_body();
    EXCEPTION WHEN others THEN
      IF v_prev IS NULL THEN DELETE FROM site_settings WHERE key='sandbox_mode';
      ELSE UPDATE site_settings SET value=v_prev WHERE key='sandbox_mode'; END IF;
      RAISE;
    END;
    IF v_prev IS NULL THEN DELETE FROM site_settings WHERE key='sandbox_mode';
    ELSE UPDATE site_settings SET value=v_prev WHERE key='sandbox_mode'; END IF;
    RETURN v || jsonb_build_object('ran_on', 'testbed');
  END IF;

  RETURN public.sandbox_seed_subscriptions_body();
END $core$;

REVOKE ALL ON FUNCTION public.sandbox_seed_subscriptions_core() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sandbox_seed_subscriptions_core() TO authenticated, service_role;
