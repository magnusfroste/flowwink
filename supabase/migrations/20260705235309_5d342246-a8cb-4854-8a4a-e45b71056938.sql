-- Forward-dated, idempotent fix for manage_budget upsert.
-- The RPC uses ON CONFLICT (account_code, fiscal_year, (COALESCE(period_month, -1)))
-- so we need a matching expression-based UNIQUE index.
CREATE UNIQUE INDEX IF NOT EXISTS budgets_account_year_period_uidx
  ON public.budgets (account_code, fiscal_year, (COALESCE(period_month, -1)));
