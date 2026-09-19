-- Inköpets tre dörrar: ändringen, dispyten, krediten.
--
-- Paritetsrundan 2026-09-19. Tre förmågor i inköp hade tabell och panel men
-- ingen dörr: en agent kunde inte ändra en rad på en skickad order (skillen
-- vägrade `lines` och hänvisade till redigeraren), inte läsa eller sätta ett
-- leverantörsbetyg, och inte öppna en dispyt eller ta emot en kreditnota.
--
-- Och bakom panelen låg en tyst lögn: "Apply" på en kreditnota satte
-- status = 'applied' — ingenting bokades (journal_entry_id förblev tom), och
-- pay_vendor_invoice betalade fakturans HELA belopp oavsett kredit. En
-- krediterad faktura betalades alltså fullt ut, och skulden i huvudboken
-- minskade aldrig med krediten.
--
--   1. amend_purchase_order   — ändringen och revisionen i EN transaktion,
--                               under orderns lås; mottagen kvantitet är golv.
--   2. vendor_scorecard / rate_vendor
--   3. open_vendor_dispute / resolve_vendor_dispute
--   4. issue_vendor_credit_memo / apply_vendor_credit_memo — krediten bokas
--      (D leverantörsskuld, K ingående moms i fakturans proportion, K kostnad
--      eller prisdifferens), och tabellen vägrar 'applied' utan verifikation:
--      regeln bor på tabellen, så panelen, generisk CRUD och service-rollen lyder.
--   5. pay_vendor_invoice     — låser fakturan, vägrar under öppen dispyt och
--                               betalar totalen minus tillämpade krediter.
--
-- Flottan förkontrollerad läsande 2026-09-19: pay_vendor_invoice har samma
-- kropp på alla sju instanser (md5 df46929a…), och de tre tabellerna är tomma
-- överallt — inget befintligt data berörs.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Ändringen
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.po_snapshot(p_purchase_order_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'status', po.status::text,
    'expected_delivery', po.expected_delivery,
    'notes', po.notes,
    'subtotal_cents', po.subtotal_cents,
    'tax_cents', po.tax_cents,
    'total_cents', po.total_cents,
    'currency', po.currency,
    'lines', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'line_id', l.id, 'product_id', l.product_id, 'description', l.description,
               'quantity', l.quantity, 'unit_price_cents', l.unit_price_cents,
               'tax_rate', l.tax_rate, 'total_cents', l.total_cents,
               'received_quantity', l.received_quantity)
             ORDER BY l.created_at, l.id)
        FROM public.purchase_order_lines l WHERE l.purchase_order_id = po.id), '[]'::jsonb))
    FROM public.purchase_orders po WHERE po.id = p_purchase_order_id;
$function$;

