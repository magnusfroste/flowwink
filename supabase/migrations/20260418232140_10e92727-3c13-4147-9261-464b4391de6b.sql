-- =============================================================================
-- Quotes module — Full scope EXTENSION (existing minimal table is preserved)
-- =============================================================================

-- Extend quote_status enum with new values (existing values preserved)
DO $$ BEGIN
  ALTER TYPE public.quote_status ADD VALUE IF NOT EXISTS 'pending_approval';
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE public.quote_status ADD VALUE IF NOT EXISTS 'viewed';
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE public.quote_status ADD VALUE IF NOT EXISTS 'cancelled';
EXCEPTION WHEN others THEN NULL; END $$;

-- Extend quotes table
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS customer_email TEXT;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS customer_company TEXT;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS customer_address TEXT;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS intro_text TEXT;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS terms_text TEXT;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS discount_cents BIGINT NOT NULL DEFAULT 0;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS accept_token TEXT;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS approval_request_id UUID REFERENCES public.approval_requests(id) ON DELETE SET NULL;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS converted_to_invoice_id UUID;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS template_id UUID;

-- Unique index on accept_token (partial — only when set)
CREATE UNIQUE INDEX IF NOT EXISTS idx_quotes_accept_token_unique ON public.quotes(accept_token) WHERE accept_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quotes_status ON public.quotes(status);
CREATE INDEX IF NOT EXISTS idx_quotes_lead ON public.quotes(lead_id) WHERE lead_id IS NOT NULL;

-- Public read by token policy (additional to existing staff policies)
DROP POLICY IF EXISTS "Public can view quote by token" ON public.quotes;
CREATE POLICY "Public can view quote by token" ON public.quotes FOR SELECT
  USING (accept_token IS NOT NULL AND status::text IN ('sent', 'viewed', 'accepted', 'rejected'));

-- =============================================================================
-- Templates
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.quote_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  currency TEXT NOT NULL DEFAULT 'SEK',
  default_valid_days INTEGER DEFAULT 30,
  terms_text TEXT,
  intro_text TEXT,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.quote_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view templates" ON public.quote_templates;
CREATE POLICY "Staff can view templates" ON public.quote_templates FOR SELECT
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'approver') OR public.has_role(auth.uid(), 'writer'));

DROP POLICY IF EXISTS "Staff can manage templates" ON public.quote_templates;
CREATE POLICY "Staff can manage templates" ON public.quote_templates FOR ALL
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'writer'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'writer'));

DROP TRIGGER IF EXISTS trg_quote_templates_updated ON public.quote_templates;
CREATE TRIGGER trg_quote_templates_updated BEFORE UPDATE ON public.quote_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Add FK from quotes.template_id now that templates table exists
DO $$ BEGIN
  ALTER TABLE public.quotes ADD CONSTRAINT quotes_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.quote_templates(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;

-- =============================================================================
-- Quote items (structured alternative to line_items JSONB)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.quote_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL,
  quantity NUMERIC(12,3) NOT NULL DEFAULT 1,
  unit TEXT,
  unit_price_cents BIGINT NOT NULL DEFAULT 0,
  discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  tax_rate_pct NUMERIC(5,2) NOT NULL DEFAULT 25.00,
  line_subtotal_cents BIGINT NOT NULL DEFAULT 0,
  line_tax_cents BIGINT NOT NULL DEFAULT 0,
  line_total_cents BIGINT NOT NULL DEFAULT 0,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quote_items_quote ON public.quote_items(quote_id);

ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view quote items" ON public.quote_items;
CREATE POLICY "Staff can view quote items" ON public.quote_items FOR SELECT
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'approver') OR public.has_role(auth.uid(), 'writer'));

DROP POLICY IF EXISTS "Public can view items via quote token" ON public.quote_items;
CREATE POLICY "Public can view items via quote token" ON public.quote_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_items.quote_id AND q.accept_token IS NOT NULL AND q.status::text IN ('sent','viewed','accepted','rejected')));

DROP POLICY IF EXISTS "Staff can manage quote items" ON public.quote_items;
CREATE POLICY "Staff can manage quote items" ON public.quote_items FOR ALL
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'writer'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'writer'));

