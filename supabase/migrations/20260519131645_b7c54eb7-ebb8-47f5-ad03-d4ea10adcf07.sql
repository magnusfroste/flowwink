UPDATE public.agent_skills
SET requires_staging = true
WHERE name IN (
  'manage_journal_entry',
  'book_expense_report',
  'mark_expense_report_paid',
  'record_pos_sale_v2',
  'reopen_accounting_period'
);