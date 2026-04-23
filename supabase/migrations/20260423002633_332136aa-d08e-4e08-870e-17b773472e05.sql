-- ============================================================================
-- Month-end close: accounting_periods + lock triggers
-- ============================================================================

-- 1. Status enum
DO $$ BEGIN
  CREATE TYPE public.accounting_period_status AS ENUM ('open', 'closed', 'locked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Periods table
CREATE TABLE IF NOT EXISTS public.accounting_periods (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fiscal_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  status public.accounting_period_status NOT NULL DEFAULT 'open',
  closed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ,
  reopened_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reopened_at TIMESTAMPTZ,
  -- Snapshot at close
  total_debit_cents BIGINT,
  total_credit_cents BIGINT,
  entry_count INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fiscal_year, period_month)
);

CREATE INDEX IF NOT EXISTS idx_accounting_periods_year_month
  ON public.accounting_periods (fiscal_year, period_month);
CREATE INDEX IF NOT EXISTS idx_accounting_periods_status
  ON public.accounting_periods (status);

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_accounting_periods_updated_at ON public.accounting_periods;
CREATE TRIGGER trg_accounting_periods_updated_at
BEFORE UPDATE ON public.accounting_periods
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 3. RLS — admin only
ALTER TABLE public.accounting_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage accounting periods" ON public.accounting_periods;
CREATE POLICY "Admins manage accounting periods"
ON public.accounting_periods
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 4. Helper: is a given date inside a closed/locked period?
CREATE OR REPLACE FUNCTION public.is_period_closed(p_date DATE)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.accounting_periods
    WHERE fiscal_year = EXTRACT(YEAR FROM p_date)::INTEGER
      AND period_month = EXTRACT(MONTH FROM p_date)::INTEGER
      AND status IN ('closed', 'locked')
  );
$$;

-- 5. Trigger: prevent journal_entries mutations in closed periods
CREATE OR REPLACE FUNCTION public.guard_journal_entries_period()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_check_date DATE;
BEGIN
  -- For DELETE the OLD row matters; for INSERT/UPDATE the NEW row
  IF TG_OP = 'DELETE' THEN
    v_check_date := OLD.entry_date;
  ELSE
    v_check_date := NEW.entry_date;
    -- For UPDATE also block if old date was in a closed period
    IF TG_OP = 'UPDATE' AND public.is_period_closed(OLD.entry_date) THEN
      RAISE EXCEPTION 'Cannot modify journal entry: period %-% is closed',
        EXTRACT(YEAR FROM OLD.entry_date)::INTEGER,
        EXTRACT(MONTH FROM OLD.entry_date)::INTEGER
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF v_check_date IS NOT NULL AND public.is_period_closed(v_check_date) THEN
    RAISE EXCEPTION 'Cannot % journal entry: period %-% is closed',
      LOWER(TG_OP),
      EXTRACT(YEAR FROM v_check_date)::INTEGER,
      EXTRACT(MONTH FROM v_check_date)::INTEGER
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_journal_entries_period ON public.journal_entries;
CREATE TRIGGER trg_guard_journal_entries_period
BEFORE INSERT OR UPDATE OR DELETE ON public.journal_entries
FOR EACH ROW EXECUTE FUNCTION public.guard_journal_entries_period();

-- 6. Trigger on journal_entry_lines: block mutations whose parent entry is in closed period
CREATE OR REPLACE FUNCTION public.guard_journal_entry_lines_period()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry_date DATE;
  v_entry_id UUID;
BEGIN
  v_entry_id := COALESCE(NEW.journal_entry_id, OLD.journal_entry_id);
  SELECT entry_date INTO v_entry_date FROM public.journal_entries WHERE id = v_entry_id;
  IF v_entry_date IS NOT NULL AND public.is_period_closed(v_entry_date) THEN
    RAISE EXCEPTION 'Cannot % journal entry line: period %-% is closed',
      LOWER(TG_OP),
      EXTRACT(YEAR FROM v_entry_date)::INTEGER,
      EXTRACT(MONTH FROM v_entry_date)::INTEGER
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_journal_entry_lines_period ON public.journal_entry_lines;
CREATE TRIGGER trg_guard_journal_entry_lines_period
BEFORE INSERT OR UPDATE OR DELETE ON public.journal_entry_lines
FOR EACH ROW EXECUTE FUNCTION public.guard_journal_entry_lines_period();