CREATE OR REPLACE FUNCTION public.amend_purchase_order(
  p_purchase_order_id uuid,
  p_reason text,
  p_lines jsonb DEFAULT NULL,
  p_expected_delivery date DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_po public.purchase_orders;
  v_prev jsonb;
  v_next jsonb;
  v_el jsonb;
  v_line public.purchase_order_lines;
  v_qty numeric;
  v_price bigint;
  v_rate numeric;
  v_rev integer;
  v_rev_id uuid;
  v_prev_total bigint;
  v_new_total bigint;
  v_chain uuid;
  v_first_step integer;
  v_covered bigint;
  v_request uuid;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'purchasing')) THEN
    RAISE EXCEPTION 'Requires the purchasing module — an admin can grant it under Users → Role Permissions';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
    RETURN jsonb_build_object('success', false, 'error',
      'p_reason is required — an amendment without a reason is a change nobody can explain afterwards.');
  END IF;

  -- Orderns lås: revisionsnumret och totalen räknas under det, så två
  -- samtidiga ändringar blir två revisioner i följd, aldrig samma nummer.
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_purchase_order_id FOR UPDATE;
  IF v_po.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Purchase order not found');
  END IF;
  IF v_po.status::text IN ('received', 'cancelled') THEN
    RETURN jsonb_build_object('success', false, 'error',
      format('Purchase order %s is %s — it can no longer be amended. Create a new order for further quantities.',
             v_po.po_number, v_po.status::text));
  END IF;

  v_prev := public.po_snapshot(v_po.id);
  v_prev_total := COALESCE(v_po.total_cents, 0);

  IF p_lines IS NOT NULL THEN
    IF jsonb_typeof(p_lines) <> 'array' THEN
      RETURN jsonb_build_object('success', false, 'error',
        'p_lines must be an array of {line_id?, product_id?, description?, quantity?, unit_price_cents?, tax_rate?, remove?}');
    END IF;
    FOR v_el IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
      IF v_el ? 'line_id' AND NULLIF(v_el->>'line_id', '') IS NOT NULL THEN
        SELECT * INTO v_line FROM public.purchase_order_lines
         WHERE id = (v_el->>'line_id')::uuid AND purchase_order_id = v_po.id;
        IF v_line.id IS NULL THEN
          RAISE EXCEPTION 'Line % does not belong to purchase order % — read the lines with update_purchase_order action:"get" first.',
            v_el->>'line_id', v_po.po_number USING ERRCODE = 'P0001';
        END IF;
        IF COALESCE((v_el->>'remove')::boolean, false) THEN
          IF COALESCE(v_line.received_quantity, 0) > 0 THEN
            RAISE EXCEPTION 'Line "%" has % already received — it cannot be removed. Lower the quantity to what was received instead.',
              v_line.description, v_line.received_quantity USING ERRCODE = 'P0001';
          END IF;
          DELETE FROM public.purchase_order_lines WHERE id = v_line.id;
          CONTINUE;
        END IF;
        v_qty := COALESCE((v_el->>'quantity')::numeric, v_line.quantity);
        v_price := COALESCE((v_el->>'unit_price_cents')::bigint, v_line.unit_price_cents);
        v_rate := COALESCE((v_el->>'tax_rate')::numeric, v_line.tax_rate);
        IF v_qty <= 0 THEN
          RAISE EXCEPTION 'Quantity must be positive — to drop line "%" send remove:true.', v_line.description USING ERRCODE = 'P0001';
        END IF;
        IF v_qty < COALESCE(v_line.received_quantity, 0) THEN
          RAISE EXCEPTION 'Line "%": quantity % is below the % already received.',
            v_line.description, v_qty, v_line.received_quantity USING ERRCODE = 'P0001';
        END IF;
        IF v_price < 0 THEN
          RAISE EXCEPTION 'unit_price_cents cannot be negative.' USING ERRCODE = 'P0001';
        END IF;
        UPDATE public.purchase_order_lines
           SET quantity = v_qty, unit_price_cents = v_price, tax_rate = v_rate,
               description = COALESCE(NULLIF(v_el->>'description', ''), description),
               total_cents = round(v_qty * v_price)
         WHERE id = v_line.id;
      ELSE
        -- En ny rad. Priset gissas aldrig: en rad till noll kronor släpper in
        -- varan i lagret utan kostnad.
        IF (v_el->>'unit_price_cents') IS NULL THEN
          RAISE EXCEPTION 'A new line needs unit_price_cents — a price is never guessed.' USING ERRCODE = 'P0001';
        END IF;
        v_qty := COALESCE((v_el->>'quantity')::numeric, 1);
        v_price := (v_el->>'unit_price_cents')::bigint;
        IF v_qty <= 0 OR v_price < 0 THEN
          RAISE EXCEPTION 'A new line needs a positive quantity and a non-negative unit_price_cents.' USING ERRCODE = 'P0001';
        END IF;
        IF NULLIF(v_el->>'description', '') IS NULL AND NULLIF(v_el->>'product_id', '') IS NULL THEN
          RAISE EXCEPTION 'A new line needs a description or a product_id.' USING ERRCODE = 'P0001';
        END IF;
        -- Momssatsen ärvs från ordern när den inte anges: en order har en
        -- momsbild, och tabellens default vet ingenting om den.
        v_rate := COALESCE((v_el->>'tax_rate')::numeric,
                           (SELECT l.tax_rate FROM public.purchase_order_lines l
                             WHERE l.purchase_order_id = v_po.id ORDER BY l.created_at LIMIT 1));
        INSERT INTO public.purchase_order_lines
          (purchase_order_id, product_id, description, quantity, unit_price_cents, tax_rate, total_cents)
        VALUES (v_po.id, NULLIF(v_el->>'product_id', '')::uuid,
                COALESCE(NULLIF(v_el->>'description', ''),
                         (SELECT p.name FROM public.products p WHERE p.id = NULLIF(v_el->>'product_id', '')::uuid)),
                v_qty, v_price, COALESCE(v_rate, 0), round(v_qty * v_price));
      END IF;
    END LOOP;

    IF NOT EXISTS (SELECT 1 FROM public.purchase_order_lines WHERE purchase_order_id = v_po.id) THEN
      RAISE EXCEPTION 'An order must keep at least one line — cancel the order instead of emptying it.' USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.purchase_orders po
       SET subtotal_cents = t.subtotal, tax_cents = t.tax, total_cents = t.subtotal + t.tax
      FROM (SELECT COALESCE(SUM(l.total_cents), 0)::bigint AS subtotal,
                   COALESCE(SUM(round(l.total_cents * COALESCE(l.tax_rate, 0) / 100.0)), 0)::bigint AS tax
              FROM public.purchase_order_lines l WHERE l.purchase_order_id = v_po.id) t
     WHERE po.id = v_po.id;
  END IF;

  IF p_expected_delivery IS NOT NULL OR p_notes IS NOT NULL THEN
    UPDATE public.purchase_orders
       SET expected_delivery = COALESCE(p_expected_delivery, expected_delivery),
           notes = COALESCE(p_notes, notes)
     WHERE id = v_po.id;
  END IF;

  v_next := public.po_snapshot(v_po.id);
  IF v_next = v_prev THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Nothing changed — the order already reads exactly like that. No revision was recorded.',
      'purchase_order_id', v_po.id);
  END IF;
  v_new_total := COALESCE((v_next->>'total_cents')::bigint, 0);

  -- Beloppet växte: ett godkännande av ett lägre belopp täcker inte det nya.
  IF v_new_total > v_prev_total THEN
    SELECT c.id, min(s.sort_order) INTO v_chain, v_first_step
      FROM public.approval_chains c JOIN public.approval_steps s ON s.chain_id = c.id
     WHERE c.entity_type = 'purchase_order' AND c.is_active
     GROUP BY c.id ORDER BY c.id LIMIT 1;
    IF v_chain IS NOT NULL THEN
      SELECT id INTO v_request FROM public.approval_requests
       WHERE entity_type = 'purchase_order' AND entity_id = v_po.id::text
         AND chain_id = v_chain AND status = 'pending'
       ORDER BY created_at DESC LIMIT 1;
      IF v_request IS NULL THEN
        SELECT COALESCE(max(amount_cents), -1) INTO v_covered FROM public.approval_requests
         WHERE entity_type = 'purchase_order' AND entity_id = v_po.id::text
           AND chain_id = v_chain AND status = 'approved';
        -- En order som aldrig behövt godkännas (utkast) prövas av skicka-grinden;
        -- en som godkänts för ett lägre belopp prövas om här.
        IF v_covered >= 0 AND v_covered < v_new_total THEN
          INSERT INTO public.approval_requests
            (entity_type, entity_id, amount_cents, reason, chain_id, current_step, requested_by, step_entered_at)
          VALUES ('purchase_order', v_po.id::text, v_new_total,
                  format('PO amendment (+%s): %s', round((v_new_total - v_prev_total) / 100.0, 2), btrim(p_reason)),
                  v_chain, v_first_step, auth.uid(), now())
          RETURNING id INTO v_request;
        END IF;
      END IF;
    END IF;
  END IF;

  SELECT COALESCE(max(revision_number), 0) + 1 INTO v_rev
    FROM public.purchase_order_revisions WHERE purchase_order_id = v_po.id;
  INSERT INTO public.purchase_order_revisions
    (purchase_order_id, revision_number, reason, snapshot, prev_total_cents, new_total_cents,
     amount_delta_cents, approval_request_id, created_by)
  VALUES (v_po.id, v_rev, btrim(p_reason), jsonb_build_object('prev', v_prev, 'next', v_next),
          v_prev_total, v_new_total, v_new_total - v_prev_total, v_request, auth.uid())
  RETURNING id INTO v_rev_id;

  RETURN jsonb_build_object(
    'success', true,
    'purchase_order_id', v_po.id, 'po_number', v_po.po_number,
    'revision_id', v_rev_id, 'revision_number', v_rev,
    'prev_total_cents', v_prev_total, 'new_total_cents', v_new_total,
    'amount_delta_cents', v_new_total - v_prev_total,
    'approval_request_id', v_request,
    'note', CASE WHEN v_request IS NOT NULL
                 THEN 'The amount grew past what was approved — a new approval request is pending (advance_approval_step).'
                 WHEN v_po.status::text <> 'draft'
                 THEN 'The vendor already holds the earlier version — send them the amended order.'
            END,
    'order', v_next);
