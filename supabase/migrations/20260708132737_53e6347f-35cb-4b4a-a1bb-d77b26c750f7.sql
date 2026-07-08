
-- ============================================================
-- Reconciliation parity R10: variance / petty-cash / sign-off / feeds
-- Idempotent, forward-dated.
-- ============================================================

-- 1. Partial-match variance columns on reconciliation_matches
ALTER TABLE public.reconciliation_matches
  ADD COLUMN IF NOT EXISTS variance_cents bigint NOT NULL DEFAULT 0;
ALTER TABLE public.reconciliation_matches
  ADD COLUMN IF NOT EXISTS variance_account_code text;
ALTER TABLE public.reconciliation_matches
  ADD COLUMN IF NOT EXISTS variance_journal_entry_id uuid;

-- 2. Petty cash counts
CREATE TABLE IF NOT EXISTS public.petty_cash_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cash_account_code text NOT NULL,
  count_date date NOT NULL DEFAULT CURRENT_DATE,
  counted_cents bigint NOT NULL,
  book_balance_cents bigint NOT NULL,
  difference_cents bigint NOT NULL,
  diff_account_code text,
  currency text NOT NULL DEFAULT 'SEK',
  notes text,
  journal_entry_id uuid,
  counted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.petty_cash_counts TO authenticated;
GRANT ALL ON public.petty_cash_counts TO service_role;
ALTER TABLE public.petty_cash_counts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "petty_cash admin" ON public.petty_cash_counts;
CREATE POLICY "petty_cash admin" ON public.petty_cash_counts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'approver'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'approver'));
CREATE INDEX IF NOT EXISTS idx_petty_cash_account_date
  ON public.petty_cash_counts (cash_account_code, count_date DESC);

-- 3. Reconciliation sign-offs
CREATE TABLE IF NOT EXISTS public.reconciliation_signoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_account_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  statement_balance_cents bigint NOT NULL,
  book_balance_cents bigint NOT NULL,
  difference_cents bigint NOT NULL,
  currency text NOT NULL DEFAULT 'SEK',
  notes text,
  reconciled_by uuid,
  reconciled_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bank_account_id, period_start, period_end)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reconciliation_signoffs TO authenticated;
GRANT ALL ON public.reconciliation_signoffs TO service_role;
ALTER TABLE public.reconciliation_signoffs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "signoff admin" ON public.reconciliation_signoffs;
CREATE POLICY "signoff admin" ON public.reconciliation_signoffs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'approver'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'approver'));
CREATE INDEX IF NOT EXISTS idx_signoff_account_period
  ON public.reconciliation_signoffs (bank_account_id, period_end DESC);

-- 4. Bank feed connections scaffold
CREATE TABLE IF NOT EXISTS public.bank_feed_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_account_id uuid,
  provider text NOT NULL CHECK (provider IN ('plaid','tink','gocardless','csv','manual','stripe')),
  status text NOT NULL DEFAULT 'not_connected' CHECK (status IN ('not_connected','pending','connected','error','disabled')),
  external_ref text,
  last_sync_at timestamptz,
  last_error text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_feed_connections TO authenticated;
GRANT ALL ON public.bank_feed_connections TO service_role;
ALTER TABLE public.bank_feed_connections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "feeds admin" ON public.bank_feed_connections;
CREATE POLICY "feeds admin" ON public.bank_feed_connections
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.tg_bank_feed_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_bank_feed_touch ON public.bank_feed_connections;
CREATE TRIGGER trg_bank_feed_touch BEFORE UPDATE ON public.bank_feed_connections
  FOR EACH ROW EXECUTE FUNCTION public.tg_bank_feed_touch();

-- 5. Lock trigger: block match writes for signed-off periods
CREATE OR REPLACE FUNCTION public.tg_recmatch_signoff_lock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tx_id uuid := COALESCE(NEW.bank_transaction_id, OLD.bank_transaction_id);
  v_locked boolean := false;
