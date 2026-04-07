
-- Add locale column to chart_of_accounts
ALTER TABLE public.chart_of_accounts 
ADD COLUMN IF NOT EXISTS locale text NOT NULL DEFAULT 'se-bas2024';

-- Add locale column to accounting_templates
ALTER TABLE public.accounting_templates 
ADD COLUMN IF NOT EXISTS locale text NOT NULL DEFAULT 'se-bas2024';

-- Update existing rows to have the Swedish locale
UPDATE public.chart_of_accounts SET locale = 'se-bas2024' WHERE locale = 'se-bas2024';
UPDATE public.accounting_templates SET locale = 'se-bas2024' WHERE locale = 'se-bas2024';
