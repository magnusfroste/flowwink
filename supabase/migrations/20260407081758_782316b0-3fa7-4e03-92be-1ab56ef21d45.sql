
-- ═══ Expense Reporting Tables ═══

-- Expense reports (monthly groupings)
CREATE TABLE IF NOT EXISTS public.expense_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  period TEXT NOT NULL, -- e.g. '2026-04'
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'booked')),
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  approved_by UUID,
  journal_entry_id UUID REFERENCES public.journal_entries(id),
  notes TEXT,
  total_cents BIGINT NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'SEK',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, period)
);

-- Individual expenses
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES public.expense_reports(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT NOT NULL DEFAULT '',
  amount_cents BIGINT NOT NULL DEFAULT 0,
  vat_cents BIGINT NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'SEK',
  category TEXT NOT NULL DEFAULT 'other',
  vendor TEXT,
  account_code TEXT,
  is_representation BOOLEAN NOT NULL DEFAULT false,
  attendees JSONB, -- [{name, company}] required when is_representation=true
  receipt_url TEXT,
  receipt_analyzed BOOLEAN NOT NULL DEFAULT false,
  receipt_data JSONB, -- AI-extracted: {amount, vat, vendor, date, items}
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Receipt attachments (multiple per expense)
CREATE TABLE IF NOT EXISTS public.expense_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name TEXT,
  file_type TEXT,
  file_size_bytes BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON public.expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_report_id ON public.expenses(report_id);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON public.expenses(status);
CREATE INDEX IF NOT EXISTS idx_expense_reports_user_period ON public.expense_reports(user_id, period);
CREATE INDEX IF NOT EXISTS idx_expense_attachments_expense ON public.expense_attachments(expense_id);

-- Updated_at triggers
CREATE OR REPLACE TRIGGER update_expenses_updated_at
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER update_expense_reports_updated_at
  BEFORE UPDATE ON public.expense_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE public.expense_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_attachments ENABLE ROW LEVEL SECURITY;

-- Policies: users see own, admins see all
CREATE POLICY "Users view own expense reports" ON public.expense_reports
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users manage own draft expense reports" ON public.expense_reports
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own expense reports" ON public.expense_reports
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users view own expenses" ON public.expenses
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users create own expenses" ON public.expenses
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own expenses" ON public.expenses
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users delete own draft expenses" ON public.expenses
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND status = 'draft');

CREATE POLICY "View expense attachments" ON public.expense_attachments
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.expenses e 
    WHERE e.id = expense_id 
    AND (e.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  ));

CREATE POLICY "Create expense attachments" ON public.expense_attachments
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.expenses e 
    WHERE e.id = expense_id AND e.user_id = auth.uid()
  ));

CREATE POLICY "Delete expense attachments" ON public.expense_attachments
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.expenses e 
    WHERE e.id = expense_id AND e.user_id = auth.uid() AND e.status = 'draft'
  ));

-- Service role bypass for FlowPilot
CREATE POLICY "Service role full access expense_reports" ON public.expense_reports
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access expenses" ON public.expenses
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access expense_attachments" ON public.expense_attachments
  FOR ALL TO service_role USING (true) WITH CHECK (true);
