-- 1. contract_templates table
CREATE TABLE IF NOT EXISTS public.contract_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  contract_type contract_type NOT NULL DEFAULT 'service',
  language TEXT NOT NULL DEFAULT 'sv',
  body_markdown TEXT NOT NULL,
  default_currency TEXT NOT NULL DEFAULT 'SEK',
  default_renewal_type renewal_type NOT NULL DEFAULT 'none',
  default_renewal_notice_days INTEGER DEFAULT 30,
  default_value_cents BIGINT DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contract_templates_type_lang ON public.contract_templates(contract_type, language) WHERE is_active;

ALTER TABLE public.contract_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated view contract templates" ON public.contract_templates;
CREATE POLICY "Authenticated view contract templates" ON public.contract_templates
  FOR SELECT TO authenticated USING (is_active = true OR has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins manage contract templates" ON public.contract_templates;
CREATE POLICY "Admins manage contract templates" ON public.contract_templates
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_contract_templates_updated_at ON public.contract_templates;
CREATE TRIGGER trg_contract_templates_updated_at
  BEFORE UPDATE ON public.contract_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. template_id on contracts
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES public.contract_templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contracts_template_id ON public.contracts(template_id) WHERE template_id IS NOT NULL;

-- 3. Guard trigger: prevent empty contracts
CREATE OR REPLACE FUNCTION public.guard_contracts_require_body()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Allow if a template was used, a file is attached, or body has real content
  IF NEW.template_id IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.file_url IS NOT NULL AND length(NEW.file_url) > 0 THEN RETURN NEW; END IF;
  IF NEW.body_markdown IS NOT NULL AND length(NEW.body_markdown) >= 200 THEN RETURN NEW; END IF;

  RAISE EXCEPTION 'Contract requires either a template_id, an attached file_url, or body_markdown with at least 200 characters. Use create_contract_from_template, attach a PDF, or write the full agreement text.'
    USING ERRCODE = 'check_violation', HINT = 'Run list_contract_templates to find an existing template, or write body_markdown >= 200 chars.';
END;
$$;

DROP TRIGGER IF EXISTS guard_contracts_require_body_trg ON public.contracts;
CREATE TRIGGER guard_contracts_require_body_trg
  BEFORE INSERT ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.guard_contracts_require_body();

-- 4. RPC: render template + insert contract
CREATE OR REPLACE FUNCTION public.create_contract_from_template(
  p_template_id UUID,
  p_counterparty_name TEXT,
  p_counterparty_email TEXT DEFAULT NULL,
  p_overrides JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (contract_id UUID, title TEXT, status contract_status)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tpl RECORD;
  v_body TEXT;
  v_title TEXT;
  v_start DATE;
  v_end DATE;
  v_value BIGINT;
  v_currency TEXT;
  v_id UUID;
BEGIN
  IF p_template_id IS NULL THEN RAISE EXCEPTION 'template_id is required'; END IF;
  IF p_counterparty_name IS NULL OR length(trim(p_counterparty_name)) = 0 THEN
    RAISE EXCEPTION 'counterparty_name is required';
  END IF;

  SELECT * INTO v_tpl FROM public.contract_templates WHERE id = p_template_id AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Template % not found or inactive', p_template_id; END IF;

  v_start := COALESCE((p_overrides->>'start_date')::DATE, CURRENT_DATE);
  v_end := NULLIF(p_overrides->>'end_date','')::DATE;
  v_value := COALESCE((p_overrides->>'value_cents')::BIGINT, v_tpl.default_value_cents);
  v_currency := COALESCE(p_overrides->>'currency', v_tpl.default_currency);
  v_title := COALESCE(p_overrides->>'title', v_tpl.name || ' — ' || p_counterparty_name);

  -- Render tokens
  v_body := v_tpl.body_markdown;
  v_body := replace(v_body, '{{counterparty.name}}', p_counterparty_name);
  v_body := replace(v_body, '{{counterparty.email}}', COALESCE(p_counterparty_email, ''));
  v_body := replace(v_body, '{{today}}', to_char(CURRENT_DATE, 'YYYY-MM-DD'));
  v_body := replace(v_body, '{{start_date}}', to_char(v_start, 'YYYY-MM-DD'));
  v_body := replace(v_body, '{{end_date}}', COALESCE(to_char(v_end, 'YYYY-MM-DD'), 'TBD'));
  v_body := replace(v_body, '{{value}}', to_char(v_value / 100.0, 'FM999G999G999D00'));
  v_body := replace(v_body, '{{currency}}', v_currency);
  v_body := replace(v_body, '{{title}}', v_title);

  INSERT INTO public.contracts (
    title, counterparty_name, counterparty_email, contract_type, status,
    start_date, end_date, value_cents, currency,
    renewal_type, renewal_notice_days,
    body_markdown, body_updated_at, template_id, version
  ) VALUES (
    v_title, p_counterparty_name, p_counterparty_email, v_tpl.contract_type, 'draft',
    v_start, v_end, v_value, v_currency,
    v_tpl.default_renewal_type, v_tpl.default_renewal_notice_days,
    v_body, now(), v_tpl.id, 1
  ) RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id, v_title, 'draft'::contract_status;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_contract_from_template(UUID, TEXT, TEXT, JSONB) TO authenticated, service_role;