END;
$function$;

CREATE OR REPLACE FUNCTION public.list_po_revisions(p_purchase_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'purchasing')) THEN
    RAISE EXCEPTION 'Requires the purchasing module — an admin can grant it under Users → Role Permissions';
  END IF;
  RETURN jsonb_build_object('success', true, 'purchase_order_id', p_purchase_order_id,
    'revisions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'revision_id', r.id, 'revision_number', r.revision_number, 'reason', r.reason,
               'prev_total_cents', r.prev_total_cents, 'new_total_cents', r.new_total_cents,
               'amount_delta_cents', r.amount_delta_cents, 'approval_request_id', r.approval_request_id,
               'created_at', r.created_at, 'snapshot', r.snapshot)
             ORDER BY r.revision_number DESC)
        FROM public.purchase_order_revisions r WHERE r.purchase_order_id = p_purchase_order_id), '[]'::jsonb));
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Leverantörsbetyget
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.vendor_scorecard(p_vendor_id uuid DEFAULT NULL, p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'purchasing')) THEN
    RAISE EXCEPTION 'Requires the purchasing module — an admin can grant it under Users → Role Permissions';
  END IF;
  RETURN jsonb_build_object('success', true,
    'vendors', COALESCE((
      SELECT jsonb_agg(to_jsonb(x))
        FROM (SELECT s.*
                FROM public.v_vendor_scorecard s
               WHERE p_vendor_id IS NULL OR s.vendor_id = p_vendor_id
               ORDER BY s.po_count DESC, s.name
               LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 500))) x), '[]'::jsonb),
    'note', 'on_time_pct is NULL until an order with an expected delivery date has been received — no deliveries is not a bad score.');
END;
$function$;

CREATE OR REPLACE FUNCTION public.rate_vendor(p_vendor_id uuid, p_rating numeric DEFAULT NULL, p_notes text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_name text;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'purchasing')) THEN
    RAISE EXCEPTION 'Requires the purchasing module — an admin can grant it under Users → Role Permissions';
  END IF;
  IF p_rating IS NOT NULL AND (p_rating < 0 OR p_rating > 5) THEN
    RETURN jsonb_build_object('success', false, 'error', 'p_rating is 0–5 (or null to clear the manual rating).');
  END IF;
  UPDATE public.vendors SET manual_rating = p_rating, rating_notes = COALESCE(p_notes, rating_notes)
   WHERE id = p_vendor_id RETURNING name INTO v_name;
  IF v_name IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Vendor not found');
  END IF;
  RETURN jsonb_build_object('success', true, 'vendor_id', p_vendor_id, 'name', v_name,
                            'manual_rating', p_rating, 'rating_notes', (SELECT rating_notes FROM public.vendors WHERE id = p_vendor_id));
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Dispyten
-- ─────────────────────────────────────────────────────────────────────────
-- En faktura har högst EN öppen dispyt. Indexet är låset: två samtidiga
-- öppningar blir en dispyt och en unik-krock, aldrig två.
CREATE UNIQUE INDEX IF NOT EXISTS vendor_invoice_disputes_one_open
  ON public.vendor_invoice_disputes (vendor_invoice_id) WHERE status = 'open';

