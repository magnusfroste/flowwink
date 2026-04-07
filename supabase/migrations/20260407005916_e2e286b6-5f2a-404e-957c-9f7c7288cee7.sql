
CREATE TABLE IF NOT EXISTS public.opening_balances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_code TEXT NOT NULL,
  account_name TEXT NOT NULL,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  balance_type TEXT NOT NULL DEFAULT 'debit',
  locale TEXT NOT NULL DEFAULT 'se-bas2024',
  fiscal_year INTEGER NOT NULL DEFAULT 2025,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(account_code, locale, fiscal_year)
);

ALTER TABLE public.opening_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage opening balances"
  ON public.opening_balances FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can read opening balances"
  ON public.opening_balances FOR SELECT
  TO authenticated
  USING (true);
