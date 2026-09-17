-- Kassan och returerna når böckerna.
--
-- Processtestet 2026-09-17 följde pengarna ut ur kassan, ut i en retur och ut
-- i en kreditnota — ingen av dem nådde huvudboken:
--
--   KASSAN    close_pos_session_v2 lovade "batch journal posting" och sände
--             pos.session.closed — som ingen lyssnade på. Ett skifts försäljning,
--             moms, dricks och kassadifferens fanns bara i Z-rapporten.
--   RETURER   refund_return betalade ut och skrev inte en rad i journalen.
--             Varor som lades tillbaka på hyllan fick ett värderingslager, men
--             ingen verifikation — lagervärdet steg utan motkonto.
--   KREDITNOTA book_invoice_issued vägrade en negativ total ("Invoice total is
--             zero"), så en kreditnota föddes 'sent' utan att fordran eller
--             intäkten backades. book_unbooked_invoices såg den aldrig.
--   DUBBELT   pos_sale_to_invoice på ett kontantköp skapade en faktura född
--             'paid' — och fakturatriggern bokade intäkten en gång till.
--
-- Magnus 2026-09-17: kassan bokförs per dagsavslut. En verifikation per stängt
-- skift: tendrarna i debet (kassa, bank, presentkortsskuld), intäkt per momssats
-- och utgående moms i kredit, dricks som skuld, kassadifferensen mot 7960.
-- Returen bokförs när ordern är bokförd (via sin faktura); en order som aldrig
-- nådde böckerna får ingen spegelvänd intäkt utan ett svar som säger det.
-- Varor tillbaka = kostnad sålda varor tillbaka. Kreditnotan speglar fakturan.
--
-- Kontona via ROLLER (account_for) — aldrig nummer i koden. Nya roller för
-- kassa, presentkort, förskott och 12/6 %-satserna seedas för se-bas2024 och
-- lämnas orörda där de redan finns.
--
-- Idempotent: CREATE OR REPLACE, ADD COLUMN IF NOT EXISTS, ON CONFLICT DO NOTHING,
-- varje verifikation kontrollerar sin källa innan den skrivs.

-- ── Roller ───────────────────────────────────────────────────────────────────
INSERT INTO public.account_roles (locale, role, account_code, description) VALUES
  ('se-bas2024', 'cash_register',       '1910', 'Kassa — kontanter i kassalådan'),
  ('se-bas2024', 'gift_card_liability', '2421', 'Ej inlösta presentkort'),
  ('se-bas2024', 'customer_credit',     '2420', 'Förskott från kunder / tillgodo'),
  ('se-bas2024', 'tips_payable',        '2890', 'Dricks att betala ut'),
  ('se-bas2024', 'sales_revenue_12',    '3002', 'Försäljning inom Sverige, 12 % moms'),
  ('se-bas2024', 'sales_revenue_6',     '3003', 'Försäljning inom Sverige, 6 % moms'),
  ('se-bas2024', 'vat_output_12',       '2621', 'Utgående moms 12 %'),
  ('se-bas2024', 'vat_output_6',        '2631', 'Utgående moms 6 %')
ON CONFLICT (locale, role) DO NOTHING;

-- A role that a locale has not mapped falls back to the named base role.
CREATE OR REPLACE FUNCTION public.account_for_or(p_role text, p_fallback_role text)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $fn$
BEGIN
  RETURN public.account_for(p_role);
EXCEPTION WHEN OTHERS THEN
  RETURN public.account_for(p_fallback_role);
END $fn$;

-- ── Fakturor ur kassan: en kvittofaktura bokas inte en gång till ─────────────
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS origin text;
COMMENT ON COLUMN public.invoices.origin IS 'pos_receipt = a receipt for a sale settled at the till (booked by the session close, not by the invoice); pos_invoice = a POS sale tendered on invoice (booked by the invoice)';

CREATE OR REPLACE FUNCTION public.pos_sale_to_invoice(p_sale_id uuid, p_customer_name text DEFAULT NULL::text, p_customer_email text DEFAULT NULL::text, p_due_in_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sale public.pos_sales%ROWTYPE;
  v_email text;
  v_invoice_id uuid;
  v_invoice_number text;
  v_lines jsonb;
  v_settled integer;
  v_status text;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'invoicing')) THEN
    RAISE EXCEPTION 'Only staff can create invoices from POS sales';
  END IF;
  SELECT * INTO v_sale FROM public.pos_sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sale % not found', p_sale_id; END IF;
  IF v_sale.invoice_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'invoice_id', v_sale.invoice_id, 'already_linked', true,
      'invoice_number', (SELECT invoice_number FROM public.invoices WHERE id = v_sale.invoice_id));
  END IF;
  IF v_sale.refund_of IS NOT NULL THEN RAISE EXCEPTION 'Cannot invoice a refund sale'; END IF;

  v_email := COALESCE(p_customer_email, v_sale.customer_email);
  IF v_email IS NULL THEN RAISE EXCEPTION 'customer_email is required (sale has none on record)'; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'description', l.product_name || CASE WHEN l.sku IS NOT NULL THEN ' (' || l.sku || ')' ELSE '' END,
      'quantity', l.quantity, 'unit_price_cents', l.unit_price_cents,
      'discount_cents', COALESCE(l.discount_cents, 0), 'tax_rate', l.tax_rate, 'total_cents', l.line_total_cents
    )), '[]'::jsonb)
  INTO v_lines FROM public.pos_sale_lines l WHERE l.sale_id = p_sale_id;

  SELECT COALESCE(SUM(amount_cents), 0) INTO v_settled
    FROM public.pos_payments WHERE sale_id = p_sale_id AND method <> 'invoice' AND COALESCE(reference, '') <> 'tip';
  v_status := CASE WHEN v_settled >= v_sale.total_cents THEN 'paid' ELSE 'sent' END;

  v_invoice_number := 'POS-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' || lpad(nextval('public.pos_receipt_seq')::text, 6, '0');

  INSERT INTO public.invoices
    (invoice_number, customer_email, customer_name, status, line_items,
     subtotal_cents, tax_rate, tax_cents, total_cents, currency,
     due_date, issue_date, payment_terms, notes, paid_at, origin)
  VALUES
    (v_invoice_number, v_email, p_customer_name, v_status::invoice_status, v_lines,
     v_sale.subtotal_cents, CASE WHEN v_sale.subtotal_cents > 0 THEN round(v_sale.tax_cents::numeric / v_sale.subtotal_cents, 4) ELSE 0 END,
     v_sale.tax_cents, v_sale.total_cents, COALESCE(v_sale.currency,'SEK'),
     CASE WHEN v_status = 'paid' THEN CURRENT_DATE ELSE CURRENT_DATE + COALESCE(p_due_in_days,30) END, CURRENT_DATE,
     CASE WHEN v_status = 'paid' THEN 'Paid at the till' ELSE 'Net ' || COALESCE(p_due_in_days,30) || ' days' END,
     'Generated from POS receipt ' || v_sale.receipt_number,
     CASE WHEN v_status = 'paid' THEN v_sale.created_at ELSE NULL END,
     -- Settled at the till: the session close books it. Tendered on invoice: the invoice books it.
     CASE WHEN v_status = 'paid' THEN 'pos_receipt' ELSE 'pos_invoice' END)
  RETURNING id INTO v_invoice_id;

  UPDATE public.pos_sales SET invoice_id = v_invoice_id WHERE id = p_sale_id;

  RETURN jsonb_build_object('success', true, 'invoice_id', v_invoice_id, 'invoice_number', v_invoice_number,
    'sale_id', p_sale_id, 'status', v_status, 'total_cents', v_sale.total_cents,
    'booked_by', CASE WHEN v_status = 'paid' THEN 'pos_session_close' ELSE 'invoice' END);
