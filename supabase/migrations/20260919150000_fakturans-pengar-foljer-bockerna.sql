-- Fakturans pengar följer böckerna.
--
-- Processbatteriet 2026-09-19 (quote-to-cash):
--
--   OMSKRIVNING  manage_invoice update skrev om en UTFÄRDAD, bokförd faktura:
--                1 250 000 öre blev 125, kundfordran i huvudboken stod kvar på
--                det gamla beloppet. En utfärdad faktura är ett verifikat.
--   HANDPENNING  book_invoice_paid bokade först när status blev 'paid'. Efter en
--                handpenning om 5 000 kr var bankraden i böckerna 0 tills sista
--                kronan kom in — pengarna fanns på kontot men inte i bokföringen.
--   MAKULERING   En makulerad utfärdad faktura lämnade sitt verifikat: fordran,
--                intäkt och utgående moms stod kvar (AR netto 250 000, väntat 0).
--   OVERLOAD     record_invoice_payment fanns med 4 OCH 5 argument. Ett anrop
--                utan den "valfria" referensen var tvetydigt för PostgREST och
--                föll — varje betalning utan referens.
--   TIDFAKTURA   bulk_invoice_from_timesheets hårdkodade 25 % moms (en begäran om
--                6 % gav 25 000 öre moms, väntat 6 000) och visste inte vem kunden
--                var: ingen e-post, ingen part — projects.partner_id lästes aldrig.
--
-- Idempotent: CREATE OR REPLACE, DROP … IF EXISTS.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. En utfärdad faktura är ett verifikat
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.issued_invoice_is_final()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF OLD.status::text = 'draft' THEN RETURN NEW; END IF;
  IF NEW.line_items     IS DISTINCT FROM OLD.line_items
  OR NEW.subtotal_cents IS DISTINCT FROM OLD.subtotal_cents
  OR NEW.tax_rate       IS DISTINCT FROM OLD.tax_rate
  OR NEW.tax_cents      IS DISTINCT FROM OLD.tax_cents
  OR NEW.total_cents    IS DISTINCT FROM OLD.total_cents
  OR NEW.currency       IS DISTINCT FROM OLD.currency
  OR NEW.invoice_number IS DISTINCT FROM OLD.invoice_number
  OR NEW.issue_date     IS DISTINCT FROM OLD.issue_date
  OR NEW.invoice_type   IS DISTINCT FROM OLD.invoice_type THEN
    RAISE EXCEPTION 'Invoice % is % — an issued invoice is a voucher: its lines, amounts, currency, number and date are final. Correct it with create_credit_note and a new invoice.',
      COALESCE(OLD.invoice_number, OLD.id::text), OLD.status USING ERRCODE = 'check_violation';
  END IF;
  -- Inte tillbaka till utkast: då vore den skrivbar igen med verifikatet kvar.
  IF NEW.status::text = 'draft' THEN
    RAISE EXCEPTION 'Invoice % is % — it cannot go back to draft.', COALESCE(OLD.invoice_number, OLD.id::text), OLD.status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS issued_invoice_is_final_trg ON public.invoices;
