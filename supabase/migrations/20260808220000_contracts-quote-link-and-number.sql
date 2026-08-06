-- The agreement could not name itself, and could not point at the deal it came from.
--
-- Two gaps found classifying why a rendered contract still showed placeholders:
--
--   1. `contracts` carried no `quote_id`, `deal_id` or `lead_id` — only
--      `company_id`. The quote→contract handoff copied VALUES (name, email,
--      amount) and encoded the link as prose: `title: 'Avtal — ' || quote_number`.
--      So nothing downstream could answer "which quote became this agreement",
--      and none of the per-deal figures on the quote's line items could ever
--      reach the contract body.
--   2. `contracts` had no number at all, while quotes and invoices both draw
--      from `next_document_number`. Every template asks for `[AVTALSNR]`
--      (8 occurrences) and nothing could answer.
--
-- PREFIX IS `AGR`, NOT `CTR`. `CTR-YYYYMMDD-…` is already the invoice series for
-- contract billing (`generate_contract_invoice`). Numbering the agreement CTR-
-- too would mean an operator reading `CTR-2026-00001` cannot tell whether it is
-- the agreement or one of its invoices. `AGR` is unused and reads in both
-- languages; the counter row stores the prefix, so an instance can change it.
--
-- THE NUMBER IS ASSIGNED BY A TRIGGER, not by the one function that renders
-- templates. There are three ways a contract is born — the template renderer,
-- the direct create in `manage_contract`, and the admin dialog — and a rule
-- implemented in one of three places is precisely the shape of bug this
-- codebase keeps finding. The trigger only fills a NULL, so the renderer can
-- still allocate the number first (it needs it INSIDE the body).
--
-- STILL OUT OF SCOPE, deliberately: `[BELOPP]` and `[ANTAL]` appear in fee and
-- capacity TABLES — per-line figures, not the contract total, which already has
-- `{{value}}`. Feeding them needs a per-line mapping from `quote_items`, and
-- guessing which line is "Etableringsavgift" would put wrong money in a signed
-- agreement. `[HUVUDAVTALETS NUMMER]` is the DPA annex pointing at its PARENT
-- agreement — that needs a parent link, which is a separate relationship from
-- the one added here.

-- ── the link ───────────────────────────────────────────────────────────────
-- ON DELETE SET NULL, never CASCADE: deleting a quote must not delete a signed
-- agreement. The contract outlives its origin by design.
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS quote_id uuid REFERENCES public.quotes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contract_number text;

CREATE INDEX IF NOT EXISTS contracts_quote_id_idx
  ON public.contracts (quote_id) WHERE quote_id IS NOT NULL;

COMMENT ON COLUMN public.contracts.quote_id IS
  'The quote this agreement was drafted from, when there was one. Reaches deal_id and lead_id through quotes, so one link is enough. Nullable: contracts are also written directly.';
COMMENT ON COLUMN public.contracts.contract_number IS
  'AGR-YYYY-NNNNN from next_document_number(''contract'', ''AGR''). Assigned by trigger on insert when not supplied. NOT the CTR- series, which numbers contract BILLING invoices.';

-- ── the number ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assign_contract_number()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.contract_number IS NULL OR trim(NEW.contract_number) = '' THEN
    NEW.contract_number := public.next_document_number('contract', 'AGR');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contracts_assign_number ON public.contracts;
CREATE TRIGGER contracts_assign_number
  BEFORE INSERT ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.assign_contract_number();

-- Existing agreements get numbers in the order they were created, and the
-- counter is advanced past them — otherwise the next new contract would be
-- handed AGR-YYYY-00001 again and collide with the backfill.
DO $$
DECLARE v_max bigint;
BEGIN
  WITH numbered AS (
    SELECT id, row_number() OVER (ORDER BY created_at, id) AS n
    FROM public.contracts WHERE contract_number IS NULL
  )
  UPDATE public.contracts c
  SET contract_number = 'AGR-' || to_char(COALESCE(c.created_at, now()), 'YYYY')
                        || '-' || lpad(numbered.n::text, 5, '0')
  FROM numbered WHERE numbered.id = c.id;

  SELECT count(*) INTO v_max FROM public.contracts;
  IF v_max > 0 THEN
    INSERT INTO public.document_number_counters(kind, prefix, last_value)
    VALUES ('contract', 'AGR', v_max)
    ON CONFLICT (kind) DO UPDATE
      SET last_value = GREATEST(public.document_number_counters.last_value, EXCLUDED.last_value),
          prefix = EXCLUDED.prefix;
  END IF;
END $$;

-- Unique, but only over rows that have one — the partial predicate keeps the
-- index honest if a future path ever inserts without the trigger.
CREATE UNIQUE INDEX IF NOT EXISTS contracts_contract_number_key
  ON public.contracts (contract_number) WHERE contract_number IS NOT NULL;

-- ── the renderer ───────────────────────────────────────────────────────────
-- Same body as 20260808210000 plus: the number is allocated BEFORE the body is
-- built (it has to appear inside it), the quote link is stored, and
-- `{{contract.number}}` / `[AVTALSNR]` resolve.
DROP FUNCTION IF EXISTS public.create_contract_from_template(uuid, text, text, jsonb);

