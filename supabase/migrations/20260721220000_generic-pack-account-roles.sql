-- Account roles for the GENERIC pack — the l10n_generic_coa of the platform.
--
-- Found by the agent-provisioning test (2026-07-21): a provisioning agent
-- installed a template with country 'DE', the Odoo precedence correctly
-- resolved to ifrs-generic (no German pack yet), the 36-account chart seeded —
-- and then the very first booking failed with "No account mapped to role
-- fixed_asset for accounting locale ifrs-generic". The fallback pack shipped a
-- chart but zero role mappings, so it could be ACTIVATED but not USED. A
-- fallback that cannot book is not a fallback.
--
-- The generic chart is coarser than BAS, so several roles share an account —
-- deliberately. IFRS reporting does not split disposal gains from other
-- operating income, or an FX loss from other finance costs; a country pack
-- that cares ships its own finer mapping.

INSERT INTO public.account_roles (locale, role, account_code, description) VALUES
  ('ifrs-generic', 'bank',                     '1000', 'Cash and Cash Equivalents'),
  ('ifrs-generic', 'accounts_receivable',      '1100', 'Trade Receivables'),
  ('ifrs-generic', 'accounts_payable',         '2000', 'Trade Payables'),
  ('ifrs-generic', 'sales_revenue',            '4000', 'Revenue from Contracts'),
  ('ifrs-generic', 'vat_output',               '2100', 'VAT / Sales Tax Payable'),
  ('ifrs-generic', 'vat_input',                '2100', 'VAT / Sales Tax Payable (net presentation)'),
  ('ifrs-generic', 'employee_liability',       '2400', 'Employee Benefits Payable'),
  ('ifrs-generic', 'expense_default',          '6700', 'Office & General'),
  ('ifrs-generic', 'fixed_asset',              '1500', 'Property, Plant & Equipment'),
  ('ifrs-generic', 'accumulated_depreciation', '1500', 'PP&E (net presentation — no contra account in the coarse chart)'),
  ('ifrs-generic', 'depreciation_expense',     '6100', 'Depreciation & Amortization'),
  ('ifrs-generic', 'disposal_gain',            '4200', 'Other Operating Income'),
  ('ifrs-generic', 'disposal_loss',            '6700', 'Office & General'),
  ('ifrs-generic', 'impairment',               '6100', 'Depreciation & Amortization (incl. impairment)'),
  ('ifrs-generic', 'impairment_reversal',      '4200', 'Other Operating Income'),
  ('ifrs-generic', 'fx_gain',                  '4900', 'Finance Income'),
  ('ifrs-generic', 'fx_loss',                  '7000', 'Finance Costs'),
  ('ifrs-generic', 'rounding_variance',        '6800', 'Bank Charges'),
  ('ifrs-generic', 'cash_difference',          '6800', 'Bank Charges')
ON CONFLICT (locale, role) DO NOTHING;