CREATE TRIGGER issued_invoice_is_final_trg
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.issued_invoice_is_final();

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Varje betalning når böckerna den dag den kommer
-- ═══════════════════════════════════════════════════════════════════════════
-- book_invoice_paid bokar nu SKILLNADEN mellan det som är betalt och det som
-- redan är bokfört som betalning på fakturan. En skrivare, anropad både per
-- betalning (record_invoice_payment) och av statustriggern — andra anropet
-- hittar inget kvar att boka. p_entry_date: betalningens dag, inte dagens.
DROP FUNCTION IF EXISTS public.book_invoice_paid(uuid, text, text);
CREATE OR REPLACE FUNCTION public.book_invoice_paid(p_invoice_id uuid, p_bank_account text DEFAULT NULL::text, p_ar_account text DEFAULT NULL::text, p_entry_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inv record;
  v_entry_id uuid;
  v_booked bigint;
  v_amount bigint;
BEGIN
  -- Att boka en fakturabetalning är en FÖLJD av att registrera den: den som får
  -- fakturera får också den bokningen (annars föll statusbytet för en säljare).
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'accounting') OR can_access_module(auth.uid(), 'invoicing')) THEN
    RAISE EXCEPTION 'Requires the accounting or invoicing module — an admin can grant it under Users → Role Permissions';
  END IF;

  p_bank_account := COALESCE(p_bank_account, public.account_for('bank'));
  p_ar_account := COALESCE(p_ar_account, public.account_for('accounts_receivable'));
  SELECT * INTO v_inv FROM invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
  END IF;
  IF v_inv.origin = 'pos_receipt' THEN
    RETURN jsonb_build_object('success', true, 'skipped', 'pos receipt — booked by the session close');
  END IF;
  IF v_inv.order_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM journal_entries j WHERE j.source = 'order_paid' AND j.reference_number = v_inv.order_id::text) THEN
    RETURN jsonb_build_object('success', true, 'skipped', 'order already booked at payment (order_paid) — nothing to settle');
  END IF;

  -- Redan bokfört som betalning på den här fakturan (kredit på kundfordran).
  SELECT COALESCE(sum(l.credit_cents - l.debit_cents), 0) INTO v_booked
    FROM journal_entries e JOIN journal_entry_lines l ON l.journal_entry_id = e.id
   WHERE e.invoice_id = p_invoice_id AND e.source = 'invoice_payment' AND e.status = 'posted'
     AND l.account_code = p_ar_account;

  v_amount := COALESCE(v_inv.paid_amount_cents, 0) - v_booked;
  -- En faktura född 'paid' utan registrerat belopp: hela totalen är betalningen.
  IF v_amount <= 0 AND v_inv.status::text = 'paid' AND COALESCE(v_inv.paid_amount_cents, 0) = 0 AND v_booked = 0 THEN
    v_amount := COALESCE(v_inv.total_cents, 0);
  END IF;
  IF v_amount <= 0 THEN
    IF v_booked > 0 THEN RETURN jsonb_build_object('success', true, 'skipped', 'already booked'); END IF;
    RETURN jsonb_build_object('success', false, 'error', 'Paid amount is zero');
  END IF;

  -- If issuance was never booked (e.g. legacy invoice), book it first so AR exists.
  PERFORM public.book_invoice_issued(p_invoice_id);

  INSERT INTO journal_entries (entry_date, description, source, invoice_id, status)
  VALUES (COALESCE(p_entry_date, v_inv.paid_at::date, CURRENT_DATE),
          'Invoice ' || COALESCE(v_inv.invoice_number, p_invoice_id::text)
            || CASE WHEN COALESCE(v_inv.paid_amount_cents, 0) < COALESCE(v_inv.total_cents, 0) THEN ' part payment' ELSE ' paid' END,
          'invoice_payment', p_invoice_id, 'posted')
  RETURNING id INTO v_entry_id;

  INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
  VALUES (v_entry_id, p_bank_account, v_amount, 0, 'Bank');
  INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
  VALUES (v_entry_id, p_ar_account, 0, v_amount, 'Settle accounts receivable');

  RETURN jsonb_build_object('success', true, 'invoice_id', p_invoice_id, 'journal_entry_id', v_entry_id, 'amount_cents', v_amount);
END;
$function$;

