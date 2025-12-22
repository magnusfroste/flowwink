-- Remove the legacy company text field since we now use company_id linking exclusively
ALTER TABLE public.leads DROP COLUMN IF EXISTS company;