
-- Quote attachments (thin link to documents)
CREATE TABLE IF NOT EXISTS public.quote_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  uploaded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (quote_id, document_id)
);
CREATE INDEX IF NOT EXISTS idx_quote_attachments_quote ON public.quote_attachments(quote_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_attachments TO authenticated;
GRANT ALL ON public.quote_attachments TO service_role;
ALTER TABLE public.quote_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "quote_attachments authenticated all" ON public.quote_attachments;
CREATE POLICY "quote_attachments authenticated all" ON public.quote_attachments FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Quote revisions
CREATE TABLE IF NOT EXISTS public.quote_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL,
  reason TEXT,
  snapshot JSONB NOT NULL,
  prev_total_cents BIGINT,
  new_total_cents BIGINT,
  amount_delta_cents BIGINT,
  approval_request_id UUID,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (quote_id, revision_number)
);
CREATE INDEX IF NOT EXISTS idx_quote_revisions_quote ON public.quote_revisions(quote_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_revisions TO authenticated;
GRANT ALL ON public.quote_revisions TO service_role;
ALTER TABLE public.quote_revisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "quote_revisions authenticated all" ON public.quote_revisions;
CREATE POLICY "quote_revisions authenticated all" ON public.quote_revisions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Recurring quote templates (retainers / renewals)
CREATE TABLE IF NOT EXISTS public.recurring_quote_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  source_quote_id UUID REFERENCES public.quotes(id) ON DELETE SET NULL,
  interval TEXT NOT NULL CHECK (interval IN ('weekly','monthly','quarterly','yearly')),
  next_run_at DATE NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  last_generated_at TIMESTAMPTZ,
  last_generated_quote_id UUID,
  generated_count INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_recurring_quote_templates_due ON public.recurring_quote_templates(next_run_at) WHERE active;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recurring_quote_templates TO authenticated;
GRANT ALL ON public.recurring_quote_templates TO service_role;
ALTER TABLE public.recurring_quote_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "recurring_quote_templates authenticated all" ON public.recurring_quote_templates;
CREATE POLICY "recurring_quote_templates authenticated all" ON public.recurring_quote_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- updated_at trigger for recurring templates
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_recurring_quote_templates_updated ON public.recurring_quote_templates;
CREATE TRIGGER trg_recurring_quote_templates_updated
BEFORE UPDATE ON public.recurring_quote_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Advance function (interval math)
CREATE OR REPLACE FUNCTION public.advance_quote_recurrence(_from DATE, _interval TEXT)
RETURNS DATE
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE _interval
    WHEN 'weekly' THEN _from + INTERVAL '7 days'
    WHEN 'monthly' THEN _from + INTERVAL '1 month'
    WHEN 'quarterly' THEN _from + INTERVAL '3 months'
    WHEN 'yearly' THEN _from + INTERVAL '1 year'
    ELSE _from + INTERVAL '1 month'
  END::date
$$;

-- Sweep function: generate draft quotes from all due, active templates.
-- Callable by service_role (edge function / cron) or admin.
CREATE OR REPLACE FUNCTION public.run_recurring_quotes()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tpl RECORD;
  src RECORD;
  new_id UUID;
  new_number TEXT;
  generated INT := 0;
  skipped INT := 0;
  results JSONB := '[]'::jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admins or service role may run recurring quotes';
  END IF;

  FOR tpl IN
    SELECT * FROM public.recurring_quote_templates
    WHERE active = true AND next_run_at <= CURRENT_DATE
    ORDER BY next_run_at
    LIMIT 200
  LOOP
    SELECT * INTO src FROM public.quotes WHERE id = tpl.source_quote_id;
    IF NOT FOUND THEN
      skipped := skipped + 1;
      results := results || jsonb_build_object('template_id', tpl.id, 'skipped', 'source_missing');
      CONTINUE;
    END IF;

    new_number := 'QUO-R-' || to_char(now(), 'YYYYMMDD') || '-' || substr(gen_random_uuid()::text, 1, 6);

    INSERT INTO public.quotes (
      quote_number, lead_id, deal_id, status, line_items,
      subtotal_cents, tax_rate, tax_cents, total_cents, currency,
      valid_until, notes, created_by
    ) VALUES (
      new_number, src.lead_id, src.deal_id, 'draft', COALESCE(src.line_items, '[]'::jsonb),
      src.subtotal_cents, src.tax_rate, src.tax_cents, src.total_cents, src.currency,
      (CURRENT_DATE + INTERVAL '30 days')::date,
      COALESCE(src.notes, '') || E'\n[Auto-generated from recurring template: ' || tpl.name || ']',
      tpl.created_by
    ) RETURNING id INTO new_id;

    UPDATE public.recurring_quote_templates
    SET next_run_at = public.advance_quote_recurrence(next_run_at, interval),
        last_generated_at = now(),
        last_generated_quote_id = new_id,
        generated_count = generated_count + 1
    WHERE id = tpl.id;

    generated := generated + 1;
    results := results || jsonb_build_object('template_id', tpl.id, 'quote_id', new_id, 'quote_number', new_number);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'generated', generated, 'skipped', skipped, 'results', results);
END;
$$;

GRANT EXECUTE ON FUNCTION public.run_recurring_quotes() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.advance_quote_recurrence(DATE, TEXT) TO authenticated, service_role;
