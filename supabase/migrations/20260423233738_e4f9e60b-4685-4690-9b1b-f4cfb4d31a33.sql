-- Journals as accounting primitive (Odoo-style)
CREATE TABLE IF NOT EXISTS public.journals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  journal_type TEXT NOT NULL CHECK (journal_type IN ('sales','purchase','bank','cash','misc')),
  currency TEXT NOT NULL DEFAULT 'SEK',
  default_account_code TEXT,
  sequence_prefix TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.journals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read journals" ON public.journals;
CREATE POLICY "Authenticated can read journals"
ON public.journals FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage journals" ON public.journals;
CREATE POLICY "Admins manage journals"
ON public.journals FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP TRIGGER IF EXISTS trg_journals_updated_at ON public.journals;
CREATE TRIGGER trg_journals_updated_at
BEFORE UPDATE ON public.journals
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Seed standard journals
INSERT INTO public.journals (code, name, journal_type, currency, default_account_code, sequence_prefix, description) VALUES
  ('SALES', 'Sales Journal',     'sales',    'SEK', '1510', 'INV',  'Customer invoices and sales'),
  ('PURCH', 'Purchase Journal',  'purchase', 'SEK', '2440', 'BILL', 'Supplier bills and purchases'),
  ('BANK',  'Bank',              'bank',     'SEK', '1930', 'BNK',  'Bank account transactions'),
  ('CASH',  'Cash',              'cash',     'SEK', '1910', 'CSH',  'Petty cash transactions'),
  ('MISC',  'Miscellaneous',     'misc',     'SEK', NULL,   'MISC', 'Adjustments, accruals, manual entries')
ON CONFLICT (code) DO NOTHING;

-- Add journal_id to journal_entries
ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS journal_id UUID REFERENCES public.journals(id);

CREATE INDEX IF NOT EXISTS idx_journal_entries_journal_id ON public.journal_entries(journal_id);

-- Backfill existing entries to MISC
UPDATE public.journal_entries
SET journal_id = (SELECT id FROM public.journals WHERE code = 'MISC')
WHERE journal_id IS NULL;