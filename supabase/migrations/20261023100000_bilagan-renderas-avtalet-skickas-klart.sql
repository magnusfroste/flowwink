-- Bilagan renderas och avtalet skickas klart.
--
-- Hittat på optic 2026-10-19, när produktspecifikationen för Privat AI kopplades
-- som bilaga till ett testavtal (AGR-2026-00021):
--
--   1. En bilaga från en mall sparades ORENDERAD. manage_contract_appendix
--      kopierade mallens text rakt av — PUB-avtalet visade {{counterparty.name}}
--      och {{supplier.name}} där parterna ska stå, och "Till avtal:
--      [HUVUDAVTALETS NUMMER]" stod kvar fast numret var känt. Huvudavtalet
--      renderades; det kunden också skriver under gjorde det inte.
--   2. Inget hindrade att ett halvfärdigt avtal skickades. Signeringen prövade
--      bara att texten inte var tom: testavtalet hade gått iväg med 15 olösta
--      [HAKPARENTESER] och en bilagelista med bilagor som inte fanns.
--
-- Rättelsen:
--   - _render_contract_tokens(body, ctx) — renderingsblocket ur
--     create_contract_from_template, ORDAGRANT flyttat (plus null-skydd för ett
--     sammanhang läst ur en sparad rad). create_contract_from_template anropar
--     det med exakt samma värden som förut. EN renderare för huvudavtal och
--     bilagor; två skulle glida isär.
--   - _render_appendix_body(body, contract_id) — samma renderare med avtalets
--     egna uppgifter, plus [HUVUDAVTALETS NUMMER] → avtalets nummer.
--   - contract_signing_readiness(contract_id) — vad som står i vägen för
--     signering: orenderade {{tokens}} och olösta [HAKPARENTESER] i avtal och
--     bilagor STOPPAR; en bilaga som texten nämner men som inte är kopplad är en
--     VARNING (villkorade bilagor — fullmakt "endast modell 3" — får inte stoppa
--     ett korrekt avtal).
--   - Trigger: utkast → pending_signature vägras när något stoppar, oavsett väg
--     (agent, UI, SQL). Ett avtal som redan väntar på signatur påverkas inte.
--
-- Idempotent: CREATE OR REPLACE / DROP TRIGGER IF EXISTS.

-- ── 1. En renderare ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._render_contract_tokens(p_body text, p_ctx jsonb)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_body text;
  -- The agreement's own facts arrive in p_ctx; the supplier's and the site's
  -- are read here, from the one store every other surface reads.
  p_counterparty_name text := p_ctx->>'counterparty_name';
  p_counterparty_email text := p_ctx->>'counterparty_email';
  v_start date := COALESCE(NULLIF(p_ctx->>'start_date', '')::date, CURRENT_DATE);
  v_end date := NULLIF(p_ctx->>'end_date', '')::date;
  v_value bigint := NULLIF(p_ctx->>'value_cents', '')::bigint;
  v_currency text := NULLIF(p_ctx->>'currency', '');
  v_title text := p_ctx->>'title';
  v_number text := NULLIF(p_ctx->>'contract_number', '');
  v_org text := NULLIF(trim(p_ctx->>'org_number'), '');
  v_cp_addr text := NULLIF(trim(p_ctx->>'counterparty_address'), '');
  v_quote_id uuid := CASE WHEN (p_ctx->>'quote_id') ~* '^[0-9a-f-]{36}$'
                          THEN (p_ctx->>'quote_id')::uuid END;
  v_site_url text;
  v_terms_slug text;
  v_profile jsonb;
  v_sup_name text;
  v_sup_org text;
  v_sup_addr text;
  v_sup_phone text;
  v_sup_email text;
  v_sup_signer text;
  v_q record;
  v_rows text;
  v_lines text;
BEGIN
  IF p_body IS NULL THEN RETURN NULL; END IF;

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

  v_body := p_body;
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
  v_body := replace(v_body, '{{title}}', COALESCE(v_title, ''));

  -- The agreement can finally name itself.
  v_body := replace(v_body, '{{contract.number}}', COALESCE(v_number, '[AVTALSNR]'));
  v_body := replace(v_body, '[AVTALSNR]', COALESCE(v_number, '[AVTALSNR]'));

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


  RETURN v_body;
END;
$$;

