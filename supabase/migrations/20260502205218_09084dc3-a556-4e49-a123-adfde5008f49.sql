-- Append "NOT for:" markers (and "Use when:" where missing) to satisfy Law 2 (skills are self-describing).
-- Idempotent: only updates if marker is missing.

UPDATE agent_skills SET description = description || ' NOT for: read-only invoice queries (use list_invoices) or bypassing approval gates.'
WHERE name='auto_approve_vendor_invoice' AND description NOT ILIKE '%not for%';

UPDATE agent_skills SET description = 'Use when: an admin asks how invoices auto-mark as paid. ' || description || ' NOT for: manually marking an invoice paid — use manage_invoice action=mark_paid instead.'
WHERE name='auto_mark_invoice_paid' AND description NOT ILIKE '%not for%';

UPDATE agent_skills SET description = description || ' NOT for: inspecting a single invoice (use get_invoice) or auto-approving (use auto_approve_vendor_invoice).'
WHERE name='flag_invoice_variance' AND description NOT ILIKE '%not for%';

UPDATE agent_skills SET description = description || ' NOT for: opening or closing a period — use open_accounting_period / close_accounting_period.'
WHERE name='list_accounting_periods' AND description NOT ILIKE '%not for%';

UPDATE agent_skills SET description = 'Use when: posting double-entry verifikat to the general ledger, listing entries for a period, or voiding a posted entry. ' || description || ' NOT for: invoice booking (use book_invoice) or expense booking (use book_expense) — those wrap manage_journal_entry with proper VAT splits.'
WHERE name='manage_journal_entry' AND description NOT ILIKE '%not for%';

UPDATE agent_skills SET description = description || ' NOT for: changing the chart of accounts itself — use manage_chart_of_accounts.'
WHERE name='manage_vendor_defaults' AND description NOT ILIKE '%not for%';

UPDATE agent_skills SET description = description || ' NOT for: booking new entries (use manage_journal_entry) or manual one-off audit notes (use audit_logs).'
WHERE name='record_accounting_correction' AND description NOT ILIKE '%not for%';

-- Refresh tool_definition.function.description to mirror skill description for any of these where it diverges
UPDATE agent_skills
SET tool_definition = jsonb_set(
  tool_definition,
  '{function,description}',
  to_jsonb(description)
)
WHERE name IN ('auto_approve_vendor_invoice','auto_mark_invoice_paid','flag_invoice_variance','list_accounting_periods','manage_journal_entry','manage_vendor_defaults','record_accounting_correction')
  AND tool_definition #> '{function,description}' IS NOT NULL;