CREATE OR REPLACE FUNCTION public.open_vendor_dispute(
  p_vendor_invoice_id uuid, p_reason text, p_disputed_amount_cents bigint DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inv public.vendor_invoices;
  v_id uuid;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'purchasing')) THEN
    RAISE EXCEPTION 'Requires the purchasing module — an admin can grant it under Users → Role Permissions';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
    RETURN jsonb_build_object('success', false, 'error', 'p_reason is required — say what is wrong with the bill.');
  END IF;
  SELECT * INTO v_inv FROM public.vendor_invoices WHERE id = p_vendor_invoice_id FOR UPDATE;
  IF v_inv.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Vendor invoice not found');
  END IF;
  IF p_disputed_amount_cents IS NOT NULL
     AND (p_disputed_amount_cents <= 0 OR p_disputed_amount_cents > COALESCE(v_inv.total_cents, 0)) THEN
    RETURN jsonb_build_object('success', false, 'error',
      format('p_disputed_amount_cents must be between 1 and the invoice total (%s).', v_inv.total_cents));
  END IF;
  SELECT id INTO v_id FROM public.vendor_invoice_disputes
   WHERE vendor_invoice_id = v_inv.id AND status = 'open';
  IF v_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'already_open', true, 'dispute_id', v_id, 'vendor_invoice_id', v_inv.id);
  END IF;
  INSERT INTO public.vendor_invoice_disputes (vendor_invoice_id, reason, status, disputed_amount_cents, opened_by)
  VALUES (v_inv.id, btrim(p_reason), 'open', p_disputed_amount_cents, auth.uid())
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('success', true, 'dispute_id', v_id, 'vendor_invoice_id', v_inv.id,
    'invoice_number', v_inv.invoice_number, 'disputed_amount_cents', p_disputed_amount_cents,
    'payment_held', v_inv.paid_at IS NULL,
    'note', CASE WHEN v_inv.paid_at IS NULL
                 THEN 'pay_vendor_invoice refuses this bill until the dispute is resolved (resolve_vendor_dispute).'
                 ELSE 'The bill is already paid — a credit from the vendor is issued against the vendor, not this bill.' END);
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Krediten
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.apply_vendor_credit_memo(p_credit_memo_id uuid, p_entry_date date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_memo public.vendor_credit_memos;
  v_inv public.vendor_invoices;
  v_applied bigint := 0;
  v_tax bigint := 0;
  v_net bigint;
  v_ap text;
  v_vat text;
  v_other text;
  v_label text;
  v_je uuid;
  v_date date;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'purchasing')) THEN
    RAISE EXCEPTION 'Requires the purchasing module — an admin can grant it under Users → Role Permissions';
  END IF;
  SELECT * INTO v_memo FROM public.vendor_credit_memos WHERE id = p_credit_memo_id FOR UPDATE;
  IF v_memo.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Credit memo not found');
  END IF;
  IF v_memo.journal_entry_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'already_applied', true, 'credit_memo_id', v_memo.id,
                              'journal_entry_id', v_memo.journal_entry_id);
  END IF;
  IF v_memo.status <> 'issued' THEN
    RETURN jsonb_build_object('success', false, 'error',
      format('Credit memo %s is %s — only an issued memo can be applied.', v_memo.credit_number, v_memo.status));
  END IF;

  IF v_memo.vendor_invoice_id IS NOT NULL THEN
    -- Fakturans lås: krediternas summa räknas under det.
    SELECT * INTO v_inv FROM public.vendor_invoices WHERE id = v_memo.vendor_invoice_id FOR UPDATE;
    IF v_inv.paid_at IS NOT NULL THEN
      RETURN jsonb_build_object('success', false, 'error',
        format('Invoice %s is already paid — there is no debt left on it to reduce. Issue the credit against the vendor (omit p_vendor_invoice_id): it then stands as a claim on the vendor in accounts payable.', v_inv.invoice_number));
    END IF;
    SELECT COALESCE(SUM(amount_cents), 0) INTO v_applied FROM public.vendor_credit_memos
     WHERE vendor_invoice_id = v_inv.id AND status = 'applied';
    IF v_applied + v_memo.amount_cents > COALESCE(v_inv.total_cents, 0) THEN
      RETURN jsonb_build_object('success', false, 'error',
        format('Credit %s would exceed invoice %s: total %s, already credited %s, room left %s.',
               v_memo.amount_cents, v_inv.invoice_number, v_inv.total_cents, v_applied,
               GREATEST(COALESCE(v_inv.total_cents, 0) - v_applied, 0)));
    END IF;
    -- Momsen följer fakturans proportion: en kredit på en faktura med 25 %
    -- moms är en kredit på både nettot och momsen.
    IF COALESCE(v_inv.total_cents, 0) > 0 AND COALESCE(v_inv.tax_cents, 0) > 0 THEN
      v_tax := round(v_memo.amount_cents::numeric * v_inv.tax_cents / v_inv.total_cents);
    END IF;
  END IF;

  v_net := v_memo.amount_cents - v_tax;
  v_ap := public.account_for('accounts_payable');
  v_vat := public.account_for('vat_input');
  IF v_inv.purchase_order_id IS NOT NULL THEN
    v_other := public.account_for('purchase_price_variance');
    v_label := 'Kreditnota — prisdifferens mot order';
  ELSE
    v_other := public.account_for('expense_default');
    v_label := 'Kreditnota från leverantör';
  END IF;
  v_date := COALESCE(p_entry_date, v_memo.credit_date, CURRENT_DATE);

  INSERT INTO public.journal_entries (entry_date, description, reference_number, status, source, vendor_id)
  VALUES (v_date, 'Kreditnota ' || v_memo.credit_number
            || COALESCE(' mot faktura ' || v_inv.invoice_number, ''),
          v_memo.id::text, 'posted', 'vendor_credit_memo', v_memo.vendor_id)
  RETURNING id INTO v_je;

  INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
  VALUES (v_je, v_ap, v_memo.amount_cents, 0, 'Minskad leverantörsskuld');
  IF v_tax > 0 THEN
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_je, v_vat, 0, v_tax, 'Återförd ingående moms');
  END IF;
  IF v_net > 0 THEN
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_je, v_other, 0, v_net, v_label);
  END IF;

  PERFORM set_config('flowwink.credit_memo_apply', v_memo.id::text, true);
  UPDATE public.vendor_credit_memos
     SET status = 'applied', applied_at = now(), journal_entry_id = v_je
   WHERE id = v_memo.id;
  PERFORM set_config('flowwink.credit_memo_apply', '', true);

  RETURN jsonb_build_object('success', true, 'credit_memo_id', v_memo.id, 'credit_number', v_memo.credit_number,
    'journal_entry_id', v_je, 'entry_date', v_date, 'amount_cents', v_memo.amount_cents,
    'net_cents', v_net, 'vat_cents', v_tax, 'payable_account', v_ap,
    'offset_account', CASE WHEN v_net > 0 THEN v_other END,
    'vendor_invoice_id', v_inv.id,
    'invoice_left_to_pay_cents', CASE WHEN v_inv.id IS NOT NULL
                                      THEN v_inv.total_cents - v_applied - v_memo.amount_cents END);