-- 7. Close period RPC
CREATE OR REPLACE FUNCTION public.close_accounting_period(
  p_year INTEGER,
  p_month INTEGER,
  p_notes TEXT DEFAULT NULL
)
RETURNS public.accounting_periods
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.accounting_periods;
  v_start DATE;
  v_end DATE;
  v_total_debit BIGINT;
  v_total_credit BIGINT;
  v_count INTEGER;
  v_unposted INTEGER;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only admins can close accounting periods';
  END IF;

  IF p_month NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION 'Invalid month: %', p_month;
  END IF;

  v_start := make_date(p_year, p_month, 1);
  v_end := (v_start + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

  -- Block close if any draft entries remain
  SELECT COUNT(*) INTO v_unposted
  FROM public.journal_entries
  WHERE entry_date BETWEEN v_start AND v_end
    AND status <> 'posted';
  IF v_unposted > 0 THEN
    RAISE EXCEPTION 'Cannot close: % unposted journal entries in %-%', v_unposted, p_year, p_month;
  END IF;

  -- Aggregate snapshot
  SELECT COALESCE(SUM(jel.debit_cents), 0),
         COALESCE(SUM(jel.credit_cents), 0),
         COUNT(DISTINCT je.id)
  INTO v_total_debit, v_total_credit, v_count
  FROM public.journal_entries je
  LEFT JOIN public.journal_entry_lines jel ON jel.journal_entry_id = je.id
  WHERE je.entry_date BETWEEN v_start AND v_end;

  -- Upsert
  INSERT INTO public.accounting_periods (
    fiscal_year, period_month, status,
    closed_by, closed_at,
    total_debit_cents, total_credit_cents, entry_count, notes
  )
  VALUES (
    p_year, p_month, 'closed',
    auth.uid(), now(),
    v_total_debit, v_total_credit, v_count, p_notes
  )
  ON CONFLICT (fiscal_year, period_month) DO UPDATE
  SET status = 'closed',
      closed_by = auth.uid(),
      closed_at = now(),
      reopened_by = NULL,
      reopened_at = NULL,
      total_debit_cents = EXCLUDED.total_debit_cents,
      total_credit_cents = EXCLUDED.total_credit_cents,
      entry_count = EXCLUDED.entry_count,
      notes = COALESCE(EXCLUDED.notes, public.accounting_periods.notes),
      updated_at = now()
  WHERE public.accounting_periods.status <> 'locked'
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Period %-% is locked and cannot be closed again', p_year, p_month;
  END IF;

  RETURN v_row;
END;
$$;

-- 8. Reopen period RPC (only if not locked)
CREATE OR REPLACE FUNCTION public.reopen_accounting_period(
  p_year INTEGER,
  p_month INTEGER,
  p_reason TEXT DEFAULT NULL
)
RETURNS public.accounting_periods
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.accounting_periods;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only admins can reopen accounting periods';
  END IF;

  UPDATE public.accounting_periods
  SET status = 'open',
      reopened_by = auth.uid(),
      reopened_at = now(),
      notes = CASE WHEN p_reason IS NOT NULL
                   THEN COALESCE(notes, '') || E'\n[reopened] ' || p_reason
                   ELSE notes END,
      updated_at = now()
  WHERE fiscal_year = p_year
    AND period_month = p_month
    AND status = 'closed'
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Period %-% not found, already open, or permanently locked', p_year, p_month;
  END IF;

  RETURN v_row;
END;
$$;

-- 9. Permanent lock RPC (one-way; for year-end after audit)
CREATE OR REPLACE FUNCTION public.lock_accounting_period(
  p_year INTEGER,
  p_month INTEGER
)
RETURNS public.accounting_periods
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.accounting_periods;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only admins can lock accounting periods';
  END IF;

  UPDATE public.accounting_periods
  SET status = 'locked', updated_at = now()
  WHERE fiscal_year = p_year
    AND period_month = p_month
    AND status = 'closed'
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Period %-% not found or not in closed state', p_year, p_month;
  END IF;

  RETURN v_row;
END;
$$;