END;
$function$;

-- ── Fakturabokningen: kreditnotor speglar, kvittofakturor hoppas över ────────
CREATE OR REPLACE FUNCTION public.book_invoice_issued(p_invoice_id uuid, p_ar_account text DEFAULT NULL::text, p_revenue_account text DEFAULT NULL::text, p_vat_account text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inv record;
  v_entry_id uuid;
  v_net bigint;
  v_vat bigint;
  v_total bigint;
  v_is_credit boolean;
  v_source text;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'accounting')) THEN
    RAISE EXCEPTION 'Requires the accounting module — an admin can grant it under Users → Role Permissions';
  END IF;

  p_ar_account := COALESCE(p_ar_account, public.account_for('accounts_receivable'));
  p_revenue_account := COALESCE(p_revenue_account, public.account_for('sales_revenue'));
  p_vat_account := COALESCE(p_vat_account, public.account_for('vat_output'));
  SELECT * INTO v_inv FROM invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
  END IF;
  IF v_inv.origin = 'pos_receipt' THEN
    RETURN jsonb_build_object('success', true, 'skipped', 'POS receipt — the session close books the sale');
  END IF;

  v_is_credit := (v_inv.invoice_type = 'credit_note');
  v_source := CASE WHEN v_is_credit THEN 'credit_note_issued' ELSE 'invoice_issued' END;
  IF EXISTS (SELECT 1 FROM journal_entries WHERE invoice_id = p_invoice_id AND source = v_source) THEN
    RETURN jsonb_build_object('success', true, 'skipped', 'already booked');
  END IF;

  -- A credit note carries its amounts negative; the entry mirrors the invoice.
  v_total := abs(COALESCE(v_inv.total_cents, 0));
  v_vat   := abs(COALESCE(v_inv.tax_cents, 0));
  v_net   := abs(COALESCE(v_inv.subtotal_cents, v_inv.total_cents - v_inv.tax_cents));
  IF v_total <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice total is zero');
  END IF;

  INSERT INTO journal_entries (entry_date, description, source, invoice_id, status)
  VALUES (COALESCE(v_inv.issue_date, CURRENT_DATE),
          CASE WHEN v_is_credit THEN 'Credit note ' ELSE 'Invoice ' END || COALESCE(v_inv.invoice_number, p_invoice_id::text) || ' issued',
          v_source, p_invoice_id, 'posted')
  RETURNING id INTO v_entry_id;

  IF v_is_credit THEN
    INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description) VALUES
      (v_entry_id, p_revenue_account, v_net, 0, 'Revenue reversed'),
      (v_entry_id, p_ar_account, 0, v_total, 'Accounts receivable');
    IF v_vat > 0 THEN
      INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
      VALUES (v_entry_id, p_vat_account, v_vat, 0, 'Output VAT reversed');
    END IF;
  ELSE
    INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description) VALUES
      (v_entry_id, p_ar_account, v_total, 0, 'Accounts receivable'),
      (v_entry_id, p_revenue_account, 0, v_net, 'Revenue');
    IF v_vat > 0 THEN
      INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
      VALUES (v_entry_id, p_vat_account, 0, v_vat, 'Output VAT');
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'invoice_id', p_invoice_id, 'journal_entry_id', v_entry_id,
    'total_cents', v_inv.total_cents, 'source', v_source);
END;
$function$;

