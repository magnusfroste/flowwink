-- Ensure pgcrypto is available (lives in extensions schema on fresh Supabase projects)
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Add public access fields to invoices
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS public_token text UNIQUE,
  ADD COLUMN IF NOT EXISTS payment_url text,
  ADD COLUMN IF NOT EXISTS viewed_at timestamp with time zone;

-- Backfill tokens for existing invoices that don't have one
UPDATE public.invoices
SET public_token = encode(extensions.gen_random_bytes(24), 'hex')
WHERE public_token IS NULL;

-- Default for new rows
ALTER TABLE public.invoices
  ALTER COLUMN public_token SET DEFAULT encode(extensions.gen_random_bytes(24), 'hex');

CREATE INDEX IF NOT EXISTS idx_invoices_public_token ON public.invoices(public_token);

-- Public read access via token (anonymous)
DROP POLICY IF EXISTS "Public can view invoice via token" ON public.invoices;
CREATE POLICY "Public can view invoice via token"
ON public.invoices
FOR SELECT
TO anon, authenticated
USING (public_token IS NOT NULL);
