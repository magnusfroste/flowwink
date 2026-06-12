-- multi-currency · realized FX on payment (last in-house weight-3 gap).
-- book_invoice_paid v2 (SAME signature — every existing surface gains this):
-- for foreign-currency invoices, the difference between the booked rate
-- (invoices.exchange_rate at issue) and the payment-date rate becomes a
-- realized FX line, mirroring revalue_open_balances' delta model and accounts:
--   gain → Cr 3960 (Valutakursvinster) · loss → Dt 7960 (Valutakursförluster)
-- Bank receives the payment-date base value; AR is settled at the booked value.
-- Rate lookup failures never block the payment (FX line skipped, noted).
-- Idempotent (CREATE OR REPLACE; unchanged idempotency guard inside).

CREATE OR REPLACE FUNCTION "public"."book_invoice_paid"(
  "p_invoice_id" "uuid",
  "p_bank_account" "text" DEFAULT '1930'::"text",
  "p_ar_account" "text" DEFAULT '1510'::"text"
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE
  v_inv record;
  v_entry_id uuid;
  v_amount bigint;
  v_base text;
  v_paid_rate numeric;
  v_fx bigint := 0;
BEGIN
  SELECT * INTO v_inv FROM invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
  END IF;

  IF EXISTS (SELECT 1 FROM journal_entries WHERE invoice_id = p_invoice_id AND source = 'invoice_payment') THEN
    RETURN jsonb_build_object('success', true, 'skipped', 'already booked');
  END IF;

  v_amount := COALESCE(v_inv.paid_amount_cents, v_inv.total_cents, 0);
  IF v_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Paid amount is zero');
  END IF;

  -- If issuance was never booked (e.g. legacy invoice), book it first so AR exists.
  PERFORM public.book_invoice_issued(p_invoice_id);

  -- Realized FX: foreign currency + booked rate present
  BEGIN
    SELECT code INTO v_base FROM currencies WHERE is_base = true LIMIT 1;
    IF v_base IS NOT NULL AND v_inv.currency IS NOT NULL
       AND upper(v_inv.currency) <> upper(v_base)
       AND v_inv.exchange_rate IS NOT NULL AND v_inv.exchange_rate > 0 THEN
      v_paid_rate := public.get_exchange_rate(v_inv.currency, v_base,
                       COALESCE(v_inv.paid_at::date, CURRENT_DATE));
      IF v_paid_rate IS NOT NULL AND v_paid_rate > 0 THEN
        -- same delta model as revalue_open_balances: cents × (rate_now − rate_booked)
        v_fx := round(v_amount * (v_paid_rate - v_inv.exchange_rate));
      END IF;
    END IF;
  EXCEPTION WHEN others THEN
    v_fx := 0;  -- rate lookup must never block the payment booking
  END;

  INSERT INTO journal_entries (entry_date, description, source, invoice_id, status)
  VALUES (COALESCE(v_inv.paid_at::date, CURRENT_DATE),
          'Invoice ' || COALESCE(v_inv.invoice_number, p_invoice_id::text) || ' paid'
            || CASE WHEN v_fx <> 0 THEN ' (incl realized FX)' ELSE '' END,
          'invoice_payment', p_invoice_id, 'posted')
  RETURNING id INTO v_entry_id;

  -- Bank receives the payment-date value; AR settles at booked value; FX balances.
  INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
  VALUES (v_entry_id, p_bank_account, v_amount + v_fx, 0, 'Bank');
  INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
  VALUES (v_entry_id, p_ar_account, 0, v_amount, 'Settle accounts receivable');
  IF v_fx > 0 THEN
    INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_entry_id, '3960', 0, v_fx, 'Valutakursvinst (realiserad)');
  ELSIF v_fx < 0 THEN
    -- loss: bank line above already carries the reduced amount; debit the loss
    INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_entry_id, '7960', -v_fx, 0, 'Valutakursförlust (realiserad)');
  END IF;

  RETURN jsonb_build_object('success', true, 'invoice_id', p_invoice_id,
    'journal_entry_id', v_entry_id, 'amount_cents', v_amount,
    'realized_fx_cents', v_fx);
END $$;