CREATE OR REPLACE FUNCTION public.book_unbooked_invoices(p_dry_run boolean DEFAULT true, p_limit integer DEFAULT 500)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_res jsonb;
  v_found int := 0;
  v_booked int := 0;
  v_cents bigint := 0;
  v_failed jsonb := '[]'::jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'accounting')) THEN
    RAISE EXCEPTION 'Requires the accounting module — an admin can grant it under Users → Role Permissions';
  END IF;

  FOR r IN
    SELECT i.id, i.invoice_number, i.status, i.total_cents, i.invoice_type
      FROM invoices i
     WHERE i.status IN ('sent'::invoice_status, 'paid'::invoice_status)
       AND coalesce(i.total_cents, 0) <> 0
       AND COALESCE(i.origin, '') <> 'pos_receipt'
       AND NOT EXISTS (SELECT 1 FROM journal_entries j
                        WHERE j.invoice_id = i.id
                          AND j.source = CASE WHEN i.invoice_type = 'credit_note' THEN 'credit_note_issued' ELSE 'invoice_issued' END)
     ORDER BY i.issue_date NULLS LAST, i.created_at
     LIMIT greatest(1, least(coalesce(p_limit, 500), 5000))
  LOOP
    v_found := v_found + 1;
    v_cents := v_cents + abs(coalesce(r.total_cents, 0));
    IF NOT p_dry_run THEN
      BEGIN
        IF r.status = 'paid'::invoice_status AND r.invoice_type <> 'credit_note' THEN
          v_res := public.book_invoice_paid(r.id);
        ELSE
          v_res := public.book_invoice_issued(r.id);
        END IF;
        IF coalesce((v_res ->> 'success')::boolean, false) THEN
          v_booked := v_booked + 1;
        ELSE
          v_failed := v_failed || jsonb_build_object('invoice', r.invoice_number, 'why', v_res ->> 'error');
        END IF;
      EXCEPTION WHEN others THEN
        v_failed := v_failed || jsonb_build_object('invoice', r.invoice_number, 'why', SQLERRM);
      END;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'dry_run', p_dry_run, 'found', v_found,
    'booked', v_booked, 'total_cents', v_cents, 'failed', v_failed,
    'note', CASE WHEN p_dry_run THEN 'Dry run — call again with p_dry_run=false to book' ELSE 'Booked' END);
END;
$function$;

-- The invoice trigger, unchanged but for one early return.
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
    END IF;
  END IF;
  RETURN NEW;
END $function$;

-- ── Kassan: en verifikation per stängt skift ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.pos_session_journal(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_session record;
  v_je uuid;
  v_rate record;
  v_pay record;
  v_tips bigint;
  v_cash bigint := 0;
  v_variance bigint;
  v_debit bigint := 0;
  v_credit bigint := 0;
  v_diff bigint;
  v_lines int := 0;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'pos') OR public.can_access_module(auth.uid(), 'accounting')) THEN
    RAISE EXCEPTION 'Booking a POS session requires the POS or accounting module' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_session FROM public.pos_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Session % not found', p_session_id; END IF;
  IF v_session.status <> 'closed' THEN RAISE EXCEPTION 'Session % is not closed — the day-end entry is booked at close', p_session_id; END IF;

  SELECT id INTO v_je FROM public.journal_entries WHERE source = 'pos_session' AND reference_number = p_session_id::text LIMIT 1;
  IF v_je IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'skipped', 'already booked', 'journal_entry_id', v_je);
  END IF;

  -- Sales tendered on invoice are booked by their invoice; everything else is the till's.
  CREATE TEMP TABLE IF NOT EXISTS _pos_sess (id uuid) ON COMMIT DROP;
  DELETE FROM _pos_sess;
  INSERT INTO _pos_sess SELECT id FROM public.pos_sales WHERE session_id = p_session_id AND status <> 'voided' AND payment_method <> 'invoice';
  IF NOT EXISTS (SELECT 1 FROM _pos_sess) THEN
    RETURN jsonb_build_object('success', true, 'skipped', 'nothing to book — no till sales in the session');
  END IF;

  INSERT INTO public.journal_entries (entry_date, description, reference_number, source, status)
  VALUES (COALESCE(v_session.closed_at::date, CURRENT_DATE),
          'POS day-end ' || COALESCE((SELECT name FROM public.pos_registers WHERE id = v_session.register_id), 'register')
            || ' ' || to_char(COALESCE(v_session.closed_at, now()), 'YYYY-MM-DD') || COALESCE(' — ' || v_session.cashier_name, ''),
          p_session_id::text, 'pos_session', 'posted')
  RETURNING id INTO v_je;

  -- Revenue and VAT per rate, from the lines (refund lines are negative).
  FOR v_rate IN
    SELECT COALESCE(l.tax_rate, 0) AS rate,
           SUM(l.line_total_cents - round(l.line_total_cents * COALESCE(l.tax_rate,0) / (100 + COALESCE(l.tax_rate,0)))) AS net,
           SUM(round(l.line_total_cents * COALESCE(l.tax_rate,0) / (100 + COALESCE(l.tax_rate,0)))) AS vat
      FROM public.pos_sale_lines l JOIN _pos_sess s ON s.id = l.sale_id
     GROUP BY 1
  LOOP
    IF v_rate.net <> 0 THEN
      INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
      VALUES (v_je,
        CASE v_rate.rate WHEN 12 THEN public.account_for_or('sales_revenue_12', 'sales_revenue')
                         WHEN 6  THEN public.account_for_or('sales_revenue_6', 'sales_revenue')
                         ELSE public.account_for('sales_revenue') END,
        GREATEST(-v_rate.net, 0), GREATEST(v_rate.net, 0), 'POS sales ' || v_rate.rate || ' %');
      v_lines := v_lines + 1;
    END IF;
    IF v_rate.vat <> 0 THEN
      INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
      VALUES (v_je,
        CASE v_rate.rate WHEN 12 THEN public.account_for_or('vat_output_12', 'vat_output')
                         WHEN 6  THEN public.account_for_or('vat_output_6', 'vat_output')
                         ELSE public.account_for('vat_output') END,
        GREATEST(-v_rate.vat, 0), GREATEST(v_rate.vat, 0), 'Output VAT ' || v_rate.rate || ' %');
      v_lines := v_lines + 1;
    END IF;
  END LOOP;

  -- Tips are the staff's, not revenue.
  SELECT COALESCE(SUM(p.amount_cents), 0) INTO v_tips
    FROM public.pos_payments p JOIN _pos_sess s ON s.id = p.sale_id WHERE p.reference = 'tip';
  IF v_tips <> 0 THEN
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_je, public.account_for_or('tips_payable', 'employee_liability'), GREATEST(-v_tips, 0), GREATEST(v_tips, 0), 'Tips payable');
    v_lines := v_lines + 1;
  END IF;

  -- The tenders: what came in, by method (change and refunds are negative rows).
  FOR v_pay IN
    SELECT p.method, SUM(p.amount_cents) AS amt
      FROM public.pos_payments p JOIN _pos_sess s ON s.id = p.sale_id
     GROUP BY p.method
  LOOP
    CONTINUE WHEN v_pay.amt = 0;
    IF v_pay.method = 'cash' THEN v_cash := v_pay.amt; END IF;
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_je,
      CASE v_pay.method WHEN 'cash' THEN public.account_for_or('cash_register', 'bank')
                        WHEN 'gift_card' THEN public.account_for_or('gift_card_liability', 'customer_credit')
                        ELSE public.account_for('bank') END,
      GREATEST(v_pay.amt, 0), GREATEST(-v_pay.amt, 0), 'POS tender ' || v_pay.method);
    v_lines := v_lines + 1;
  END LOOP;

  -- The drawer was counted: the difference to what the till says leaves or enters 7960.
  v_variance := COALESCE(v_session.cash_variance_cents, 0);
  IF v_variance <> 0 THEN
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description) VALUES
      (v_je, public.account_for_or('cash_register', 'bank'), GREATEST(v_variance, 0), GREATEST(-v_variance, 0), 'Cash count'),
      (v_je, public.account_for('cash_difference'), GREATEST(-v_variance, 0), GREATEST(v_variance, 0), 'Cash difference');
    v_lines := v_lines + 2;
  END IF;

  -- Öre rounding between per-line VAT and per-sale totals lands on the rounding account.
  SELECT COALESCE(SUM(debit_cents), 0), COALESCE(SUM(credit_cents), 0) INTO v_debit, v_credit
    FROM public.journal_entry_lines WHERE journal_entry_id = v_je;
  v_diff := v_debit - v_credit;
  IF v_diff <> 0 THEN
    IF abs(v_diff) > 100 * GREATEST((SELECT count(*) FROM _pos_sess), 1) THEN
      RAISE EXCEPTION 'POS day-end entry for session % does not balance: debit % credit %', p_session_id, v_debit, v_credit;
    END IF;
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_je, public.account_for('rounding_variance'), GREATEST(-v_diff, 0), GREATEST(v_diff, 0), 'Rounding');
    v_lines := v_lines + 1;
  END IF;

  UPDATE public.pos_sessions SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('journal_entry_id', v_je) WHERE id = p_session_id;
  RETURN jsonb_build_object('success', true, 'journal_entry_id', v_je, 'lines', v_lines, 'cash_cents', v_cash, 'tips_cents', v_tips, 'cash_variance_cents', v_variance);