REVOKE ALL ON FUNCTION public.book_invoice_paid(uuid, text, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.book_invoice_paid(uuid, text, text, date) TO authenticated, service_role;

-- EN signatur: referensen är valfri PÅ RIKTIGT (DEFAULT NULL), så ett anrop utan
-- den inte står mellan två kandidater.
DROP FUNCTION IF EXISTS public.record_invoice_payment(uuid, bigint, text, timestamptz);
DROP FUNCTION IF EXISTS public.record_invoice_payment(uuid, bigint, text, timestamptz, text);
CREATE OR REPLACE FUNCTION public.record_invoice_payment(p_invoice_id uuid, p_amount_cents bigint, p_method text DEFAULT 'manual'::text, p_paid_at timestamptz DEFAULT now(), p_reference text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inv record; v_remaining bigint; v_new_paid bigint; v_fully boolean; v_new_status invoice_status; v_book jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'invoicing')) THEN RAISE EXCEPTION 'Not authorized to record payments'; END IF;
  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN RAISE EXCEPTION 'p_amount_cents must be positive'; END IF;
  SELECT id, total_cents, COALESCE(paid_amount_cents,0) AS paid_amount_cents, status, invoice_type, invoice_number INTO v_inv FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice % not found', p_invoice_id; END IF;
  IF v_inv.status::text IN ('cancelled', 'void') THEN RAISE EXCEPTION 'Cannot pay a % invoice', v_inv.status; END IF;
  IF v_inv.status::text = 'draft' THEN RAISE EXCEPTION 'Invoice % is a draft — issue it (status sent) before recording a payment', COALESCE(v_inv.invoice_number, p_invoice_id::text); END IF;
  IF COALESCE(v_inv.invoice_type,'invoice') <> 'invoice' THEN RAISE EXCEPTION 'Cannot pay a credit note'; END IF;

  -- Idempotency: a payment already recorded under this reference for this invoice is a no-op.
  IF p_reference IS NOT NULL AND EXISTS (
    SELECT 1 FROM audit_logs
     WHERE action = 'invoice.payment_recorded' AND entity_type = 'invoice' AND entity_id = p_invoice_id
       AND metadata->>'reference' = p_reference
  ) THEN
    RETURN jsonb_build_object('success', true, 'idempotent', true, 'invoice_id', p_invoice_id,
      'paid_amount_cents', v_inv.paid_amount_cents,
      'remaining_cents', GREATEST(0, v_inv.total_cents - v_inv.paid_amount_cents),
      'fully_paid', v_inv.paid_amount_cents >= v_inv.total_cents, 'status', v_inv.status::text);
  END IF;

  v_remaining := GREATEST(0, v_inv.total_cents - v_inv.paid_amount_cents);
  IF p_amount_cents > v_remaining THEN RAISE EXCEPTION 'Payment % exceeds remaining balance %', p_amount_cents, v_remaining; END IF;
  v_new_paid := v_inv.paid_amount_cents + p_amount_cents;
  v_fully := (v_new_paid >= v_inv.total_cents);
  v_new_status := CASE
    WHEN v_fully THEN 'paid'::invoice_status
    WHEN v_inv.status = 'overdue'::invoice_status THEN 'overdue'::invoice_status
    WHEN v_new_paid > 0 THEN 'partially_paid'::invoice_status
    ELSE v_inv.status END;
  UPDATE invoices SET paid_amount_cents = v_new_paid, status = v_new_status, paid_at = CASE WHEN v_fully THEN COALESCE(paid_at, p_paid_at) ELSE paid_at END WHERE id = p_invoice_id;
  INSERT INTO audit_logs (action, entity_type, entity_id, user_id, metadata)
  VALUES ('invoice.payment_recorded', 'invoice', p_invoice_id, auth.uid(),
    jsonb_build_object('amount_cents', p_amount_cents, 'method', p_method, 'paid_amount_cents', v_new_paid, 'fully_paid', v_fully, 'reference', p_reference));

  -- Betalningen bokas NU, med sin egen dag — också delbetalningen. Får aldrig
  -- fälla registreringen: en instans utan vald kontoplan tar ändå emot pengar.
  BEGIN
    v_book := public.book_invoice_paid(p_invoice_id, NULL, NULL, p_paid_at::date);
  EXCEPTION WHEN others THEN
    v_book := jsonb_build_object('success', false, 'error', SQLERRM);
    RAISE WARNING 'payment on invoice % was recorded but not booked: %', COALESCE(v_inv.invoice_number, p_invoice_id::text), SQLERRM;
  END;

  RETURN jsonb_build_object('success', true, 'invoice_id', p_invoice_id, 'amount_cents', p_amount_cents, 'paid_amount_cents', v_new_paid,
    'remaining_cents', GREATEST(0, v_inv.total_cents - v_new_paid), 'fully_paid', v_fully, 'status', v_new_status::text,
    'booked', COALESCE((v_book->>'success')::boolean, false), 'journal_entry_id', v_book->>'journal_entry_id');
