
-- Add lead_id FK to invoices, keep customer_name/customer_email as nullable overrides
ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL;

-- Make customer_name and customer_email nullable (they become fallback overrides)
ALTER TABLE public.invoices ALTER COLUMN customer_email DROP NOT NULL;
ALTER TABLE public.invoices ALTER COLUMN customer_name DROP NOT NULL;
