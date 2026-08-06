-- The template asked for what the platform already knew.
--
-- Rehearsing the lead→contract chain live the evening before a demo, the
-- rendered agreement read:
--
--     Leverantör: [LEVERANTÖRENS FIRMA], org.nr [ORGNR], [ADRESS]
--     Kund: Demo Testkund AB, org.nr [KUNDENS ORGNR]
--
-- Every `{{token}}` had rendered correctly. The problem is that the templates
-- also carry 25 distinct BRACKET placeholders across 164 occurrences, and
-- nothing filled them — while `site_settings.company_profile` holds the
-- supplier's registered name, org number, address, postal code, city and CEO,
-- and `companies.address` holds the customer's.
--
-- This is the same finding as `20260807…` ("mallen bad om det plattformen redan
-- visste"), which fixed exactly one field. Roughly half of all placeholder
-- occurrences are pure derivation from data already stored.
--
-- DELIBERATELY NOT A TEMPLATE REWRITE. The previous author already set the
-- precedent inside this function:
--
--     v_body := replace(v_body, '[KUNDENS ORGNR]', v_org);
--
-- Following it means every template — the 15 that exist, and every one an
-- operator writes later, on every instance — is fixed by deploying this, with
-- no data migration and nothing to keep in sync. Both spellings are accepted:
-- `{{supplier.org_number}}` for templates authored from here on, and the
-- bracket form for the ones already written.
--
-- MISSING VALUES KEEP THEIR PLACEHOLDER, they do not become blank. A contract
-- that says `[TELEFON]` is visibly incomplete; one that says
-- "Felanmälan tas emot dygnet runt på  / " is a document that looks finished
-- and is not. On the instance this was written for, `contact_phone` and
-- `contact_email` are empty — so that path is the live case, not a hypothetical.
--
-- TWO THAT COULD HAVE BEEN DERIVED AND DELIBERATELY WERE NOT:
--   [TITEL] — the profile stores a `ceo` name but no title. Inferring "VD" from
--     the field's own name is a guess, and a signature block is the last place
--     software should guess. It stays a placeholder until a title is stored.
--   [MÅNAD ÅR] — the CPI base month in the indexation clause. It usually equals
--     the start month, but not always, and getting it wrong silently changes
--     what the customer pays every year. A visible placeholder is cheaper than
--     a wrong number in a price clause.
--
-- IT ALSO CORRECTS THE RETURN TYPE, which is a separate bug found on the way in.
-- `20260808180000` declares `TABLE(id uuid, title text, status text)`. The
-- function that is actually deployed returns
-- `TABLE(contract_id uuid, title text, status contract_status)` — and
-- `agent-execute` reads `row?.contract_id`. So the repo's shape would make
-- `manage_contract` answer `contract_id: undefined` on any fresh install, and
-- on an existing instance that migration cannot apply at all:
--
--     ERROR 42P13: cannot change return type of existing function
--
-- which is how it was found. This one DROPs first, so it lands on either
-- lineage, and settles on the shape the consumer reads.
--
-- OUT OF SCOPE, and worth stating so nobody thinks it was missed: the amounts,
-- quantities and hardware models ([BELOPP], [ANTAL], [MODELL] — 40% of
-- occurrences) live on the quote's line items, and `contracts` carries no
-- `quote_id`, `deal_id` or `lead_id` at all — only `company_id`. The agreement
-- cannot reach the deal it came from. That is a schema change, not a rendering
-- one.

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
     company_id, start_date, end_date, value_cents, currency,
     renewal_type, renewal_notice_days,
     body_markdown, body_updated_at, template_id, version)
  VALUES
    (v_title, p_counterparty_name, p_counterparty_email, v_tpl.contract_type, 'draft',
     v_company_id, v_start, v_end, v_value, v_currency,
     v_tpl.default_renewal_type, v_tpl.default_renewal_notice_days,
     v_body, now(), p_template_id, 1)
  RETURNING id INTO v_new_id;

  RETURN QUERY SELECT c.id, c.title, c.status FROM public.contracts c WHERE c.id = v_new_id;
END;
$$;

-- One token list, shared by the authoring skill and the renderer — the comment
-- on the original said it, so the new tokens go in the same place rather than
-- letting the validator reject a template that renders perfectly well.
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
                     'terms_url','site_url');
$$;