END $fn$;
REVOKE EXECUTE ON FUNCTION public.pos_session_journal(uuid) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.close_pos_session_v2(p_session_id uuid, p_closing_cash_cents integer, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_session record;
  v_register record;
  v_d record;
  v_expected_cash integer;
  v_variance integer;
  v_z_report jsonb;
  v_book jsonb;
BEGIN
  -- staff-guard 20260917100000
  IF NOT (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.can_access_module(auth.uid(), 'pos')) THEN
    RAISE EXCEPTION 'Closing a POS session requires the POS module' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_session FROM public.pos_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Session % not found', p_session_id; END IF;
  IF v_session.status <> 'open' THEN RAISE EXCEPTION 'Session % is not open', p_session_id; END IF;

  SELECT * INTO v_register FROM public.pos_registers WHERE id = v_session.register_id;
  SELECT * INTO v_d FROM public.pos_session_drawer(p_session_id);

  v_expected_cash := COALESCE(v_session.opening_cash_cents, 0) + v_d.cash_in_drawer_cents;
  v_variance := p_closing_cash_cents - v_expected_cash;

  v_z_report := jsonb_build_object(
    'session_id', p_session_id, 'register', v_register.name, 'cashier', v_session.cashier_name,
    'opened_at', v_session.opened_at, 'closed_at', now(),
    'opening_cash_cents', v_session.opening_cash_cents, 'closing_cash_cents', p_closing_cash_cents,
    'expected_cash_cents', v_expected_cash, 'cash_variance_cents', v_variance,
    'sales_count', v_session.sales_count, 'total_sales_cents', v_d.total_sales_cents, 'total_tax_cents', v_d.total_tax_cents,
    'refunds_cents', v_d.refunds_cents, 'tips_cents', v_d.tips_cents, 'change_given_cents', v_d.change_cents,
    'payments_by_method', v_d.payments_by_method, 'currency', v_register.currency);

  UPDATE public.pos_sessions
     SET status = 'closed', closed_at = now(), closing_cash_cents = p_closing_cash_cents,
         expected_cash_cents = v_expected_cash, cash_variance_cents = v_variance,
         total_sales_cents = v_d.total_sales_cents, notes = COALESCE(p_notes, notes),
         metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('z_report', v_z_report)
   WHERE id = p_session_id;

  -- The day-end entry. A till that cannot be booked (no chart, no roles) still
  -- closes — but says so, and book_pos_session can be run once accounting is set up.
  BEGIN
    v_book := public.pos_session_journal(p_session_id);
  EXCEPTION WHEN OTHERS THEN
    v_book := jsonb_build_object('success', false, 'error', SQLERRM);
    RAISE WARNING 'POS session % closed but not booked: % — run book_pos_session once accounting is configured', p_session_id, SQLERRM;
  END;
  v_z_report := v_z_report || jsonb_build_object('journal', v_book);

  PERFORM public.emit_platform_event('pos.session.closed', v_z_report, 'pos');
  RETURN v_z_report;
END;
$function$;

-- ── Returer: pengarna tillbaka bokförs mot den bokförda försäljningen ────────
CREATE OR REPLACE FUNCTION public.refund_return(p_return_id uuid, p_refund_cents integer, p_method text DEFAULT 'manual'::text, p_final boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ret RECORD;
  v_line_count integer;
  v_gross bigint;
  v_expected bigint;
  v_already bigint;
  v_new_total bigint;
  v_done boolean;
  v_order_total bigint;
  v_order_refunded bigint;
  v_invoice uuid;
  v_je uuid;
  v_rate numeric;
  v_vat bigint;
  v_net bigint;
  v_ledger jsonb;
BEGIN
  -- staff-guard 20260917090000
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'returns')) THEN
    RAISE EXCEPTION 'Refunding a return requires the returns module' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_ret FROM returns WHERE id = p_return_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Return % not found', p_return_id; END IF;
  IF v_ret.status NOT IN ('received','approved') THEN
    RAISE EXCEPTION 'Return not in refundable state (status %)', v_ret.status;
  END IF;
  IF p_refund_cents IS NULL OR p_refund_cents < 0 THEN
    RAISE EXCEPTION 'refund_cents must not be negative';
  END IF;
  IF p_refund_cents = 0 AND NOT p_final THEN
    RAISE EXCEPTION 'refund_cents must be positive (pass p_final: true with refund_cents 0 only to close an RMA without a further payout)';
  END IF;

  SELECT COUNT(*), COALESCE(SUM(quantity * unit_refund_cents), 0) INTO v_line_count, v_gross FROM return_items WHERE return_id = p_return_id;
  IF v_line_count = 0 THEN
    RAISE EXCEPTION 'Return % has no return lines — add lines via manage_return_item (return_id, quantity, unit_refund_cents) before refunding', p_return_id;
  END IF;
  IF v_gross <= 0 THEN
    RAISE EXCEPTION 'Return % has % line(s) but an expected refund of 0 — set unit_refund_cents on the lines via manage_return_item before refunding', p_return_id, v_line_count;
  END IF;

  v_expected := GREATEST(v_gross - v_ret.restocking_fee_cents, 0);
  SELECT o.total_cents INTO v_order_total FROM orders o WHERE o.id = v_ret.order_id;
  SELECT COALESCE(SUM(r.refund_amount_cents), 0) INTO v_order_refunded FROM returns r WHERE r.order_id = v_ret.order_id AND r.id <> p_return_id;
  IF v_order_total IS NOT NULL THEN
    v_expected := LEAST(v_expected, GREATEST(v_order_total - v_order_refunded, 0));
  END IF;

  v_already := COALESCE(v_ret.refund_amount_cents, 0);
  v_new_total := v_already + p_refund_cents;
  v_done := p_final OR v_new_total >= v_expected;
  IF p_refund_cents > 0 AND v_new_total > v_expected THEN
    RAISE EXCEPTION 'Refund % would exceed expected total % (items % − restocking fee %, capped by order total % less % refunded on other returns); already refunded %. To close this RMA without a further payout, call again with refund_cents 0 and p_final true',
      v_new_total, v_expected, v_gross, v_ret.restocking_fee_cents, v_order_total, v_order_refunded, v_already;
  END IF;

  UPDATE returns
     SET refund_amount_cents = v_new_total,
         refund_method = CASE WHEN p_refund_cents > 0 THEN p_method ELSE refund_method END,
         refund_processed_at = now(),
         status = CASE WHEN v_done THEN 'refunded' ELSE status END
   WHERE id = p_return_id;

  -- The books. The sale is in them through the order's invoice; the refund
  -- reverses revenue and VAT (the lines' rate) and pays out of the bank — or,
  -- for store credit, into the customer's prepayment. An order that never got
  -- an invoice has no revenue to reverse: the answer says so instead of
  -- inventing a negative sale.
  v_ledger := NULL;
  IF p_refund_cents > 0 THEN
    SELECT i.id INTO v_invoice FROM invoices i
     WHERE i.order_id = v_ret.order_id AND i.invoice_type = 'invoice'
       AND EXISTS (SELECT 1 FROM journal_entries j WHERE j.invoice_id = i.id AND j.source = 'invoice_issued')
     ORDER BY i.created_at LIMIT 1;
    IF v_invoice IS NULL THEN
      v_ledger := jsonb_build_object('booked', false, 'why', 'order has no booked invoice — nothing in the books to reverse; book the sale (send_invoice_for_order) or post the refund with manage_journal_entry');
    ELSE
      BEGIN
        -- VAT share from the return lines' order lines, weighted by refund value.
        SELECT COALESCE(SUM(ri.quantity * ri.unit_refund_cents * COALESCE(oi.tax_rate_pct, 0) / (100 + COALESCE(oi.tax_rate_pct, 0)))
                        / NULLIF(SUM(ri.quantity * ri.unit_refund_cents), 0), 0)
          INTO v_rate
          FROM return_items ri LEFT JOIN order_items oi ON oi.id = ri.order_item_id
         WHERE ri.return_id = p_return_id;
        v_vat := round(p_refund_cents * COALESCE(v_rate, 0))::bigint;
        v_net := p_refund_cents - v_vat;
        INSERT INTO journal_entries (entry_date, description, reference_number, source, invoice_id, status)
        VALUES (CURRENT_DATE, 'Refund ' || COALESCE(v_ret.rma_number, p_return_id::text) || ' (' || p_method || ')',
                COALESCE(v_ret.rma_number, p_return_id::text), 'return_refund', v_invoice, 'posted')
        RETURNING id INTO v_je;
        INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description) VALUES
          (v_je, public.account_for('sales_revenue'), v_net, 0, 'Revenue reversed on return');
        IF v_vat > 0 THEN
          INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description) VALUES
            (v_je, public.account_for('vat_output'), v_vat, 0, 'Output VAT reversed on return');
        END IF;
        INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description) VALUES
          (v_je, CASE WHEN p_method = 'store_credit' THEN public.account_for_or('customer_credit', 'accounts_receivable') ELSE public.account_for('bank') END,
           0, p_refund_cents, CASE WHEN p_method = 'store_credit' THEN 'Store credit issued' ELSE 'Refund paid out' END);
        v_ledger := jsonb_build_object('booked', true, 'journal_entry_id', v_je, 'net_cents', v_net, 'vat_cents', v_vat);
      EXCEPTION WHEN OTHERS THEN
        v_ledger := jsonb_build_object('booked', false, 'why', SQLERRM);
        RAISE WARNING 'refund_return %: paid out but not booked: %', p_return_id, SQLERRM;
      END;
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'return_id', p_return_id,
    'refunded_cents', v_new_total, 'expected_cents', v_expected,
    'remaining_cents', GREATEST(v_expected - v_new_total, 0),
    'line_count', v_line_count,
    'status', CASE WHEN v_done THEN 'refunded' ELSE v_ret.status END,
    'ledger', v_ledger);