END;
$function$;

CREATE OR REPLACE FUNCTION public.issue_vendor_credit_memo(
  p_amount_cents bigint,
  p_reason text,
  p_vendor_invoice_id uuid DEFAULT NULL,
  p_vendor_id uuid DEFAULT NULL,
  p_dispute_id uuid DEFAULT NULL,
  p_credit_number text DEFAULT NULL,
  p_credit_date date DEFAULT NULL,
  p_apply boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inv public.vendor_invoices;
  v_vendor uuid := p_vendor_id;
  v_currency text;
  v_id uuid;
  v_number text;
  v_applied jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'purchasing')) THEN
    RAISE EXCEPTION 'Requires the purchasing module — an admin can grant it under Users → Role Permissions';
  END IF;
  IF COALESCE(p_amount_cents, 0) <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'p_amount_cents must be positive (gross, VAT included).');
  END IF;
  IF p_vendor_invoice_id IS NOT NULL THEN
    SELECT * INTO v_inv FROM public.vendor_invoices WHERE id = p_vendor_invoice_id;
    IF v_inv.id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Vendor invoice not found');
    END IF;
    IF v_vendor IS NOT NULL AND v_vendor <> v_inv.vendor_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'p_vendor_id is not the vendor of that invoice.');
    END IF;
    v_vendor := v_inv.vendor_id;
    v_currency := v_inv.currency;
  END IF;
  IF v_vendor IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Send p_vendor_invoice_id (credit against a bill) or p_vendor_id (credit against the vendor).');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = v_vendor) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Vendor not found');
  END IF;
  IF v_currency IS NULL THEN
    SELECT currency INTO v_currency FROM public.vendors WHERE id = v_vendor;
  END IF;

  -- Leverantörens eget kreditnotanummer är identiteten: samma nummer två
  -- gånger är samma kreditnota, inte två.
  IF NULLIF(btrim(p_credit_number), '') IS NOT NULL THEN
    SELECT id INTO v_id FROM public.vendor_credit_memos WHERE credit_number = btrim(p_credit_number);
    IF v_id IS NOT NULL THEN
      RETURN jsonb_build_object('success', true, 'already_exists', true, 'credit_memo_id', v_id,
                                'credit_number', btrim(p_credit_number));
    END IF;
    v_number := btrim(p_credit_number);
  ELSE
    v_number := 'CM-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  END IF;

  INSERT INTO public.vendor_credit_memos
    (credit_number, vendor_id, vendor_invoice_id, dispute_id, credit_date, amount_cents, reason, status, created_by, currency)
  VALUES (v_number, v_vendor, p_vendor_invoice_id, p_dispute_id, COALESCE(p_credit_date, CURRENT_DATE),
          p_amount_cents, p_reason, 'issued', auth.uid(), COALESCE(v_currency, public.platform_default_currency()))
  RETURNING id INTO v_id;

  IF COALESCE(p_apply, true) THEN
    v_applied := public.apply_vendor_credit_memo(v_id, p_credit_date);
    IF NOT COALESCE((v_applied->>'success')::boolean, false) THEN
      -- En kreditnota som inte gick att tillämpa ska inte stå kvar som ett
      -- löfte: hela utfärdandet rullas tillbaka med orsaken.
      RAISE EXCEPTION '%', v_applied->>'error' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'credit_memo_id', v_id, 'credit_number', v_number,
    'vendor_id', v_vendor, 'vendor_invoice_id', p_vendor_invoice_id, 'amount_cents', p_amount_cents,
    'status', CASE WHEN COALESCE(p_apply, true) THEN 'applied' ELSE 'issued' END,
    'booking', v_applied);
