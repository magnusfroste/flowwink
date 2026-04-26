-- 1. Vendor defaults (Visma-style autokontering)
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS default_account_code TEXT,
  ADD COLUMN IF NOT EXISTS default_vat_code TEXT,
  ADD COLUMN IF NOT EXISTS default_description TEXT,
  ADD COLUMN IF NOT EXISTS last_used_template_id UUID REFERENCES public.accounting_templates(id) ON DELETE SET NULL;

-- 2. Journal entries learn which template + vendor they came from
ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES public.accounting_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_journal_entries_template_id ON public.journal_entries(template_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_vendor_id ON public.journal_entries(vendor_id);

-- 3. Corrections feedback table — Bokio-style learning loop
CREATE TABLE IF NOT EXISTS public.accounting_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id UUID REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  vendor_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL,
  description_pattern TEXT,                 -- the original entry description (signal)
  original_account_code TEXT NOT NULL,
  corrected_account_code TEXT NOT NULL,
  original_vat_code TEXT,
  corrected_vat_code TEXT,
  reason TEXT,
  corrected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  agent_source TEXT,                        -- 'openclaw' | 'flowpilot' | 'manual' | 'template'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_corrections_vendor ON public.accounting_corrections(vendor_id);
CREATE INDEX IF NOT EXISTS idx_corrections_pattern ON public.accounting_corrections USING gin (to_tsvector('simple', COALESCE(description_pattern, '')));

ALTER TABLE public.accounting_corrections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read corrections" ON public.accounting_corrections;
CREATE POLICY "Admins read corrections" ON public.accounting_corrections
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins write corrections" ON public.accounting_corrections;
CREATE POLICY "Admins write corrections" ON public.accounting_corrections
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 4. Auto-increment template usage_count when a journal entry references it
CREATE OR REPLACE FUNCTION public.bump_template_usage()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.template_id IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.template_id IS DISTINCT FROM NEW.template_id) THEN
    UPDATE public.accounting_templates
       SET usage_count = usage_count + 1,
           updated_at = now()
     WHERE id = NEW.template_id;

    -- Remember the last-used template on the vendor for next-time autokontering
    IF NEW.vendor_id IS NOT NULL THEN
      UPDATE public.vendors
         SET last_used_template_id = NEW.template_id,
             updated_at = now()
       WHERE id = NEW.vendor_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bump_template_usage ON public.journal_entries;
CREATE TRIGGER trg_bump_template_usage
  AFTER INSERT OR UPDATE OF template_id ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.bump_template_usage();

COMMENT ON TABLE public.accounting_corrections IS 'Per-tenant learning signal — every manual correction of an auto-booked entry feeds back to the agent.';
COMMENT ON COLUMN public.vendors.default_account_code IS 'Visma-style autokontering — preferred expense account for invoices from this vendor.';