DROP TRIGGER IF EXISTS trg_quote_items_updated ON public.quote_items;
CREATE TRIGGER trg_quote_items_updated BEFORE UPDATE ON public.quote_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Recalculate line totals
CREATE OR REPLACE FUNCTION public.recalc_quote_item()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE
  v_gross BIGINT;
  v_after_disc BIGINT;
BEGIN
  v_gross := ROUND(NEW.quantity * NEW.unit_price_cents);
  v_after_disc := ROUND(v_gross * (1 - NEW.discount_pct / 100.0));
  NEW.line_subtotal_cents := v_after_disc;
  NEW.line_tax_cents := ROUND(v_after_disc * (NEW.tax_rate_pct / 100.0));
  NEW.line_total_cents := NEW.line_subtotal_cents + NEW.line_tax_cents;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quote_items_calc ON public.quote_items;
CREATE TRIGGER trg_quote_items_calc BEFORE INSERT OR UPDATE ON public.quote_items
  FOR EACH ROW EXECUTE FUNCTION public.recalc_quote_item();

-- Recalc parent quote totals (only when quote_items table is used)
CREATE OR REPLACE FUNCTION public.recalc_quote_totals()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE
  v_quote_id UUID;
  v_sub BIGINT;
  v_tax BIGINT;
  v_total BIGINT;
  v_item_count INTEGER;
BEGIN
  v_quote_id := COALESCE(NEW.quote_id, OLD.quote_id);
  SELECT COUNT(*), COALESCE(SUM(line_subtotal_cents), 0), COALESCE(SUM(line_tax_cents), 0), COALESCE(SUM(line_total_cents), 0)
  INTO v_item_count, v_sub, v_tax, v_total
  FROM public.quote_items WHERE quote_id = v_quote_id;
  IF v_item_count > 0 THEN
    UPDATE public.quotes
    SET subtotal_cents = v_sub, tax_cents = v_tax, total_cents = v_total, updated_at = now()
    WHERE id = v_quote_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_quote_items_totals ON public.quote_items;
CREATE TRIGGER trg_quote_items_totals AFTER INSERT OR UPDATE OR DELETE ON public.quote_items
  FOR EACH ROW EXECUTE FUNCTION public.recalc_quote_totals();

-- =============================================================================
-- Versions
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.quote_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  snapshot JSONB NOT NULL,
  reason TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (quote_id, version_number)
);

ALTER TABLE public.quote_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view versions" ON public.quote_versions;
CREATE POLICY "Staff can view versions" ON public.quote_versions FOR SELECT
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'approver') OR public.has_role(auth.uid(), 'writer'));

DROP POLICY IF EXISTS "Staff can create versions" ON public.quote_versions;
CREATE POLICY "Staff can create versions" ON public.quote_versions FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'writer'));

-- =============================================================================
-- Signatures
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.quote_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('view', 'accept', 'reject')),
  signer_name TEXT,
  signer_email TEXT,
  signature_data TEXT,
  ip_address TEXT,
  user_agent TEXT,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quote_signatures_quote ON public.quote_signatures(quote_id);

ALTER TABLE public.quote_signatures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view signatures" ON public.quote_signatures;
CREATE POLICY "Staff can view signatures" ON public.quote_signatures FOR SELECT
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'approver') OR public.has_role(auth.uid(), 'writer'));

DROP POLICY IF EXISTS "Public can insert signature via token" ON public.quote_signatures;
CREATE POLICY "Public can insert signature via token" ON public.quote_signatures FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_signatures.quote_id AND q.accept_token IS NOT NULL AND q.status::text IN ('sent','viewed')));

-- =============================================================================
-- Default approval rule for quotes
-- =============================================================================
INSERT INTO public.approval_rules (name, entity_type, amount_threshold_cents, currency, required_role, priority, description, is_active)
SELECT 'Quote above 25,000 SEK', 'quote', 2500000, 'SEK', 'approver', 100, 'Quotes above 25k SEK require approver sign-off before sending', true
WHERE NOT EXISTS (SELECT 1 FROM public.approval_rules WHERE entity_type = 'quote' AND amount_threshold_cents = 2500000);