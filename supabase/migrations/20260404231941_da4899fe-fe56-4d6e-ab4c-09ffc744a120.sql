
-- Create invoice status enum
DO $$ BEGIN
  CREATE TYPE public.invoice_status AS ENUM ('draft', 'sent', 'paid', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Create invoices table
CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL,
  deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  customer_email text NOT NULL,
  customer_name text NOT NULL DEFAULT '',
  status public.invoice_status NOT NULL DEFAULT 'draft',
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal_cents integer NOT NULL DEFAULT 0,
  tax_rate numeric NOT NULL DEFAULT 0.25,
  tax_cents integer NOT NULL DEFAULT 0,
  total_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'SEK',
  due_date date,
  paid_at timestamptz,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Auto-update updated_at
DROP TRIGGER IF EXISTS update_invoices_updated_at ON public.invoices;
CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Index for deal lookups
CREATE INDEX IF NOT EXISTS idx_invoices_deal_id ON public.invoices(deal_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);

-- RLS
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "Admins can manage invoices"
  ON public.invoices FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Approvers can read and update
CREATE POLICY "Approvers can view invoices"
  ON public.invoices FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'approver'));

CREATE POLICY "Approvers can update invoices"
  ON public.invoices FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'approver'))
  WITH CHECK (public.has_role(auth.uid(), 'approver'));

-- Service role full access
CREATE POLICY "Service role full access on invoices"
  ON public.invoices FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
