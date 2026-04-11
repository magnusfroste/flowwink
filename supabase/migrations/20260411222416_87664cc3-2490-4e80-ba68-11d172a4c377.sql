-- Add overdue status to enum
ALTER TYPE public.invoice_status ADD VALUE IF NOT EXISTS 'overdue';

-- Add useful columns
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS issue_date DATE NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS payment_terms TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;

-- Index
CREATE INDEX IF NOT EXISTS idx_invoices_project ON public.invoices(project_id);