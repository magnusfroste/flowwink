-- The terms link gets an English default — and no existing instance moves.
--
-- 20260808250000 replaced the Swedish-only /villkor route with a `terms` block
-- on any page plus general.termsSlug, and kept 'villkor' as the fallback "so
-- every existing instance keeps working unchanged". That fallback then leaked
-- into the product's own surface: the Site Settings placeholder read "villkor"
-- on an English admin (Magnus, 2026-10-02), and the Terms block's default title
-- and subtitle were Swedish on every site.
--
-- Two steps, in this order:
--   1. Every instance that RELIED on the fallback — no termsSlug stored, and a
--      page at /villkor to point at — gets 'villkor' written explicitly. Its
--      agreements keep building the same link; the fact just moves from a
--      function body into the setting where the admin can see and change it.
--      An instance with no such page never had a working link, so nothing is
--      written and it inherits the new default like a fresh install.
--   2. The fallback in create_contract_from_template becomes 'terms'. The body
--      is otherwise copied verbatim from 20260808250000 — CREATE OR REPLACE
--      needs the whole function.
--
-- Audience, declared: the function is called by the admin UI (authenticated)
-- and by agent-execute (service_role); anon was revoked in 20260822020000.
-- Idempotent: the UPDATE is self-limiting, the rest is CREATE OR REPLACE.