CREATE OR REPLACE FUNCTION public.create_contract_from_template(
  p_template_id uuid,
  p_counterparty_name text,
  p_counterparty_email text DEFAULT NULL,
  p_overrides jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(contract_id uuid, title text, status public.contract_status)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_tpl public.contract_templates%ROWTYPE;
  v_body text;
  v_new_id uuid;
  v_start date;
  v_end date;
  v_value bigint;
  v_currency text;
  v_title text;
  v_company_id uuid;
  v_quote_id uuid;
  v_number text;
  v_org text;
  v_site_url text;
  v_profile jsonb;
  v_sup_name text;
  v_sup_org text;
  v_sup_addr text;
  v_sup_phone text;
  v_sup_email text;
  v_sup_signer text;
  v_cp_addr text;
BEGIN
  SELECT * INTO v_tpl FROM public.contract_templates WHERE id = p_template_id;
  IF v_tpl.id IS NULL THEN
    RAISE EXCEPTION 'Template not found: %', p_template_id;
  END IF;

  v_start := COALESCE((p_overrides->>'start_date')::date, CURRENT_DATE);
  v_end := NULLIF(p_overrides->>'end_date', '')::date;
  v_value := COALESCE((p_overrides->>'value_cents')::bigint, v_tpl.default_value_cents);
  v_currency := COALESCE(p_overrides->>'currency', v_tpl.default_currency);
  v_title := COALESCE(p_overrides->>'title', v_tpl.name || ' — ' || p_counterparty_name);

  v_quote_id := CASE WHEN (p_overrides->>'quote_id') ~* '^[0-9a-f-]{36}$'
                     THEN (p_overrides->>'quote_id')::uuid END;

  v_company_id := CASE WHEN (p_overrides->>'company_id') ~* '^[0-9a-f-]{36}$'
                       THEN (p_overrides->>'company_id')::uuid END;
  IF v_company_id IS NULL THEN
    SELECT id INTO v_company_id FROM public.companies
    WHERE lower(name) = lower(trim(p_counterparty_name)) LIMIT 1;
  END IF;

  v_org := COALESCE(
    NULLIF(trim(p_overrides->>'org_number'), ''),
    (SELECT org_number FROM public.companies WHERE id = v_company_id)
  );
  SELECT NULLIF(trim(address), '') INTO v_cp_addr
  FROM public.companies WHERE id = v_company_id;

  -- Allocated here rather than left to the trigger: the number has to appear
  -- inside the body, and the body is built before the row exists. The trigger
  -- only fills a NULL, so this wins and nothing is double-counted.
  v_number := public.next_document_number('contract', 'AGR');

  -- The canonical public URL — the setting FlowPilot and the MCP skills
  -- already use for absolute links.
  SELECT NULLIF(trim(value->>'siteUrl'), '') INTO v_site_url
  FROM public.site_settings WHERE key = 'general';

  -- ── the supplier's own master data ──────────────────────────────────────
  -- Same store the About page, the invoice footer and FlowPilot's identity all
  -- read. Registered name is preferred over display name: an agreement names
  -- the legal entity.
  SELECT value INTO v_profile FROM public.site_settings WHERE key = 'company_profile';
  v_sup_name  := COALESCE(NULLIF(trim(v_profile->>'legal_name'), ''),
                          NULLIF(trim(v_profile->>'company_name'), ''));
  v_sup_org   := NULLIF(trim(v_profile->>'org_number'), '');
  v_sup_phone := NULLIF(trim(v_profile->>'contact_phone'), '');
  v_sup_email := NULLIF(trim(v_profile->>'contact_email'), '');
  v_sup_signer := NULLIF(trim(v_profile->>'ceo'), '');
  -- Street, postal code and city are three fields and one line on paper.
  v_sup_addr := NULLIF(trim(concat_ws(', ',
    NULLIF(trim(v_profile->>'address'), ''),
    NULLIF(trim(concat_ws(' ', NULLIF(trim(v_profile->>'postal_code'), ''),
                               NULLIF(trim(v_profile->>'city'), ''))), ''),
    NULLIF(trim(v_profile->>'country'), '')
  )), '');

  v_body := v_tpl.body_markdown;
  v_body := replace(v_body, '{{counterparty.name}}', p_counterparty_name);
  v_body := replace(v_body, '{{counterparty.email}}', COALESCE(p_counterparty_email, ''));
  v_body := replace(v_body, '{{today}}', to_char(CURRENT_DATE, 'YYYY-MM-DD'));
  v_body := replace(v_body, '{{start_date}}', to_char(v_start, 'YYYY-MM-DD'));
  v_body := replace(v_body, '{{end_date}}', COALESCE(to_char(v_end, 'YYYY-MM-DD'), 'TBD'));
  v_body := replace(v_body, '{{value}}', to_char(v_value / 100.0, 'FM999G999G999D00'));
  v_body := replace(v_body, '{{currency}}', v_currency);
  v_body := replace(v_body, '{{title}}', v_title);

  -- The agreement can finally name itself.
  v_body := replace(v_body, '{{contract.number}}', v_number);
  v_body := replace(v_body, '[AVTALSNR]', v_number);

  IF v_org IS NOT NULL THEN
    v_body := replace(v_body, '{{counterparty.org_number}}', v_org);
    v_body := replace(v_body, '[KUNDENS ORGNR]', v_org);
  END IF;
  v_body := replace(v_body, '{{counterparty.org_number}}', '[KUNDENS ORGNR]');

  IF v_cp_addr IS NOT NULL THEN
    v_body := replace(v_body, '{{counterparty.address}}', v_cp_addr);
    v_body := replace(v_body, '[KUNDENS ADRESS]', v_cp_addr);
  END IF;
  v_body := replace(v_body, '{{counterparty.address}}', '[KUNDENS ADRESS]');

  -- Supplier side. Each guarded on its own: a profile filled in halfway should
  -- contribute the half it has, not nothing.
  IF v_sup_name IS NOT NULL THEN
    v_body := replace(v_body, '{{supplier.name}}', v_sup_name);
    v_body := replace(v_body, '[LEVERANTÖRENS FIRMA]', v_sup_name);
  END IF;
  IF v_sup_org IS NOT NULL THEN
    v_body := replace(v_body, '{{supplier.org_number}}', v_sup_org);
    v_body := replace(v_body, '[ORGNR]', v_sup_org);
  END IF;
  IF v_sup_addr IS NOT NULL THEN
    v_body := replace(v_body, '{{supplier.address}}', v_sup_addr);
    v_body := replace(v_body, '[ADRESS]', v_sup_addr);
  END IF;
  IF v_sup_phone IS NOT NULL THEN
    v_body := replace(v_body, '{{supplier.phone}}', v_sup_phone);
    v_body := replace(v_body, '[TELEFON]', v_sup_phone);
  END IF;
  IF v_sup_email IS NOT NULL THEN
    v_body := replace(v_body, '{{supplier.email}}', v_sup_email);
    v_body := replace(v_body, '[E-POST]', v_sup_email);
  END IF;
  IF v_sup_signer IS NOT NULL THEN
    v_body := replace(v_body, '{{supplier.signatory}}', v_sup_signer);
    v_body := replace(v_body, '[NAMN]', v_sup_signer);
  END IF;

  -- Anything still unresolved keeps its placeholder rather than going blank —
  -- the whole point. A signer must be able to see what is missing.
  v_body := replace(v_body, '{{supplier.name}}', '[LEVERANTÖRENS FIRMA]');
  v_body := replace(v_body, '{{supplier.org_number}}', '[ORGNR]');
  v_body := replace(v_body, '{{supplier.address}}', '[ADRESS]');
  v_body := replace(v_body, '{{supplier.phone}}', '[TELEFON]');
  v_body := replace(v_body, '{{supplier.email}}', '[E-POST]');
  v_body := replace(v_body, '{{supplier.signatory}}', '[NAMN]');

  IF v_site_url IS NOT NULL THEN
    v_body := replace(v_body, '{{terms_url}}', rtrim(v_site_url, '/') || '/villkor');
    v_body := replace(v_body, '{{site_url}}', rtrim(v_site_url, '/'));
  END IF;
  -- Unset site URL: readable prose, never leftover markup.
  v_body := replace(v_body, '{{terms_url}}', 'Leverantörens webbplats');
  v_body := replace(v_body, '{{site_url}}', 'Leverantörens webbplats');

  INSERT INTO public.contracts
    (title, counterparty_name, counterparty_email, contract_type, status,
     company_id, quote_id, contract_number, start_date, end_date, value_cents, currency,
     renewal_type, renewal_notice_days,
     body_markdown, body_updated_at, template_id, version)
  VALUES
    (v_title, p_counterparty_name, p_counterparty_email, v_tpl.contract_type, 'draft',
     v_company_id, v_quote_id, v_number, v_start, v_end, v_value, v_currency,
     v_tpl.default_renewal_type, v_tpl.default_renewal_notice_days,
     v_body, now(), p_template_id, 1)
  RETURNING id INTO v_new_id;

  RETURN QUERY SELECT c.id, c.title, c.status FROM public.contracts c WHERE c.id = v_new_id;
END;
$$;

-- One token list, shared by the authoring skill and the renderer.
CREATE OR REPLACE FUNCTION public._contract_template_unrendered_tokens(p_body text)
RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(jsonb_agg(DISTINCT t[1]), '[]'::jsonb)
  FROM regexp_matches(p_body, '\{\{([^}]+)\}\}', 'g') AS t
  WHERE t[1] NOT IN ('counterparty.name','counterparty.email','today',
                     'start_date','end_date','value','currency','title',
                     'counterparty.org_number','counterparty.address',
                     'supplier.name','supplier.org_number','supplier.address',
                     'supplier.phone','supplier.email','supplier.signatory',
                     'contract.number','terms_url','site_url');
$$;
