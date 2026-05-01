-- Ensure pgcrypto is available in the standard extensions schema
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Repair invoices.public_token: backfill missing tokens and use schema-qualified function
UPDATE public.invoices
SET public_token = encode(extensions.gen_random_bytes(24), 'hex')
WHERE public_token IS NULL;

ALTER TABLE public.invoices
  ALTER COLUMN public_token SET DEFAULT encode(extensions.gen_random_bytes(24), 'hex');

-- Repair survey_sends.token default to use schema-qualified function
ALTER TABLE public.survey_sends
  ALTER COLUMN token SET DEFAULT encode(extensions.gen_random_bytes(16), 'hex');
