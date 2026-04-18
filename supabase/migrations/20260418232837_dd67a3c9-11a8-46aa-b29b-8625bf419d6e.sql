-- Reconciliation Module: bank transactions + matches + import batches

-- 1. bank_import_batches: track each import file/sync run
CREATE TABLE IF NOT EXISTS public.bank_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL CHECK (source IN ('stripe', 'csv', 'camt053', 'sie', 'manual')),
  file_name TEXT,
  imported_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('processing', 'completed', 'failed')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.bank_import_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approvers can manage bank_import_batches"
ON public.bank_import_batches FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'approver'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'approver'));

-- 2. bank_transactions: every line item from a payout or bank file
CREATE TABLE IF NOT EXISTS public.bank_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID REFERENCES public.bank_import_batches(id) ON DELETE SET NULL,
  source TEXT NOT NULL CHECK (source IN ('stripe', 'csv', 'camt053', 'sie', 'manual')),
  external_id TEXT, -- e.g. Stripe txn id, bank ref
  transaction_date DATE NOT NULL,
  value_date DATE,
  amount_cents BIGINT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'SEK',
  counterparty TEXT,
  reference TEXT, -- OCR/invoice ref/free text
  description TEXT,
  raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'unmatched' CHECK (status IN ('unmatched', 'matched', 'partial', 'ignored')),
  matched_amount_cents BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(source, external_id)
);

CREATE INDEX IF NOT EXISTS idx_bank_tx_date ON public.bank_transactions(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_bank_tx_status ON public.bank_transactions(status);
CREATE INDEX IF NOT EXISTS idx_bank_tx_reference ON public.bank_transactions(reference);

ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approvers can manage bank_transactions"
ON public.bank_transactions FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'approver'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'approver'));

CREATE TRIGGER update_bank_transactions_updated_at
BEFORE UPDATE ON public.bank_transactions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 3. reconciliation_matches: links bank tx -> invoice/expense/order
CREATE TABLE IF NOT EXISTS public.reconciliation_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_transaction_id UUID NOT NULL REFERENCES public.bank_transactions(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('invoice', 'expense', 'order', 'manual')),
  entity_id UUID,
  amount_cents BIGINT NOT NULL,
  match_type TEXT NOT NULL DEFAULT 'manual' CHECK (match_type IN ('auto', 'manual', 'suggested')),
  confidence NUMERIC(3,2), -- 0.00–1.00 for suggestions
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recon_match_bank_tx ON public.reconciliation_matches(bank_transaction_id);
CREATE INDEX IF NOT EXISTS idx_recon_match_entity ON public.reconciliation_matches(entity_type, entity_id);

ALTER TABLE public.reconciliation_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approvers can manage reconciliation_matches"
ON public.reconciliation_matches FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'approver'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'approver'));

-- 4. Trigger: when match created/deleted, update bank_transaction status + matched_amount
CREATE OR REPLACE FUNCTION public.recalc_bank_tx_match_status()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_tx_id UUID;
  v_total_matched BIGINT;
  v_tx_amount BIGINT;
BEGIN
  v_tx_id := COALESCE(NEW.bank_transaction_id, OLD.bank_transaction_id);
  
  SELECT COALESCE(SUM(ABS(amount_cents)), 0) INTO v_total_matched
  FROM public.reconciliation_matches WHERE bank_transaction_id = v_tx_id;
  
  SELECT ABS(amount_cents) INTO v_tx_amount
  FROM public.bank_transactions WHERE id = v_tx_id;
  
  UPDATE public.bank_transactions
  SET matched_amount_cents = v_total_matched,
      status = CASE
        WHEN v_total_matched = 0 THEN 'unmatched'
        WHEN v_total_matched >= v_tx_amount THEN 'matched'
        ELSE 'partial'
      END,
      updated_at = now()
  WHERE id = v_tx_id;
  
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalc_bank_tx_match ON public.reconciliation_matches;
CREATE TRIGGER trg_recalc_bank_tx_match
AFTER INSERT OR UPDATE OR DELETE ON public.reconciliation_matches
FOR EACH ROW EXECUTE FUNCTION public.recalc_bank_tx_match_status();