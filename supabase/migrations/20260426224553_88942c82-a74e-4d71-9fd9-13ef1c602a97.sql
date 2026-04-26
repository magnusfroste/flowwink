
-- Analytic accounting (cost centers / project tagging) — Odoo-style

-- 1. Analytic accounts (cost centers, departments, projects, campaigns)
CREATE TABLE IF NOT EXISTS public.analytic_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL DEFAULT 'cost_center', -- cost_center | project | department | campaign | other
  parent_id UUID REFERENCES public.analytic_accounts(id) ON DELETE SET NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

CREATE INDEX IF NOT EXISTS idx_analytic_accounts_type ON public.analytic_accounts(account_type) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_analytic_accounts_project ON public.analytic_accounts(project_id);

ALTER TABLE public.analytic_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read analytic_accounts" ON public.analytic_accounts;
CREATE POLICY "Authenticated read analytic_accounts" ON public.analytic_accounts
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage analytic_accounts" ON public.analytic_accounts;
CREATE POLICY "Admins manage analytic_accounts" ON public.analytic_accounts
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2. Analytic lines — distributes a journal entry line to one or more analytic accounts
-- Allows 100% to one project OR splitting across cost centers (e.g. 60/40)
CREATE TABLE IF NOT EXISTS public.analytic_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analytic_account_id UUID NOT NULL REFERENCES public.analytic_accounts(id) ON DELETE RESTRICT,
  journal_entry_line_id UUID REFERENCES public.journal_entry_lines(id) ON DELETE CASCADE,
  journal_entry_id UUID REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL,
  account_code TEXT,
  description TEXT,
  amount_cents BIGINT NOT NULL, -- signed: positive = expense/debit, negative = revenue/credit (analytic convention)
  currency TEXT NOT NULL DEFAULT 'SEK',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

CREATE INDEX IF NOT EXISTS idx_analytic_lines_account ON public.analytic_lines(analytic_account_id);
CREATE INDEX IF NOT EXISTS idx_analytic_lines_entry ON public.analytic_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_analytic_lines_date ON public.analytic_lines(entry_date);

ALTER TABLE public.analytic_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read analytic_lines" ON public.analytic_lines;
CREATE POLICY "Authenticated read analytic_lines" ON public.analytic_lines
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage analytic_lines" ON public.analytic_lines;
CREATE POLICY "Admins manage analytic_lines" ON public.analytic_lines
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. Trigger: keep updated_at fresh
CREATE OR REPLACE FUNCTION public.touch_analytic_accounts() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_touch_analytic_accounts ON public.analytic_accounts;
CREATE TRIGGER trg_touch_analytic_accounts BEFORE UPDATE ON public.analytic_accounts
  FOR EACH ROW EXECUTE FUNCTION public.touch_analytic_accounts();

-- 4. Reporting view: balance per analytic account
CREATE OR REPLACE VIEW public.analytic_account_balances AS
SELECT
  aa.id AS analytic_account_id,
  aa.code,
  aa.name,
  aa.account_type,
  aa.project_id,
  COALESCE(SUM(al.amount_cents), 0) AS balance_cents,
  COUNT(al.id) AS line_count,
  MIN(al.entry_date) AS first_entry,
  MAX(al.entry_date) AS last_entry
FROM public.analytic_accounts aa
LEFT JOIN public.analytic_lines al ON al.analytic_account_id = aa.id
WHERE aa.is_active
GROUP BY aa.id, aa.code, aa.name, aa.account_type, aa.project_id;

GRANT SELECT ON public.analytic_account_balances TO authenticated;