END; $function$;

REVOKE ALL ON FUNCTION public.record_invoice_payment(uuid, bigint, text, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_invoice_payment(uuid, bigint, text, timestamptz, text) TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. En makulerad faktura lämnar inget i böckerna
-- ═══════════════════════════════════════════════════════════════════════════
-- Spegelverifikat av utställandet (debet ↔ kredit), en gång. Betalda fakturor
-- makuleras inte (trg_guard_invoice_cancel_with_payments) — de krediteras.
CREATE OR REPLACE FUNCTION public.book_invoice_cancelled(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_inv record; v_issued uuid; v_entry uuid;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'accounting') OR can_access_module(auth.uid(), 'invoicing')) THEN
    RAISE EXCEPTION 'Requires the accounting or invoicing module' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_inv FROM invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Invoice not found'); END IF;
  IF EXISTS (SELECT 1 FROM journal_entries WHERE invoice_id = p_invoice_id AND source = 'invoice_cancelled') THEN
    RETURN jsonb_build_object('success', true, 'skipped', 'already reversed');
  END IF;
  SELECT id INTO v_issued FROM journal_entries
   WHERE invoice_id = p_invoice_id AND source IN ('invoice_issued', 'credit_note_issued') AND status = 'posted'
   ORDER BY created_at LIMIT 1;
  IF v_issued IS NULL THEN
    RETURN jsonb_build_object('success', true, 'skipped', 'never booked — nothing to reverse');
  END IF;

  INSERT INTO journal_entries (entry_date, description, source, invoice_id, status)
  VALUES (CURRENT_DATE, 'Invoice ' || COALESCE(v_inv.invoice_number, p_invoice_id::text) || ' cancelled — reverses the issue entry',
          'invoice_cancelled', p_invoice_id, 'posted')
  RETURNING id INTO v_entry;
  INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
  SELECT v_entry, l.account_code, l.credit_cents, l.debit_cents, 'Reversal: ' || COALESCE(l.description, '')
    FROM journal_entry_lines l WHERE l.journal_entry_id = v_issued;
  RETURN jsonb_build_object('success', true, 'journal_entry_id', v_entry, 'reverses', v_issued);
END $fn$;