BEGIN
  IF v_tx_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT EXISTS (
    SELECT 1
    FROM public.reconciliation_signoffs s
    JOIN public.bank_transactions bt ON bt.id = v_tx_id
    WHERE s.bank_account_id = bt.bank_account_id
      AND bt.transaction_date BETWEEN s.period_start AND s.period_end
  ) INTO v_locked;
  IF v_locked THEN
    -- allow superuser / service_role bypass? Service_role is trusted to correct locked periods.
    IF auth.role() = 'service_role' THEN RETURN COALESCE(NEW, OLD); END IF;
    RAISE EXCEPTION 'Reconciliation period is signed off — unlock the sign-off before editing matches.'
      USING ERRCODE = '22023';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS trg_recmatch_signoff_lock ON public.reconciliation_matches;
CREATE TRIGGER trg_recmatch_signoff_lock
  BEFORE UPDATE OR DELETE ON public.reconciliation_matches
  FOR EACH ROW EXECUTE FUNCTION public.tg_recmatch_signoff_lock();

-- ============================================================
-- RPC: create_partial_match_with_variance
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_partial_match_with_variance(
  p_bank_transaction_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_match_cents bigint,
  p_variance_cents bigint DEFAULT 0,
  p_variance_account_code text DEFAULT '3740',
  p_variance_account_name text DEFAULT 'Öresutjämning',
  p_bank_gl_account text DEFAULT '1930',
  p_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_bank public.bank_transactions;
  v_je_id uuid;
  v_match_id uuid;
BEGIN
  IF NOT (auth.role() = 'service_role'
          OR has_role(v_uid, 'admin') OR has_role(v_uid, 'approver')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT * INTO v_bank FROM public.bank_transactions WHERE id = p_bank_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'bank transaction not found'; END IF;

  -- If variance != 0, post a journal entry to move the variance
  IF p_variance_cents <> 0 THEN
    INSERT INTO public.journal_entries (entry_date, description, reference_number, status, source)
    VALUES (v_bank.transaction_date,
            'Partial-match variance: ' || COALESCE(p_notes,''),
            v_bank.reference, 'posted', 'reconciliation')
    RETURNING id INTO v_je_id;

    -- Variance sign convention:
    -- positive p_variance_cents = we received less than owed (short) → debit variance account, credit AR/etc.
    -- The two lines net to zero to keep JE balanced.
    IF p_variance_cents > 0 THEN
      INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, account_name, debit_cents, credit_cents)
      VALUES
        (v_je_id, p_variance_account_code, p_variance_account_name, p_variance_cents, 0),
        (v_je_id, p_bank_gl_account, 'Bank', 0, p_variance_cents);
    ELSE
      INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, account_name, debit_cents, credit_cents)
      VALUES
        (v_je_id, p_bank_gl_account, 'Bank', -p_variance_cents, 0),
        (v_je_id, p_variance_account_code, p_variance_account_name, 0, -p_variance_cents);
    END IF;
  END IF;

  INSERT INTO public.reconciliation_matches (
    bank_transaction_id, entity_type, entity_id, amount_cents,
    match_type, notes, created_by, variance_cents, variance_account_code, variance_journal_entry_id
  ) VALUES (
    p_bank_transaction_id, p_entity_type, p_entity_id, p_match_cents,
    'manual', p_notes, v_uid, p_variance_cents, p_variance_account_code, v_je_id
  ) RETURNING id INTO v_match_id;

  RETURN jsonb_build_object(
    'match_id', v_match_id,
    'journal_entry_id', v_je_id,
    'variance_cents', p_variance_cents
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_partial_match_with_variance(uuid,text,uuid,bigint,bigint,text,text,text,text)
  TO authenticated, service_role;

-- ============================================================
-- RPC: record_petty_cash_count
-- ============================================================
CREATE OR REPLACE FUNCTION public.record_petty_cash_count(
  p_cash_account_code text,
  p_counted_cents bigint,
  p_diff_account_code text DEFAULT '7960',
  p_count_date date DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_currency text DEFAULT 'SEK'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_date date := COALESCE(p_count_date, CURRENT_DATE);
  v_book bigint := 0;
  v_diff bigint;
  v_je_id uuid;
  v_count_id uuid;
BEGIN
  IF NOT (auth.role() = 'service_role'
          OR has_role(v_uid, 'admin') OR has_role(v_uid, 'approver')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT COALESCE(SUM(l.debit_cents - l.credit_cents), 0)
    INTO v_book
    FROM public.journal_entry_lines l
    JOIN public.journal_entries e ON e.id = l.journal_entry_id
   WHERE l.account_code = p_cash_account_code
     AND e.status = 'posted'
     AND e.entry_date <= v_date;

  v_diff := p_counted_cents - v_book;

  IF v_diff <> 0 THEN
    INSERT INTO public.journal_entries (entry_date, description, status, source)
    VALUES (v_date,
            'Petty-cash count adjustment ' || p_cash_account_code,
            'posted', 'petty_cash_count')
    RETURNING id INTO v_je_id;

    IF v_diff > 0 THEN
      -- Counted more than book: debit cash, credit diff (income/gain)
      INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, account_name, debit_cents, credit_cents)
      VALUES
        (v_je_id, p_cash_account_code, 'Cash', v_diff, 0),
        (v_je_id, p_diff_account_code, 'Cash difference', 0, v_diff);
    ELSE
      INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, account_name, debit_cents, credit_cents)
      VALUES
        (v_je_id, p_diff_account_code, 'Cash difference', -v_diff, 0),
        (v_je_id, p_cash_account_code, 'Cash', 0, -v_diff);
    END IF;
  END IF;

  INSERT INTO public.petty_cash_counts (
    cash_account_code, count_date, counted_cents, book_balance_cents,
    difference_cents, diff_account_code, currency, notes, journal_entry_id, counted_by
  ) VALUES (
    p_cash_account_code, v_date, p_counted_cents, v_book,
    v_diff, p_diff_account_code, p_currency, p_notes, v_je_id, v_uid
  ) RETURNING id INTO v_count_id;

  RETURN jsonb_build_object(
    'count_id', v_count_id,
    'book_balance_cents', v_book,
    'difference_cents', v_diff,
    'journal_entry_id', v_je_id
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.record_petty_cash_count(text,bigint,text,date,text,text)
  TO authenticated, service_role;

-- ============================================================
-- RPC: signoff_reconciliation
-- ============================================================
CREATE OR REPLACE FUNCTION public.signoff_reconciliation(
  p_bank_account_id uuid,
  p_period_start date,
  p_period_end date,
  p_statement_balance_cents bigint,
  p_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_gl text;
  v_currency text;
  v_book bigint := 0;
  v_diff bigint;
  v_id uuid;
BEGIN
  IF NOT (auth.role() = 'service_role'
          OR has_role(v_uid, 'admin') OR has_role(v_uid, 'approver')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT gl_account, currency INTO v_gl, v_currency
    FROM public.bank_accounts WHERE id = p_bank_account_id;
  IF v_gl IS NULL THEN RAISE EXCEPTION 'bank account not found'; END IF;

  SELECT COALESCE(SUM(l.debit_cents - l.credit_cents), 0)
    INTO v_book
    FROM public.journal_entry_lines l
    JOIN public.journal_entries e ON e.id = l.journal_entry_id
   WHERE l.account_code = v_gl
     AND e.status = 'posted'
     AND e.entry_date <= p_period_end;

  v_diff := p_statement_balance_cents - v_book;
  IF v_diff <> 0 THEN
    RAISE EXCEPTION 'Cannot sign off: difference of % cents (statement % vs book %). Resolve before signing off.',
      v_diff, p_statement_balance_cents, v_book
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.reconciliation_signoffs (
    bank_account_id, period_start, period_end,
    statement_balance_cents, book_balance_cents, difference_cents,
    currency, notes, reconciled_by
  ) VALUES (
    p_bank_account_id, p_period_start, p_period_end,
    p_statement_balance_cents, v_book, 0, COALESCE(v_currency, 'SEK'), p_notes, v_uid
  )
  ON CONFLICT (bank_account_id, period_start, period_end)
  DO UPDATE SET
    statement_balance_cents = EXCLUDED.statement_balance_cents,
    book_balance_cents = EXCLUDED.book_balance_cents,
    difference_cents = 0,
    notes = EXCLUDED.notes,
    reconciled_by = EXCLUDED.reconciled_by,
    reconciled_at = now()
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('signoff_id', v_id, 'book_balance_cents', v_book);
END;
$$;
GRANT EXECUTE ON FUNCTION public.signoff_reconciliation(uuid,date,date,bigint,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.unlock_reconciliation_signoff(p_signoff_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  DELETE FROM public.reconciliation_signoffs WHERE id = p_signoff_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.unlock_reconciliation_signoff(uuid) TO authenticated, service_role;