END;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_vendor_dispute(
  p_dispute_id uuid,
  p_resolution text,
  p_outcome text DEFAULT 'resolved',
  p_credit_amount_cents bigint DEFAULT NULL,
  p_credit_number text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_d public.vendor_invoice_disputes;
  v_credit jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'purchasing')) THEN
    RAISE EXCEPTION 'Requires the purchasing module — an admin can grant it under Users → Role Permissions';
  END IF;
  IF p_outcome NOT IN ('resolved', 'cancelled') THEN
    RETURN jsonb_build_object('success', false, 'error', 'p_outcome is "resolved" or "cancelled".');
  END IF;
  IF p_resolution IS NULL OR length(btrim(p_resolution)) < 3 THEN
    RETURN jsonb_build_object('success', false, 'error', 'p_resolution is required — say how it ended.');
  END IF;
  SELECT * INTO v_d FROM public.vendor_invoice_disputes WHERE id = p_dispute_id FOR UPDATE;
  IF v_d.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Dispute not found');
  END IF;
  IF v_d.status <> 'open' THEN
    RETURN jsonb_build_object('success', true, 'already_closed', true, 'dispute_id', v_d.id, 'status', v_d.status);
  END IF;
  IF p_credit_amount_cents IS NOT NULL AND p_outcome = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'A cancelled dispute carries no credit — resolve it instead.');
  END IF;

  IF p_credit_amount_cents IS NOT NULL THEN
    v_credit := public.issue_vendor_credit_memo(p_credit_amount_cents, btrim(p_resolution),
                                                v_d.vendor_invoice_id, NULL, v_d.id, p_credit_number, NULL, true);
  END IF;

  UPDATE public.vendor_invoice_disputes
     SET status = p_outcome, resolution = btrim(p_resolution), resolved_by = auth.uid(), resolved_at = now()
   WHERE id = v_d.id;

  RETURN jsonb_build_object('success', true, 'dispute_id', v_d.id, 'status', p_outcome,
    'vendor_invoice_id', v_d.vendor_invoice_id, 'credit', v_credit,
    'note', 'The bill can be paid again — pay_vendor_invoice pays the total minus applied credits.');
END;
$function$;

-- Regeln på tabellen: 'applied' betyder bokad. Panelen satte statusen för hand.
CREATE OR REPLACE FUNCTION public.vendor_credit_memo_applied_means_booked()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'applied' THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.amount_cents IS DISTINCT FROM OLD.amount_cents
       OR NEW.journal_entry_id IS DISTINCT FROM OLD.journal_entry_id
       OR NEW.vendor_invoice_id IS DISTINCT FROM OLD.vendor_invoice_id
       OR NEW.vendor_id IS DISTINCT FROM OLD.vendor_id THEN
      RAISE EXCEPTION 'Credit memo % is applied and booked (journal entry %) — it is final. Correct it with a new memo or a reversing journal entry.',
        OLD.credit_number, OLD.journal_entry_id USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.status = 'applied'
     AND COALESCE(current_setting('flowwink.credit_memo_apply', true), '') <> NEW.id::text THEN
    RAISE EXCEPTION 'A credit memo becomes applied by being booked — call apply_vendor_credit_memo(%). Setting the status by hand reduces no debt.',
      NEW.id USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS vendor_credit_memo_applied_means_booked ON public.vendor_credit_memos;