REVOKE ALL ON FUNCTION public.book_invoice_cancelled(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.book_invoice_cancelled(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.on_invoice_status_book()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_res jsonb;
BEGIN
  -- A POS receipt is booked by the session close — neither the receivable nor the payment is the invoice's to book.
  IF NEW.origin = 'pos_receipt' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    -- Bokför en faktura som föds färdig. Får aldrig fälla själva skrivningen:
    -- en kund som handlar ska inte nekas för att kontoplanen inte är vald.
    IF NEW.status IN ('sent'::invoice_status, 'paid'::invoice_status) THEN
      -- Fordran först, ALLTID. Den är verklig oavsett om betalningen går att
      -- bokföra: book_invoice_paid kollar beloppet innan den bokar utställandet,
      -- så en faktura född 'paid' utan registrerat belopp fick annars ingenting
      -- alls — varken fordran eller betalning.
      BEGIN
        v_res := public.book_invoice_issued(NEW.id);
        IF NOT coalesce((v_res ->> 'success')::boolean, false)
           AND (v_res ->> 'skipped') IS NULL THEN
          RAISE WARNING 'invoice % was created as % but the receivable was not booked: % — run book_unbooked_invoices()',
            NEW.invoice_number, NEW.status, coalesce(v_res ->> 'error', 'declined without a reason');
        END IF;
      EXCEPTION WHEN others THEN
        RAISE WARNING 'invoice % was created as % but could not be booked: % — run book_unbooked_invoices() once accounting is configured',
          NEW.invoice_number, NEW.status, SQLERRM;
      END;

      IF NEW.status = 'paid'::invoice_status THEN
        BEGIN
          v_res := public.book_invoice_paid(NEW.id);
          -- Ett NEJ som RETURVÄRDE är lika tyst som inget alls om ingen läser
          -- det. Det var precis den här buggklassen filen finns för.
          IF NOT coalesce((v_res ->> 'success')::boolean, false)
             AND (v_res ->> 'skipped') IS NULL THEN
            RAISE WARNING 'invoice % was created as paid but the payment was not booked: % — the receivable stands open',
              NEW.invoice_number, coalesce(v_res ->> 'error', 'declined without a reason');
          END IF;
        EXCEPTION WHEN others THEN
          RAISE WARNING 'invoice % was created as paid but the payment could not be booked: %',
            NEW.invoice_number, SQLERRM;
        END;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'sent'::invoice_status THEN
      PERFORM public.book_invoice_issued(NEW.id);
    ELSIF NEW.status = 'paid'::invoice_status THEN
      PERFORM public.book_invoice_paid(NEW.id);
    ELSIF NEW.status::text IN ('cancelled', 'void') THEN
      -- Makuleringen får aldrig hindras av bokföringen, men heller aldrig
      -- passera tyst utan den.
      BEGIN
        v_res := public.book_invoice_cancelled(NEW.id);
      EXCEPTION WHEN others THEN
        RAISE WARNING 'invoice % was % but its issue entry was not reversed: % — run book_invoice_cancelled(%)',
          NEW.invoice_number, NEW.status, SQLERRM, NEW.id;
      END;
    END IF;
  END IF;
  RETURN NEW;
END $function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Tidfakturan vet sin moms och sin kund
-- ═══════════════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.bulk_invoice_from_timesheets(uuid, date, date, text, integer);
CREATE OR REPLACE FUNCTION public.bulk_invoice_from_timesheets(p_project_id uuid, p_start_date date, p_end_date date, p_group_by text DEFAULT 'entry'::text, p_due_days integer DEFAULT 30, p_tax_rate numeric DEFAULT NULL::numeric)
 RETURNS TABLE(invoice_id uuid, invoice_number text, line_count integer, total_cents bigint, hours_billed numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_project public.projects; v_invoice_id UUID; v_invoice_num TEXT; v_line_items JSONB := '[]'::jsonb;
  v_subtotal BIGINT := 0; v_tax_rate NUMERIC; v_tax_cents BIGINT; v_total_hours NUMERIC := 0;
  v_line_count INTEGER := 0; v_entry RECORD; v_entry_ids UUID[] := '{}';
  v_yr INT := EXTRACT(YEAR FROM CURRENT_DATE)::int; v_last TEXT; v_nextnum INT := 1;
  v_partner_id uuid; v_partner_name text; v_partner_email text;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'invoicing')) THEN RAISE EXCEPTION 'Invoicing timesheets requires the invoicing module' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  IF v_project.id IS NULL THEN RAISE EXCEPTION 'Project not found'; END IF;
  IF NOT v_project.is_billable THEN RAISE EXCEPTION 'Project is not billable'; END IF;
  IF COALESCE(v_project.hourly_rate_cents, 0) <= 0 THEN RAISE EXCEPTION 'Project has no hourly rate set'; END IF;

  -- Momssatsen: den begärda (bråk 0.06 ELLER procent 6 — båda formerna förekommer
  -- i skillkontrakten), annars instansens standard. Aldrig ett tal i koden.
  v_tax_rate := CASE
    WHEN p_tax_rate IS NULL THEN public.order_line_vat_rate(NULL) / 100.0
    WHEN p_tax_rate > 1 THEN p_tax_rate / 100.0
    ELSE p_tax_rate END;
  IF v_tax_rate < 0 OR v_tax_rate > 1 THEN RAISE EXCEPTION 'p_tax_rate % is not a VAT rate (pass 0.25 or 25)', p_tax_rate; END IF;

  -- Kunden: projektets part. Utan den är fakturan ett belopp utan mottagare.
  IF v_project.partner_id IS NOT NULL THEN
    SELECT pa.id, pa.name, pa.email INTO v_partner_id, v_partner_name, v_partner_email FROM public.partners pa WHERE pa.id = v_project.partner_id;
  END IF;

  IF p_group_by = 'user' THEN
    FOR v_entry IN SELECT te.user_id, COALESCE(e.name, 'User') AS user_name, SUM(te.hours) AS total_hours, ARRAY_AGG(te.id) AS ids
      FROM public.time_entries te LEFT JOIN public.employees e ON e.user_id = te.user_id
      WHERE te.project_id = p_project_id AND te.entry_date BETWEEN p_start_date AND p_end_date AND te.is_billable = true AND te.is_invoiced = false GROUP BY te.user_id, e.name LOOP
      v_line_items := v_line_items || jsonb_build_object('description', v_entry.user_name || ' — hours ' || to_char(p_start_date,'YYYY-MM-DD') || ' to ' || to_char(p_end_date,'YYYY-MM-DD'), 'qty', v_entry.total_hours, 'unit_price_cents', v_project.hourly_rate_cents);
      v_subtotal := v_subtotal + ROUND(v_entry.total_hours * v_project.hourly_rate_cents); v_total_hours := v_total_hours + v_entry.total_hours; v_line_count := v_line_count + 1; v_entry_ids := v_entry_ids || v_entry.ids;
    END LOOP;
  ELSIF p_group_by = 'week' THEN
    FOR v_entry IN SELECT date_trunc('week', te.entry_date)::date AS week_start, SUM(te.hours) AS total_hours, ARRAY_AGG(te.id) AS ids
      FROM public.time_entries te WHERE te.project_id = p_project_id AND te.entry_date BETWEEN p_start_date AND p_end_date AND te.is_billable = true AND te.is_invoiced = false GROUP BY date_trunc('week', te.entry_date) ORDER BY week_start LOOP
      v_line_items := v_line_items || jsonb_build_object('description', 'Week of ' || to_char(v_entry.week_start, 'YYYY-MM-DD'), 'qty', v_entry.total_hours, 'unit_price_cents', v_project.hourly_rate_cents);
      v_subtotal := v_subtotal + ROUND(v_entry.total_hours * v_project.hourly_rate_cents); v_total_hours := v_total_hours + v_entry.total_hours; v_line_count := v_line_count + 1; v_entry_ids := v_entry_ids || v_entry.ids;
    END LOOP;
  ELSE
    FOR v_entry IN SELECT te.id, te.entry_date, te.hours, te.description FROM public.time_entries te WHERE te.project_id = p_project_id AND te.entry_date BETWEEN p_start_date AND p_end_date AND te.is_billable = true AND te.is_invoiced = false ORDER BY te.entry_date LOOP
      v_line_items := v_line_items || jsonb_build_object('description', to_char(v_entry.entry_date,'YYYY-MM-DD') || ' — ' || COALESCE(v_entry.description, 'Hours'), 'qty', v_entry.hours, 'unit_price_cents', v_project.hourly_rate_cents);
      v_subtotal := v_subtotal + ROUND(v_entry.hours * v_project.hourly_rate_cents); v_total_hours := v_total_hours + v_entry.hours; v_line_count := v_line_count + 1; v_entry_ids := v_entry_ids || v_entry.id;
    END LOOP;
  END IF;
  IF v_line_count = 0 THEN RAISE EXCEPTION 'No billable, uninvoiced hours found for project in given period'; END IF;
  v_tax_cents := ROUND(v_subtotal * v_tax_rate);
  -- Canonical INV-YYYY-NNNNN series (matches manage_invoice / quote / order / send paths).
  SELECT i.invoice_number INTO v_last FROM public.invoices i WHERE i.invoice_number ILIKE 'INV-' || v_yr || '-%' ORDER BY i.invoice_number DESC LIMIT 1;
  IF v_last IS NOT NULL THEN v_nextnum := COALESCE((substring(v_last from 'INV-\d{4}-(\d+)'))::int, 0) + 1; END IF;
  v_invoice_num := 'INV-' || v_yr || '-' || LPAD(v_nextnum::text, 5, '0');
  INSERT INTO public.invoices (invoice_number, customer_name, customer_email, partner_id, project_id, line_items, subtotal_cents, tax_rate, tax_cents, total_cents, currency, issue_date, due_date, status, created_by, notes)
  VALUES (v_invoice_num, COALESCE(v_partner_name, v_project.client_name, v_project.name), v_partner_email, v_partner_id, p_project_id, v_line_items, v_subtotal, v_tax_rate, v_tax_cents, v_subtotal + v_tax_cents, v_project.currency, CURRENT_DATE, CURRENT_DATE + p_due_days, 'draft', auth.uid(), 'Auto-generated from timesheets ' || p_start_date || ' → ' || p_end_date)
  RETURNING id INTO v_invoice_id;
  UPDATE public.time_entries SET is_invoiced = true, invoice_id = v_invoice_id, updated_at = now() WHERE id = ANY(v_entry_ids);
  invoice_id := v_invoice_id; invoice_number := v_invoice_num; line_count := v_line_count; total_cents := v_subtotal + v_tax_cents; hours_billed := v_total_hours;
  RETURN NEXT;
END; $function$;

REVOKE ALL ON FUNCTION public.bulk_invoice_from_timesheets(uuid, date, date, text, integer, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_invoice_from_timesheets(uuid, date, date, text, integer, numeric) TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Beviset
-- ═══════════════════════════════════════════════════════════════════════════
DO $proof$
DECLARE
  v_inv uuid; v_inv2 uuid; v_ar text; v_bank text; v_n int; v_sum bigint; v_r jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  BEGIN
    v_ar := public.account_for('accounts_receivable');
    v_bank := public.account_for('bank');
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'fakturans-pengar: no accounting locale activated (%) — proof skipped', SQLERRM;
    RETURN;
  END;

  BEGIN
    INSERT INTO invoices (invoice_number, customer_name, customer_email, status, line_items, subtotal_cents, tax_rate, tax_cents, total_cents, currency, issue_date, due_date)
    VALUES ('PROOF-INV-1', 'Proof AB', 'proof-inv@example.test', 'draft',
            '[{"description":"Proof","qty":1,"unit_price_cents":100000}]'::jsonb, 100000, 0.25, 25000, 125000, 'SEK', current_date, current_date + 30)
    RETURNING id INTO v_inv;

    -- Ett utkast är skrivbart; en utfärdad faktura inte.
    UPDATE invoices SET notes = 'draft edit', total_cents = 125000 WHERE id = v_inv;
    UPDATE invoices SET status = 'sent' WHERE id = v_inv;
    BEGIN
      UPDATE invoices SET total_cents = 125, subtotal_cents = 100, tax_cents = 25 WHERE id = v_inv;
      RAISE EXCEPTION 'proof: an issued invoice was rewritten';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN
      UPDATE invoices SET status = 'draft' WHERE id = v_inv;
      RAISE EXCEPTION 'proof: an issued invoice went back to draft';
    EXCEPTION WHEN check_violation THEN NULL; END;
    UPDATE invoices SET notes = 'a note is still fine', due_date = current_date + 45 WHERE id = v_inv;

    -- Handpenning utan referens (tre argument): bokas samma dag, med sitt belopp.
    v_r := public.record_invoice_payment(v_inv, 50000, 'bank');
    IF NOT (v_r->>'booked')::boolean THEN RAISE EXCEPTION 'proof: the deposit was recorded but not booked: %', v_r; END IF;
    SELECT COALESCE(sum(l.debit_cents), 0) INTO v_sum FROM journal_entries e JOIN journal_entry_lines l ON l.journal_entry_id = e.id
     WHERE e.invoice_id = v_inv AND e.source = 'invoice_payment' AND l.account_code = v_bank;
    IF v_sum <> 50000 THEN RAISE EXCEPTION 'proof: bank shows % after a 50 000 deposit', v_sum; END IF;

    -- Resten: fakturan blir paid, statustriggern anropar samma skrivare — inget bokas två gånger.
    PERFORM public.record_invoice_payment(v_inv, 75000, 'bank', now(), 'PROOF-REF-2');
    PERFORM public.record_invoice_payment(v_inv, 75000, 'bank', now(), 'PROOF-REF-2'); -- samma referens = no-op
    PERFORM public.book_invoice_paid(v_inv);
    SELECT count(*), COALESCE(sum(l.debit_cents), 0) INTO v_n, v_sum FROM journal_entries e JOIN journal_entry_lines l ON l.journal_entry_id = e.id
     WHERE e.invoice_id = v_inv AND e.source = 'invoice_payment' AND l.account_code = v_bank;
    IF v_n <> 2 OR v_sum <> 125000 THEN RAISE EXCEPTION 'proof: % payment entries, % on the bank (expected 2 and 125 000)', v_n, v_sum; END IF;
    SELECT COALESCE(sum(l.debit_cents - l.credit_cents), 0) INTO v_sum FROM journal_entries e JOIN journal_entry_lines l ON l.journal_entry_id = e.id
     WHERE e.invoice_id = v_inv AND l.account_code = v_ar;
    IF v_sum <> 0 THEN RAISE EXCEPTION 'proof: the receivable of a fully paid invoice is % (expected 0)', v_sum; END IF;

    -- Makulering: utställandet vänds, en gång.
    INSERT INTO invoices (invoice_number, customer_name, status, line_items, subtotal_cents, tax_rate, tax_cents, total_cents, currency, issue_date, due_date)
    VALUES ('PROOF-INV-2', 'Proof AB', 'sent', '[{"description":"Proof","qty":1,"unit_price_cents":200000}]'::jsonb, 200000, 0.25, 50000, 250000, 'SEK', current_date, current_date + 30)
    RETURNING id INTO v_inv2;
    UPDATE invoices SET status = 'cancelled' WHERE id = v_inv2;
    PERFORM public.book_invoice_cancelled(v_inv2);
    SELECT count(*) FILTER (WHERE e.source = 'invoice_cancelled'), COALESCE(sum(l.debit_cents - l.credit_cents) FILTER (WHERE l.account_code = v_ar), 0)
      INTO v_n, v_sum FROM journal_entries e JOIN journal_entry_lines l ON l.journal_entry_id = e.id WHERE e.invoice_id = v_inv2;
    IF v_sum <> 0 THEN RAISE EXCEPTION 'proof: a cancelled invoice leaves % on the receivable', v_sum; END IF;
    SELECT count(*) INTO v_n FROM journal_entries WHERE invoice_id = v_inv2 AND source = 'invoice_cancelled';
    IF v_n <> 1 THEN RAISE EXCEPTION 'proof: % reversal entries for one cancellation', v_n; END IF;
    SELECT COALESCE(sum(l.debit_cents), 0) - COALESCE(sum(l.credit_cents), 0) INTO v_sum FROM journal_entries e JOIN journal_entry_lines l ON l.journal_entry_id = e.id WHERE e.invoice_id = v_inv2;
    IF v_sum <> 0 THEN RAISE EXCEPTION 'proof: the cancelled invoice''s entries do not net to zero (%)', v_sum; END IF;

    RAISE EXCEPTION 'proof-rollback';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'proof-rollback' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'fakturans-pengar-foljer-bockerna: proof passed';
END $proof$;