REVOKE ALL ON FUNCTION public._render_contract_tokens(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._render_contract_tokens(text, jsonb) TO service_role;

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

  -- One renderer for every body of the agreement: this one and each appendix
  -- (_render_contract_tokens). The values are exactly the ones computed above.
  v_body := public._render_contract_tokens(v_tpl.body_markdown, jsonb_build_object(
    'counterparty_name', p_counterparty_name, 'counterparty_email', p_counterparty_email,
    'start_date', v_start, 'end_date', v_end, 'value_cents', v_value, 'currency', v_currency,
    'title', v_title, 'contract_number', v_number, 'org_number', v_org,
    'counterparty_address', v_cp_addr, 'quote_id', v_quote_id));

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

-- ── 2. Bilagan renderas med avtalets uppgifter ─────────────────────────────
CREATE OR REPLACE FUNCTION public._render_appendix_body(p_body text, p_contract_id uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_ctx jsonb;
  v_number text;
BEGIN
  IF p_body IS NULL THEN RETURN NULL; END IF;
  SELECT jsonb_build_object(
           'counterparty_name', c.counterparty_name, 'counterparty_email', c.counterparty_email,
           'start_date', c.start_date, 'end_date', c.end_date, 'value_cents', c.value_cents,
           'currency', c.currency, 'title', c.title, 'contract_number', c.contract_number,
           'quote_id', c.quote_id, 'org_number', co.org_number,
           'counterparty_address', NULLIF(trim(co.address), '')),
         c.contract_number
    INTO v_ctx, v_number
    FROM public.contracts c
    LEFT JOIN public.companies co ON co.id = c.company_id
   WHERE c.id = p_contract_id;
  IF v_ctx IS NULL THEN
    RAISE EXCEPTION 'Contract not found: %', p_contract_id;
  END IF;
  -- An appendix names its parent; the parent's number is known by now.
  RETURN replace(public._render_contract_tokens(p_body, v_ctx),
                 '[HUVUDAVTALETS NUMMER]', COALESCE(v_number, '[HUVUDAVTALETS NUMMER]'));
END;
$$;

REVOKE ALL ON FUNCTION public._render_appendix_body(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._render_appendix_body(text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.manage_contract_appendix(
  p_action text,
  p_contract_id uuid DEFAULT NULL,
  p_appendix_id uuid DEFAULT NULL,
  p_label text DEFAULT NULL,
  p_title text DEFAULT NULL,
  p_body_markdown text DEFAULT NULL,
  p_file_url text DEFAULT NULL,
  p_file_name text DEFAULT NULL,
  p_file_type text DEFAULT NULL,
  p_template text DEFAULT NULL,
  p_sort_order integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_order integer;
  v_kind text;
  v_body text;
  v_title text;
  v_tpl public.contract_templates%ROWTYPE;
  v_id uuid;
  v_result jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR is_staff(auth.uid())) THEN
    RAISE EXCEPTION 'Only staff can manage contract appendices';
  END IF;

  IF p_action = 'list' THEN
    IF p_contract_id IS NULL THEN
      RAISE EXCEPTION 'contract_id is required for action=list';
    END IF;
    SELECT jsonb_build_object('count', count(*), 'appendices', coalesce(jsonb_agg(
             jsonb_build_object('id', d.id, 'label', d.label, 'title', d.title,
                                'kind', d.kind, 'sort_order', d.sort_order,
                                'file_name', d.file_name, 'file_url', d.file_url,
                                'has_body', d.body_markdown IS NOT NULL)
             ORDER BY d.sort_order), '[]'::jsonb))
      INTO v_result
      FROM public.contract_documents d WHERE d.contract_id = p_contract_id;
    RETURN v_result;
  END IF;

  IF p_action = 'delete' THEN
    DELETE FROM public.contract_documents WHERE id = p_appendix_id;
    RETURN jsonb_build_object('deleted', p_appendix_id);
  END IF;

  IF p_action = 'update' THEN
    UPDATE public.contract_documents
       SET label = coalesce(p_label, label),
           title = coalesce(p_title, title),
           body_markdown = coalesce(p_body_markdown, body_markdown),
           sort_order = coalesce(p_sort_order, sort_order)
     WHERE id = p_appendix_id
     RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Appendix not found: %', p_appendix_id; END IF;
    RETURN jsonb_build_object('id', v_id, 'updated', true);
  END IF;

  IF p_action <> 'create' THEN
    RAISE EXCEPTION 'Unknown action: % (use list, create, update or delete)', p_action;
  END IF;

  IF p_contract_id IS NULL THEN
    RAISE EXCEPTION 'contract_id is required for action=create';
  END IF;

  -- Appendices are numbered in the order they are added unless told otherwise.
  SELECT coalesce(p_sort_order, coalesce(max(sort_order), 0) + 1)
    INTO v_order FROM public.contract_documents WHERE contract_id = p_contract_id;

  IF p_template IS NOT NULL THEN
    SELECT * INTO v_tpl FROM public.contract_templates
     WHERE id::text = p_template OR lower(name) = lower(p_template)
     LIMIT 1;
    IF v_tpl.id IS NULL THEN
      RAISE EXCEPTION 'Template not found: %. Run list_contract_templates first.', p_template;
    END IF;
    v_kind := 'document';
    -- Rendered with the agreement's own facts, by the agreement's renderer.
    -- It used to be copied raw: a data-processing appendix attached to an
    -- agreement on optic (2026-10-19) read "{{counterparty.name}}" where the
    -- customer's name belongs — the text the customer would have signed.
    v_body := public._render_appendix_body(v_tpl.body_markdown, p_contract_id);
    v_title := coalesce(p_title, v_tpl.name);
  ELSIF p_body_markdown IS NOT NULL AND trim(p_body_markdown) <> '' THEN
    v_kind := 'document'; v_body := public._render_appendix_body(p_body_markdown, p_contract_id); v_title := p_title;
  ELSIF p_file_url IS NOT NULL THEN
    v_kind := 'file'; v_title := coalesce(p_title, p_file_name);
  ELSE
    RAISE EXCEPTION 'An appendix needs content: pass template, body_markdown or file_url';
  END IF;

  INSERT INTO public.contract_documents
    (contract_id, kind, label, title, body_markdown, file_url, file_name, file_type,
     sort_order, template_id, uploaded_by, version)
  VALUES
    (p_contract_id, v_kind, coalesce(p_label, 'Bilaga ' || v_order), v_title, v_body,
     p_file_url, p_file_name, p_file_type, v_order, v_tpl.id, auth.uid(), 1)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'label', coalesce(p_label, 'Bilaga ' || v_order),
                            'title', v_title, 'kind', v_kind, 'sort_order', v_order);
END;
$$;

REVOKE ALL ON FUNCTION public.manage_contract_appendix(text, uuid, uuid, text, text, text, text, text, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_contract_appendix(text, uuid, uuid, text, text, text, text, text, text, text, integer) TO authenticated, service_role;

-- ── 3. Är avtalet klart att skickas? ───────────────────────────────────────
-- The check itself, unguarded — for the trigger and the public wrapper below
-- (both run as the owner) and the service role; never an end user. Elevating
-- the caller's role inside a trigger would leak into the rest of their
-- transaction; calling this does not.
CREATE OR REPLACE FUNCTION public._contract_signing_readiness(p_contract_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_c record;
  v_blocking jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_doc record;
  v_found text[];
  v_referenced int[] := '{}';
  v_attached int[] := '{}';
  v_line text;
  v_in_list boolean := false;
  v_n int;
BEGIN
  SELECT id, contract_number, body_markdown INTO v_c FROM public.contracts WHERE id = p_contract_id;
  IF v_c.id IS NULL THEN RAISE EXCEPTION 'Contract not found: %', p_contract_id; END IF;

  -- The agreement and every appendix with a text body: what a signer would read.
  FOR v_doc IN
    SELECT 'Avtalet'::text AS part, v_c.body_markdown AS body
    UNION ALL
    SELECT COALESCE(d.label, d.title, 'Bilaga'), d.body_markdown
      FROM public.contract_documents d
     WHERE d.contract_id = p_contract_id AND d.body_markdown IS NOT NULL
  LOOP
    CONTINUE WHEN v_doc.body IS NULL;
    SELECT array_agg(DISTINCT m[1]) INTO v_found
      FROM regexp_matches(v_doc.body, '(\{\{[^}]+\}\})', 'g') AS m;
    IF v_found IS NOT NULL THEN
      v_blocking := v_blocking || jsonb_build_object('part', v_doc.part, 'kind', 'unrendered_token', 'items', to_jsonb(v_found));
    END IF;
    -- [VERSALER …] is what a human must decide; a markdown link [Text](url) is not.
    SELECT array_agg(DISTINCT m[1]) INTO v_found
      FROM regexp_matches(v_doc.body, '(\[[A-ZÅÄÖ][^]\n]{0,120}\])(?!\()', 'g') AS m;
    IF v_found IS NOT NULL THEN
      v_blocking := v_blocking || jsonb_build_object('part', v_doc.part, 'kind', 'unresolved_bracket', 'items', to_jsonb(v_found));
    END IF;
  END LOOP;

  -- Appendices the agreement names: "Bilaga N" in the text, and the numbered
  -- list under a "Bilagor" heading.
  SELECT COALESCE(array_agg(DISTINCT (m[1])::int), '{}') INTO v_referenced
    FROM regexp_matches(COALESCE(v_c.body_markdown, ''), '[Bb]ilaga (\d+)', 'g') AS m;
  FOR v_line IN SELECT l FROM regexp_split_to_table(COALESCE(v_c.body_markdown, ''), E'\n') AS l LOOP
    IF v_line ~ '^\s*#' THEN
      v_in_list := v_line ~* 'bilagor';
    ELSIF v_in_list AND v_line ~ '^\s*\d+\.' THEN
      v_n := (substring(v_line from '^\s*(\d+)\.'))::int;
      IF NOT v_n = ANY(v_referenced) THEN v_referenced := v_referenced || v_n; END IF;
    END IF;
  END LOOP;
  SELECT COALESCE(array_agg(DISTINCT (m[1])::int), '{}') INTO v_attached
    FROM public.contract_documents d, regexp_matches(COALESCE(d.label, ''), '(\d+)') AS m
   WHERE d.contract_id = p_contract_id;
  SELECT v_warnings || COALESCE(jsonb_agg(jsonb_build_object(
           'kind', 'appendix_not_attached',
           'item', 'Bilaga ' || r,
           'hint', 'The agreement names Bilaga ' || r || ' but nothing is attached under that label — attach it (manage_contract_appendix) or, if it does not apply to this customer, remove it from the text.')
           ORDER BY r), '[]'::jsonb)
    INTO v_warnings
    FROM unnest(v_referenced) AS r
   WHERE NOT r = ANY(v_attached);

  RETURN jsonb_build_object(
    'contract_id', p_contract_id, 'contract_number', v_c.contract_number,
    'ready', jsonb_array_length(v_blocking) = 0,
    'blocking', v_blocking, 'warnings', v_warnings);
END;
$$;

REVOKE ALL ON FUNCTION public._contract_signing_readiness(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._contract_signing_readiness(uuid) TO service_role;

-- What agents and the admin call: staff only.
CREATE OR REPLACE FUNCTION public.contract_signing_readiness(p_contract_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (auth.role() = 'service_role' OR is_staff(auth.uid())) THEN
    RAISE EXCEPTION 'Only staff can read a contract''s signing readiness';
  END IF;
  RETURN public._contract_signing_readiness(p_contract_id);
END;
$$;

REVOKE ALL ON FUNCTION public.contract_signing_readiness(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contract_signing_readiness(uuid) TO authenticated, service_role;

-- ── 4. Ett utkast skickas inte halvfärdigt — oavsett väg ───────────────────
CREATE OR REPLACE FUNCTION public.contract_sent_only_when_ready()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_r jsonb;
  v_msg text;
BEGIN
  IF OLD.status = 'draft' AND NEW.status = 'pending_signature' THEN
    -- The unguarded check, as the definer: the guard sees every appendix
    -- whatever the caller's own row access is, and elevates nothing.
    v_r := public._contract_signing_readiness(NEW.id);
    IF NOT (v_r->>'ready')::boolean THEN
      SELECT string_agg(b->>'part' || ': ' || (SELECT string_agg(x, ', ') FROM jsonb_array_elements_text(b->'items') AS x), '; ')
        INTO v_msg FROM jsonb_array_elements(v_r->'blocking') AS b;
      RAISE EXCEPTION 'Contract % is not ready to send for signature — unresolved: %. Fill them in (manage_contract update body_markdown / manage_contract_appendix update), then send again.',
        COALESCE(NEW.contract_number, NEW.id::text), v_msg
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contract_sent_only_when_ready_trg ON public.contracts;
CREATE TRIGGER contract_sent_only_when_ready_trg
  BEFORE UPDATE OF status ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.contract_sent_only_when_ready();