END $function$;

-- ── Varor tillbaka på hyllan = kostnad sålda varor tillbaka ──────────────────
-- The live valuation trigger, extended: an inbound move that is goods coming
-- BACK (a restocked return, a POS refund) books Dt inventory / Cr COGS for the
-- layer it creates — the mirror of the COGS entry the sale posted.
CREATE OR REPLACE FUNCTION public.process_stock_move_valuation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_qty numeric := abs(COALESCE(NEW.quantity,0));
  v_is_in boolean;
  v_method text;
  v_unit_cost bigint;
  v_total_cost bigint := 0;
  v_layer RECORD;
  v_take numeric;
  v_remaining numeric;
  v_avg numeric;
  v_je uuid;
  v_is_purchase boolean;
  v_is_return boolean;
  v_event_date date;
  v_receipt_id uuid;
BEGIN
  IF v_qty = 0 THEN RETURN NEW; END IF;
  IF NEW.move_type NOT IN ('in','out','mo_production','mo_consumption','adjustment') THEN RETURN NEW; END IF;
  v_is_in := (NEW.move_type IN ('in','mo_production','adjustment')) AND COALESCE(NEW.quantity,0) > 0;
  v_is_purchase := NEW.reference_type IN ('purchase_order','po','goods_receipt');
  v_is_return := NEW.move_type = 'in' AND (COALESCE(NEW.notes, '') ~* '^(rma_restock|pos_refund)');

  IF v_is_in THEN
    v_unit_cost := COALESCE(NEW.unit_cost_cents,
                            resolve_inbound_unit_cost(NEW.product_id, NEW.reference_type, NEW.reference_id));
    IF COALESCE(v_unit_cost, 0) = 0 THEN
      SELECT CASE WHEN sum(remaining_qty) > 0
                  THEN round(sum(remaining_qty * unit_cost_cents) / sum(remaining_qty)) END
        INTO v_unit_cost
        FROM stock_valuation_layers
       WHERE product_id = NEW.product_id AND remaining_qty > 0;
      IF COALESCE(v_unit_cost, 0) = 0 THEN
        SELECT cost_cents INTO v_unit_cost FROM products WHERE id = NEW.product_id;
      END IF;
      v_unit_cost := COALESCE(v_unit_cost, 0);
    END IF;

    INSERT INTO stock_valuation_layers (product_id, variant_id, move_id, quantity, unit_cost_cents, value_cents, remaining_qty)
    VALUES (NEW.product_id, NEW.variant_id, NEW.id, v_qty, v_unit_cost, round(v_qty * v_unit_cost), v_qty);
    UPDATE stock_moves SET unit_cost_cents = v_unit_cost, value_cents = round(v_qty * v_unit_cost)
      WHERE id = NEW.id;

    IF v_is_purchase AND v_unit_cost > 0 THEN
      UPDATE products SET cost_cents = v_unit_cost, updated_at = now()
       WHERE id = NEW.product_id AND cost_cents IS NULL;
    END IF;

    IF v_is_purchase AND v_unit_cost > 0 THEN
      v_receipt_id := NULL;
      v_event_date := NULL;
      IF NEW.reference_type = 'goods_receipt'
         AND COALESCE(NEW.reference_id,'') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_receipt_id := NEW.reference_id::uuid;
        SELECT received_date INTO v_event_date FROM goods_receipts WHERE id = v_receipt_id;
      END IF;
      v_event_date := COALESCE(v_event_date, NEW.created_at::date, CURRENT_DATE);
      BEGIN
        INSERT INTO journal_entries (entry_date, description, reference_number, source, status)
        VALUES (v_event_date, 'Inventory receipt '||COALESCE(NEW.reference_id,''),
                NEW.reference_id, 'inventory_receipt', 'posted')
        RETURNING id INTO v_je;
        INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
        VALUES (v_je, public.account_for('inventory'), round(v_qty*v_unit_cost), 0, 'Lager av handelsvaror'),
               (v_je, public.account_for('goods_received_not_invoiced'), 0, round(v_qty*v_unit_cost), 'GRNI — ej fakturerade leveranser');
      EXCEPTION WHEN others THEN
        RAISE WARNING 'inventory_receipt JE skipped: %', SQLERRM;
      END;
    END IF;

    -- Goods back on the shelf: the cost of goods sold comes back with them.
    IF v_is_return AND v_unit_cost > 0 THEN
      BEGIN
        INSERT INTO journal_entries (entry_date, description, reference_number, source, status)
        VALUES (COALESCE(NEW.created_at::date, CURRENT_DATE), 'Goods returned to stock ' || COALESCE(NEW.notes, ''),
                NEW.reference_id, 'inventory_return', 'posted')
        RETURNING id INTO v_je;
        INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
        VALUES (v_je, public.account_for('inventory'), round(v_qty*v_unit_cost), 0, 'Lager av handelsvaror'),
               (v_je, public.account_for('cogs'), 0, round(v_qty*v_unit_cost), 'Kostnad sålda varor återförd');
      EXCEPTION WHEN others THEN
        RAISE WARNING 'inventory_return JE skipped: %', SQLERRM;
      END;
    END IF;
    RETURN NEW;
  END IF;

  SELECT COALESCE(pc.costing_method,'average') INTO v_method
  FROM products p LEFT JOIN product_categories pc ON pc.id = p.category_id
  WHERE p.id = NEW.product_id;
  v_method := COALESCE(v_method,'average');

  IF v_method = 'average' THEN
    SELECT CASE WHEN sum(remaining_qty) > 0
                THEN sum(remaining_qty * unit_cost_cents) / sum(remaining_qty) END
    INTO v_avg FROM stock_valuation_layers
    WHERE product_id = NEW.product_id AND remaining_qty > 0;
  END IF;

  v_remaining := v_qty;
  FOR v_layer IN
    SELECT id, remaining_qty, unit_cost_cents FROM stock_valuation_layers
    WHERE product_id = NEW.product_id AND remaining_qty > 0
    ORDER BY created_at, id
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_take := LEAST(v_layer.remaining_qty, v_remaining);
    v_total_cost := v_total_cost + round(v_take * CASE WHEN v_method='average' THEN v_avg ELSE v_layer.unit_cost_cents END);
    UPDATE stock_valuation_layers SET remaining_qty = remaining_qty - v_take WHERE id = v_layer.id;
    v_remaining := v_remaining - v_take;
  END LOOP;
  IF v_remaining > 0 THEN
    SELECT COALESCE(v_avg, cost_cents, 0) INTO v_unit_cost FROM products WHERE id = NEW.product_id;
    v_total_cost := v_total_cost + round(v_remaining * COALESCE(v_unit_cost,0));
  END IF;

  -- COGS on the way out (20260822105000, restored 20260827200000): the move's own
  -- date is the event, the reference carries the order key.
  IF NEW.move_type = 'out' AND v_total_cost > 0 THEN
    BEGIN
      INSERT INTO journal_entries (entry_date, description, reference_number, source, status)
      VALUES (COALESCE(NEW.created_at::date, CURRENT_DATE),
              'COGS '||COALESCE(NEW.reference_type,'move')||' '||COALESCE(NEW.reference_id,''),
              NEW.reference_id, 'inventory_cogs', 'posted')
      RETURNING id INTO v_je;
      INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
      VALUES (v_je, public.account_for('cogs'), v_total_cost, 0, 'Kostnad sålda varor'),
             (v_je, public.account_for('inventory'), 0, v_total_cost, 'Lager av handelsvaror');
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'inventory_cogs JE skipped: %', SQLERRM;
    END;
  END IF;

  UPDATE stock_moves SET
    unit_cost_cents = CASE WHEN v_qty > 0 THEN round(v_total_cost / v_qty) ELSE NULL END,
    value_cents = v_total_cost
  WHERE id = NEW.id;

  RETURN NEW;