UPDATE public.site_settings
   SET value = value || jsonb_build_object('termsSlug', 'villkor'),
       updated_at = now()
 WHERE key = 'general'
   AND NULLIF(trim(value->>'termsSlug'), '') IS NULL
   AND EXISTS (SELECT 1 FROM public.pages p WHERE p.slug = 'villkor');

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
  v_terms_slug text;
  v_profile jsonb;
  v_sup_name text;
  v_sup_org text;
  v_sup_addr text;
  v_sup_phone text;
  v_sup_email text;
  v_sup_signer text;
  v_cp_addr text;
  v_q record;
  v_rows text;
  v_lines text;
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
  -- Through the quote — the rung that was missing. AGR-2026-00005 rendered
  -- "[KUNDENS ORGNR]" with the org number sitting in companies, because the
  -- only path to it was matching 'liteit' against 'Liteit AB' by name.
  -- The quote's own company_id first, then its deal's lead, so a quote from
  -- before the inherit-trigger still resolves.
  IF v_company_id IS NULL AND v_quote_id IS NOT NULL THEN
    SELECT COALESCE(q.company_id, l.company_id) INTO v_company_id
    FROM public.quotes q
    LEFT JOIN public.deals d ON d.id = q.deal_id
    LEFT JOIN public.leads l ON l.id = d.lead_id
    WHERE q.id = v_quote_id;
  END IF;
  -- Name match stays LAST RESORT and stays exact: fuzzy-matching a company
  -- into a legal document risks the wrong company's registered data, which is
  -- far worse than a visible bracket.
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
  SELECT NULLIF(trim(value->>'siteUrl'), ''),
         COALESCE(NULLIF(trim(value->>'termsSlug'), ''), 'terms')
  INTO v_site_url, v_terms_slug
  FROM public.site_settings WHERE key = 'general';
  v_terms_slug := COALESCE(v_terms_slug, 'terms');

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
  v_body := replace(v_body, '{{counterparty.name}}', COALESCE(p_counterparty_name, ''));
  v_body := replace(v_body, '{{counterparty.email}}', COALESCE(p_counterparty_email, ''));
  v_body := replace(v_body, '{{today}}', to_char(CURRENT_DATE, 'YYYY-MM-DD'));
  v_body := replace(v_body, '{{start_date}}', to_char(v_start, 'YYYY-MM-DD'));
  v_body := replace(v_body, '{{end_date}}', COALESCE(to_char(v_end, 'YYYY-MM-DD'), 'TBD'));
  -- NULL poisons replace(): one NULL argument nulls the ENTIRE body. The UI
  -- dialog always sends value_cents so this never fired from there — but an
  -- agent calling the RPC bare, against a template with no default value,
  -- got a contract with a NULL body and a success envelope. Unknown renders
  -- as the visible bracket, per the convention everywhere else in this body.
  v_body := replace(v_body, '{{value}}',
    COALESCE(to_char(v_value / 100.0, 'FM999G999G999D00'), '[BELOPP]'));
  v_body := replace(v_body, '{{currency}}', COALESCE(v_currency, '[VALUTA]'));
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

  -- ── the quote's agreed lines, reproduced verbatim ───────────────────────
  -- REPRODUCTION, not derivation: no monthly amount is computed, no split
  -- into one-off vs recurring is guessed — the table shows exactly what the
  -- customer accepted, with the quote number as provenance. quote_items is
  -- canonical; the legacy line_items jsonb is the fallback (both shapes are
  -- live). Optional lines the customer did not select are excluded: the
  -- agreement reproduces what was AGREED.
  IF v_quote_id IS NOT NULL THEN
    SELECT q.quote_number, q.subtotal_cents, q.tax_cents, q.total_cents,
           q.currency AS q_currency, q.line_items
    INTO v_q FROM public.quotes q WHERE q.id = v_quote_id;

    SELECT string_agg(
      '| ' || COALESCE(qi.description, '') ||
      ' | ' || public._fmt_qty_sv(qi.quantity) ||
      COALESCE(' ' || NULLIF(trim(qi.unit), ''), '') ||
      ' | ' || public._fmt_amount_sv(qi.unit_price_cents) ||
      ' | ' || public._fmt_amount_sv(qi.line_total_cents) || ' |',
      E'\n' ORDER BY qi.position)
    INTO v_rows
    FROM public.quote_items qi
    WHERE qi.quote_id = v_quote_id
      AND (NOT qi.is_optional OR qi.selected_by_customer);

    IF v_rows IS NULL AND v_q.line_items IS NOT NULL THEN
      SELECT string_agg(
        '| ' || COALESCE(li->>'description', '') ||
        ' | ' || COALESCE(li->>'qty', '1') ||
        ' | ' || public._fmt_amount_sv(COALESCE((li->>'unit_price_cents')::bigint, 0)) ||
        ' | ' || public._fmt_amount_sv((COALESCE((li->>'qty')::numeric, 1) * COALESCE((li->>'unit_price_cents')::bigint, 0))::bigint) || ' |',
        E'\n')
      INTO v_rows
      FROM jsonb_array_elements(v_q.line_items) AS li;
    END IF;

    IF v_rows IS NOT NULL THEN
      v_lines := 'Enligt accepterad offert **' || COALESCE(v_q.quote_number, '') || '**:'
        || E'\n\n| Post | Antal | À-pris | Summa |\n|---|---|---|---|\n' || v_rows
        || E'\n\n**Summa exkl. moms:** '
        || COALESCE(public._fmt_amount_sv(v_q.subtotal_cents), '—')
        || ' ' || COALESCE(v_q.q_currency, '')
        || E'  \n**Moms:** '
        || COALESCE(public._fmt_amount_sv(v_q.tax_cents), '—')
        || ' ' || COALESCE(v_q.q_currency, '')
        || E'  \n**Totalt inkl. moms:** '
        || COALESCE(public._fmt_amount_sv(v_q.total_cents), '—')
        || ' ' || COALESCE(v_q.q_currency, '');
    END IF;
  END IF;
  -- Unknown renders as the visible bracket, like every other gap in this body.
  v_body := replace(v_body, '{{quote.lines}}',
    COALESCE(v_lines, '[PRISER ENLIGT ACCEPTERAD OFFERT]'));

  IF v_site_url IS NOT NULL THEN
    v_body := replace(v_body, '{{terms_url}}', rtrim(v_site_url, '/') || '/' || v_terms_slug);
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

REVOKE EXECUTE ON FUNCTION public.create_contract_from_template(uuid, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_contract_from_template(uuid, text, text, jsonb) TO authenticated, service_role;
