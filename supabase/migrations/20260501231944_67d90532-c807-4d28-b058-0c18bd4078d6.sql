-- Recreate analytic_account_balances view with SECURITY INVOKER (default)
-- to satisfy the Supabase linter. The view aggregates analytic_accounts +
-- analytic_lines and should respect the querying user's RLS, not the creator's.
DROP VIEW IF EXISTS public.analytic_account_balances;

CREATE VIEW public.analytic_account_balances
WITH (security_invoker = true) AS
SELECT
  aa.id AS analytic_account_id,
  aa.code,
  aa.name,
  aa.account_type,
  aa.project_id,
  COALESCE(sum(al.amount_cents), 0::numeric) AS balance_cents,
  count(al.id) AS line_count,
  min(al.entry_date) AS first_entry,
  max(al.entry_date) AS last_entry
FROM public.analytic_accounts aa
LEFT JOIN public.analytic_lines al ON al.analytic_account_id = aa.id
WHERE aa.is_active
GROUP BY aa.id, aa.code, aa.name, aa.account_type, aa.project_id;