CREATE TRIGGER vendor_credit_memo_applied_means_booked
  BEFORE INSERT OR UPDATE ON public.vendor_credit_memos
  FOR EACH ROW EXECUTE FUNCTION public.vendor_credit_memo_applied_means_booked();

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Betalningen
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pay_vendor_invoice(p_vendor_invoice_id uuid, p_pay_date date DEFAULT CURRENT_DATE, p_bank_account text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inv public.vendor_invoices;
  v_je_id uuid;
  v_ap text;
  v_dispute uuid;
  v_credited bigint := 0;
  v_pay bigint;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'purchasing')) THEN
    RAISE EXCEPTION 'Requires the purchasing module — an admin can grant it under Users → Role Permissions';
  END IF;

  p_bank_account := COALESCE(p_bank_account, public.account_for('bank'));
  v_ap := public.account_for('accounts_payable');
  -- Fakturans lås: två samtidiga betalningar blir en betalning och ett
  -- "already paid", aldrig två utbetalningar.
  SELECT * INTO v_inv FROM public.vendor_invoices WHERE id = p_vendor_invoice_id FOR UPDATE;
  IF v_inv.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Vendor invoice not found');
  END IF;
  IF v_inv.paid_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Vendor invoice already paid', 'paid_at', v_inv.paid_at);
  END IF;
  IF COALESCE(v_inv.total_cents, 0) <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Vendor invoice has no positive total');
  END IF;

  SELECT id INTO v_dispute FROM public.vendor_invoice_disputes
   WHERE vendor_invoice_id = v_inv.id AND status = 'open' LIMIT 1;
  IF v_dispute IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'dispute_id', v_dispute,
      'error', format('Invoice %s is under dispute — paying it now is the mistake the dispute exists to prevent. Close it with resolve_vendor_dispute (with p_credit_amount_cents when the vendor credits part of it), then pay.', v_inv.invoice_number));
  END IF;

  SELECT COALESCE(SUM(amount_cents), 0) INTO v_credited FROM public.vendor_credit_memos
   WHERE vendor_invoice_id = v_inv.id AND status = 'applied';
  v_pay := v_inv.total_cents - v_credited;

  IF v_pay > 0 THEN
    INSERT INTO public.journal_entries (entry_date, description, status, source, vendor_id)
    VALUES (p_pay_date, 'Betalning leverantörsfaktura ' || COALESCE(v_inv.invoice_number, ''), 'posted', 'vendor_payment', v_inv.vendor_id)
    RETURNING id INTO v_je_id;

    -- account_name is auto-filled by the fill_journal_line_account_name trigger.
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description) VALUES
      (v_je_id, v_ap, v_pay, 0, 'Leverantörsskuld'),
      (v_je_id, p_bank_account, 0, v_pay, 'Utbetalning');
  END IF;

  UPDATE public.vendor_invoices SET status = 'paid', paid_at = p_pay_date WHERE id = v_inv.id;

  RETURN jsonb_build_object(
    'success', true, 'vendor_invoice_id', v_inv.id, 'journal_entry_id', v_je_id,
    'total_cents', v_inv.total_cents, 'credited_cents', v_credited, 'paid_cents', GREATEST(v_pay, 0),
    'paid_at', p_pay_date, 'bank_account', p_bank_account, 'payable_account', v_ap,
    'note', CASE WHEN v_credited > 0 AND v_pay > 0 THEN 'Paid the total minus applied credit memos.'
                 WHEN v_pay <= 0 THEN 'Fully settled by credit memos — nothing left the bank.' END
  );
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- 5b. Matchningen räknar med krediten
-- ─────────────────────────────────────────────────────────────────────────
-- Betalningsgrinden råder vid överfakturering: "register a vendor credit memo".
-- Men matchningen läste fakturans subtotal rakt av, så krediten ändrade aldrig
-- utfallet och rådet kunde inte fungera. En fakturas anspråk är dess netto
-- minus nettot av de krediter som tillämpats på den — för fakturan själv och
-- för dess syskon på samma order.
CREATE OR REPLACE FUNCTION public.vendor_invoice_credited_net_cents(p_vendor_invoice_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(SUM(m.amount_cents
           - CASE WHEN COALESCE(vi.total_cents, 0) > 0 AND COALESCE(vi.tax_cents, 0) > 0
                  THEN round(m.amount_cents::numeric * vi.tax_cents / vi.total_cents) ELSE 0 END), 0)::bigint
    FROM public.vendor_credit_memos m
    JOIN public.vendor_invoices vi ON vi.id = m.vendor_invoice_id
   WHERE m.vendor_invoice_id = p_vendor_invoice_id AND m.status = 'applied';
$function$;
REVOKE ALL ON FUNCTION public.vendor_invoice_credited_net_cents(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendor_invoice_credited_net_cents(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.po_invoiced_value_cents(p_purchase_order_id uuid, p_exclude_invoice_id uuid DEFAULT NULL::uuid)
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(SUM(vi.subtotal_cents - public.vendor_invoice_credited_net_cents(vi.id)), 0)::bigint
    FROM public.vendor_invoices vi
   WHERE vi.purchase_order_id = p_purchase_order_id
     AND (p_exclude_invoice_id IS NULL OR vi.id <> p_exclude_invoice_id)
     AND vi.status NOT IN ('rejected', 'cancelled');
$function$;
REVOKE ALL ON FUNCTION public.po_invoiced_value_cents(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.po_invoiced_value_cents(uuid, uuid) TO authenticated, service_role;

DO $patch$
DECLARE
  v_def text;
  v_anchor text := 'IF NOT FOUND THEN RAISE EXCEPTION ''Invoice % not found'', p_invoice_id; END IF;';
BEGIN
  v_def := pg_get_functiondef('public.vendor_invoice_match_eval(uuid,numeric)'::regprocedure);
  IF position('credits-count 20260920010000' in v_def) > 0 THEN
    RETURN;
  END IF;
  IF position(v_anchor in v_def) = 0 THEN
    RAISE EXCEPTION 'anchor missing in vendor_invoice_match_eval — read the live body before patching';
  END IF;
  v_def := replace(v_def, v_anchor, v_anchor || E'\n'
    || E'  -- credits-count 20260920010000\n'
    || E'  -- Fakturans anspråk är nettot minus tillämpade krediters netto.\n'
    || E'  v_inv.subtotal_cents := v_inv.subtotal_cents - public.vendor_invoice_credited_net_cents(p_invoice_id);');
  EXECUTE v_def;
END
$patch$;

-- ─────────────────────────────────────────────────────────────────────────
-- Vem får anropa
-- ─────────────────────────────────────────────────────────────────────────
DO $grants$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.amend_purchase_order(uuid, text, jsonb, date, text)',
    'public.list_po_revisions(uuid)',
    'public.vendor_scorecard(uuid, integer)',
    'public.rate_vendor(uuid, numeric, text)',
    'public.open_vendor_dispute(uuid, text, bigint)',
    'public.resolve_vendor_dispute(uuid, text, text, bigint, text)',
    'public.issue_vendor_credit_memo(bigint, text, uuid, uuid, uuid, text, date, boolean)',
    'public.apply_vendor_credit_memo(uuid, date)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END
$grants$;

-- ─────────────────────────────────────────────────────────────────────────
-- Beviset
-- ─────────────────────────────────────────────────────────────────────────
DO $proof$
DECLARE
  v_vendor uuid; v_po uuid; v_line uuid; v_inv uuid; v_r jsonb; v_d uuid; v_je uuid;
  v_ap text; v_ap_balance bigint;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  BEGIN
    v_ap := public.account_for('accounts_payable');
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'proof skipped: no accounting locale is active on this instance (%).', SQLERRM;
    RETURN;
  END;
  IF v_ap IS NULL THEN
    RAISE NOTICE 'proof skipped: no accounts_payable role is mapped on this instance.';
    RETURN;
  END IF;

  BEGIN
    INSERT INTO public.vendors (name) VALUES ('Proof vendor 20260920010000') RETURNING id INTO v_vendor;
    INSERT INTO public.purchase_orders (vendor_id, status, subtotal_cents, tax_cents, total_cents)
    VALUES (v_vendor, 'draft', 10000, 2500, 12500) RETURNING id INTO v_po;
    INSERT INTO public.purchase_order_lines (purchase_order_id, description, quantity, unit_price_cents, tax_rate, total_cents)
    VALUES (v_po, 'Proof line', 10, 1000, 25, 10000) RETURNING id INTO v_line;

    -- Ändringen: 10 → 12 st, revision 1, totalen följer.
    v_r := public.amend_purchase_order(v_po, 'Vendor can deliver two more',
             jsonb_build_array(jsonb_build_object('line_id', v_line, 'quantity', 12)));
    IF NOT (v_r->>'success')::boolean OR (v_r->>'revision_number')::int <> 1 OR (v_r->>'new_total_cents')::bigint <> 15000 THEN
      RAISE EXCEPTION 'proof failed: amendment → %', v_r;
    END IF;
    v_r := public.amend_purchase_order(v_po, 'Same again',
             jsonb_build_array(jsonb_build_object('line_id', v_line, 'quantity', 12)));
    IF (v_r->>'success')::boolean THEN
      RAISE EXCEPTION 'proof failed: an amendment that changes nothing recorded a revision';
    END IF;

    -- Fakturan, dispyten, krediten, betalningen.
    INSERT INTO public.vendor_invoices (invoice_number, vendor_id, invoice_date, subtotal_cents, tax_cents, total_cents, status)
    VALUES ('PROOF-20260920010000', v_vendor, CURRENT_DATE, 10000, 2500, 12500, 'received') RETURNING id INTO v_inv;
    UPDATE public.vendor_invoices SET status = 'approved', approved_at = now() WHERE id = v_inv;
    -- Fakturan saknar order, så betalningsgrinden kräver en människas attest.
    INSERT INTO public.approval_requests (entity_type, entity_id, amount_cents, reason, status, resolved_at)
    VALUES ('vendor_invoice', v_inv::text, 12500, 'proof', 'approved', now());

    v_r := public.open_vendor_dispute(v_inv, 'Two units arrived broken', 2500);
    v_d := (v_r->>'dispute_id')::uuid;
    v_r := public.pay_vendor_invoice(v_inv);
    IF (v_r->>'success')::boolean THEN
      RAISE EXCEPTION 'proof failed: a disputed bill was paid';
    END IF;

    v_r := public.resolve_vendor_dispute(v_d, 'Vendor credits the two broken units', 'resolved', 2500);
    v_je := (v_r->'credit'->'booking'->>'journal_entry_id')::uuid;
    IF v_je IS NULL THEN
      RAISE EXCEPTION 'proof failed: the credit was not booked → %', v_r;
    END IF;
    IF (SELECT SUM(debit_cents) - SUM(credit_cents) FROM public.journal_entry_lines WHERE journal_entry_id = v_je) <> 0 THEN
      RAISE EXCEPTION 'proof failed: the credit memo entry does not balance';
    END IF;
    IF (v_r->'credit'->'booking'->>'vat_cents')::bigint <> 500 THEN
      RAISE EXCEPTION 'proof failed: VAT share of a 2500 credit on a 25%% bill should be 500 → %', v_r->'credit'->'booking';
    END IF;

    BEGIN
      UPDATE public.vendor_credit_memos SET amount_cents = 1 WHERE dispute_id = v_d;
      RAISE EXCEPTION 'proof failed: an applied credit memo was edited';
    EXCEPTION WHEN sqlstate 'P0001' THEN
      IF SQLERRM LIKE 'proof failed%' THEN RAISE; END IF;
    END;

    v_r := public.pay_vendor_invoice(v_inv);
    IF NOT (v_r->>'success')::boolean OR (v_r->>'paid_cents')::bigint <> 10000 THEN
      RAISE EXCEPTION 'proof failed: payment should be 12500 − 2500 = 10000 → %', v_r;
    END IF;

    -- Skulden för den här leverantören går jämnt upp: bokad 12500, krediterad 2500, betald 10000.
    SELECT COALESCE(SUM(l.credit_cents - l.debit_cents), 0) INTO v_ap_balance
      FROM public.journal_entry_lines l JOIN public.journal_entries e ON e.id = l.journal_entry_id
     WHERE e.vendor_id = v_vendor AND l.account_code = v_ap AND e.status = 'posted';
    IF v_ap_balance <> 0 THEN
      RAISE EXCEPTION 'proof failed: accounts payable for the vendor should be 0 after bill, credit and payment — is %', v_ap_balance;
    END IF;

    RAISE EXCEPTION 'proof-rollback';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'proof-rollback' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'proof passed: amendment + revision, dispute holds payment, credit booked with VAT share, payment nets the credit, payable ends at zero.';
END
$proof$;