END $function$;

-- ── Bevisar sig själv (rullas alltid tillbaka) ──────────────────────────────
DO $proof$
DECLARE
  v_prod uuid; v_reg uuid; v_sess uuid; v_sale jsonb; v_z jsonb; v_je uuid; v_d bigint; v_c bigint;
  v_inv uuid; v_cn jsonb; v_order uuid; v_oi uuid; v_ret uuid; v_r jsonb; v_lines int;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  IF NOT EXISTS (SELECT 1 FROM public.account_roles WHERE role = 'sales_revenue') THEN
    RAISE NOTICE 'kassan-och-returerna: no account roles on this instance — proof skipped';
    RETURN;
  END IF;
  BEGIN
    -- ── POS: one entry per closed session, balanced ──
    INSERT INTO public.products (name, price_cents, cost_cents, stock_quantity, track_inventory, available_in_pos, is_active)
      VALUES ('proof-mug', 10000, 4000, 20, true, true, true) RETURNING id INTO v_prod;
    INSERT INTO public.pos_registers (name, currency, default_tax_rate, active) VALUES ('proof-till', 'SEK', 25, true) RETURNING id INTO v_reg;
    INSERT INTO public.pos_sessions (register_id, cashier_name, status, opening_cash_cents) VALUES (v_reg, 'proof', 'open', 50000) RETURNING id INTO v_sess;
    -- 2 mugs, 500 sale discount, cash 30000 → change 6875; then a card sale with a 12 % line and a tip
    v_sale := public.record_pos_sale_v2(v_reg, v_sess,
      jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 2, 'unit_price_cents', 10000, 'discount_cents', 1000)),
      jsonb_build_array(jsonb_build_object('method', 'cash', 'amount_cents', 30000)), NULL, NULL, 500, '{}'::jsonb);
    v_sale := public.record_pos_sale_v2(v_reg, v_sess,
      jsonb_build_array(jsonb_build_object('product_name', 'proof-bun', 'quantity', 1, 'unit_price_cents', 5000, 'tax_rate', 12)),
      jsonb_build_array(jsonb_build_object('method', 'card')), NULL, NULL, 0, '{}'::jsonb);
    PERFORM public.add_tip((v_sale->>'sale_id')::uuid, 1000, 'card');
    -- drawer: 50000 + 30000 − 6875 = 73125; count 73000 → variance −125
    v_z := public.close_pos_session_v2(v_sess, 73000, NULL);
    v_je := (v_z->'journal'->>'journal_entry_id')::uuid;
    IF v_je IS NULL THEN RAISE EXCEPTION 'proof: session close booked nothing: %', v_z->'journal'; END IF;
    SELECT SUM(debit_cents), SUM(credit_cents), count(*) INTO v_d, v_c, v_lines FROM public.journal_entry_lines WHERE journal_entry_id = v_je;
    IF v_d <> v_c THEN RAISE EXCEPTION 'proof: POS entry unbalanced % / %', v_d, v_c; END IF;
    -- revenue 25 %: 18500; VAT 25 %: 4625; revenue 12 %: 5000; VAT 12 %: 600; tips 1000; cash 23125; card 6600; difference 125
    IF NOT EXISTS (SELECT 1 FROM public.journal_entry_lines WHERE journal_entry_id = v_je AND credit_cents = 18500) THEN RAISE EXCEPTION 'proof: 25 %% revenue 18500 missing'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.journal_entry_lines WHERE journal_entry_id = v_je AND credit_cents = 5000 AND account_code = public.account_for_or('sales_revenue_12','sales_revenue')) THEN RAISE EXCEPTION 'proof: 12 %% revenue 5000 missing'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.journal_entry_lines WHERE journal_entry_id = v_je AND debit_cents = 23125 AND account_code = public.account_for_or('cash_register','bank')) THEN RAISE EXCEPTION 'proof: cash 23125 missing'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.journal_entry_lines WHERE journal_entry_id = v_je AND debit_cents = 125 AND account_code = public.account_for('cash_difference')) THEN RAISE EXCEPTION 'proof: cash difference 125 missing'; END IF;
    IF (public.pos_session_journal(v_sess)->>'skipped') IS NULL THEN RAISE EXCEPTION 'proof: session booked twice'; END IF;
    -- a receipt invoice for a settled sale books nothing more
    v_r := public.pos_sale_to_invoice((v_sale->>'sale_id')::uuid, 'Proof', 'proof@example.test', 30);
    IF EXISTS (SELECT 1 FROM public.journal_entries WHERE invoice_id = (v_r->>'invoice_id')::uuid) THEN
      RAISE EXCEPTION 'proof: a POS receipt invoice was booked a second time';
    END IF;

    -- ── credit note mirrors the invoice ──
    INSERT INTO public.invoices (invoice_number, invoice_type, customer_email, subtotal_cents, tax_cents, total_cents, currency, status, issue_date, due_date)
      VALUES ('PROOF-CN-1', 'invoice', 'proof@example.test', 420000, 105000, 525000, 'SEK', 'sent', CURRENT_DATE, CURRENT_DATE) RETURNING id INTO v_inv;
    v_cn := public.create_credit_note(v_inv, 'proof', 125000);
    SELECT id INTO v_je FROM public.journal_entries WHERE invoice_id = (v_cn->>'credit_note_id')::uuid AND source = 'credit_note_issued';
    IF v_je IS NULL THEN RAISE EXCEPTION 'proof: credit note not booked'; END IF;
    SELECT SUM(debit_cents), SUM(credit_cents) INTO v_d, v_c FROM public.journal_entry_lines WHERE journal_entry_id = v_je;
    IF v_d <> 125000 OR v_c <> 125000 THEN RAISE EXCEPTION 'proof: credit note entry should be 125000/125000, got %/%', v_d, v_c; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.journal_entry_lines WHERE journal_entry_id = v_je AND debit_cents = 25000 AND account_code = public.account_for('vat_output')) THEN RAISE EXCEPTION 'proof: credit note VAT 25000 not reversed'; END IF;

    -- ── return: revenue and VAT reversed against the invoiced order; goods back = COGS back ──
    INSERT INTO public.orders (customer_email, status, total_cents, currency) VALUES ('proof@example.test', 'paid', 25000, 'SEK') RETURNING id INTO v_order;
    INSERT INTO public.order_items (order_id, product_id, product_name, quantity, price_cents, tax_rate_pct) VALUES (v_order, v_prod, 'proof-mug', 2, 12500, 25) RETURNING id INTO v_oi;
    INSERT INTO public.invoices (invoice_number, invoice_type, order_id, customer_email, subtotal_cents, tax_cents, total_cents, currency, status, issue_date, due_date)
      VALUES ('PROOF-ORD-1', 'invoice', v_order, 'proof@example.test', 20000, 5000, 25000, 'SEK', 'sent', CURRENT_DATE, CURRENT_DATE) RETURNING id INTO v_inv;
    INSERT INTO public.returns (order_id, status, reason) VALUES (v_order, 'approved', 'proof') RETURNING id INTO v_ret;
    INSERT INTO public.return_items (return_id, order_item_id, quantity, condition) VALUES (v_ret, v_oi, 1, 'unopened');
    v_r := public.refund_return(v_ret, 12500, 'manual', false);
    IF NOT (v_r->'ledger'->>'booked')::boolean THEN RAISE EXCEPTION 'proof: refund not booked: %', v_r->'ledger'; END IF;
    IF (v_r->'ledger'->>'vat_cents')::int <> 2500 OR (v_r->'ledger'->>'net_cents')::int <> 10000 THEN RAISE EXCEPTION 'proof: refund split should be 10000 + 2500, got %', v_r->'ledger'; END IF;
    -- the restocked mug books inventory back and COGS out
    UPDATE public.returns SET status = 'received' WHERE id = v_ret;
    PERFORM public.inspect_return(v_ret, 'proof', NULL);
    IF NOT EXISTS (SELECT 1 FROM public.stock_moves m WHERE m.product_id = v_prod AND m.move_type = 'in' AND m.notes LIKE 'rma_restock%') THEN
      RAISE EXCEPTION 'proof: restock move missing';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.journal_entries WHERE source = 'inventory_return') THEN RAISE EXCEPTION 'proof: goods back on the shelf booked no COGS reversal'; END IF;

    RAISE EXCEPTION 'proof-rollback';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'proof-rollback' THEN RAISE; END IF;
  END;
END $proof$;
