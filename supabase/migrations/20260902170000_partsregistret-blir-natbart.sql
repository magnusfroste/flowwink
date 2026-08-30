-- Partsregistret blir nåbart.
--
-- Fjorton steg byggde en modell som ingenting kunde läsa. En enda skill rörde
-- den; reskontran, linserna, adresserna och momsbehandlingen fanns bara i SQL.
-- Det är den största döda ratten i hela serien, byggd av den som ägnat serien
-- åt att döda döda rattar.
--
-- Två funktioner räcker för att göra den användbar för en agent: hitta en part,
-- och läsa hela bilden av den. UI:t kan komma efter — agentytan är FlowWinks
-- primära gränssnitt, den är billigare att bygga, och den lär oss om modellen
-- håller mot en riktig operatör i stället för mot mina egna testrader.

-- ── Hitta en part ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.search_partners(
  p_query text DEFAULT NULL,
  p_lens  text DEFAULT 'contacts',
  p_limit integer DEFAULT 25
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE v_rows jsonb; v_q text; v_total int;
BEGIN
  IF p_lens NOT IN ('contacts', 'customers', 'vendors') THEN
    RAISE EXCEPTION 'Unknown lens % — the three lenses over one table are contacts, customers, vendors', p_lens;
  END IF;
  v_q := nullif(trim(coalesce(p_query, '')), '');

  -- SECURITY INVOKER med flit: sökningen ska se exakt vad den som frågar får
  -- se. En SECURITY DEFINER här hade gjort partsregistret läsbart för roller
  -- som matrisen nekar.
  WITH base AS (
    SELECT p.* FROM partners p
     WHERE p.active
       AND (p_lens <> 'customers' OR p.customer_rank > 0)
       AND (p_lens <> 'vendors'   OR p.supplier_rank > 0)
       AND (v_q IS NULL
            OR p.name ILIKE '%' || v_q || '%'
            OR p.email ILIKE '%' || v_q || '%'
            OR p.company_registry ILIKE '%' || v_q || '%'
            OR p.vat ILIKE '%' || v_q || '%')
  )
  SELECT count(*), coalesce(jsonb_agg(x ORDER BY x->>'name'), '[]'::jsonb)
    INTO v_total, v_rows
  FROM (
    SELECT jsonb_build_object(
      'partner_id', b.id,
      'name', b.name,
      'is_company', b.is_company,
      'type', b.type,
      'email', b.email,
      'belongs_to', (SELECT c.name FROM partners c WHERE c.id = b.commercial_partner_id AND c.id <> b.id),
      'is_customer', b.customer_rank > 0,
      'is_vendor', b.supplier_rank > 0,
      'country', b.country_code
    ) AS x
    FROM base b
    ORDER BY b.is_company DESC, b.name
    LIMIT greatest(1, least(coalesce(p_limit, 25), 200))
  ) s;

  RETURN jsonb_build_object(
    'lens', p_lens,
    'query', coalesce(v_q, '(all)'),
    'matches', v_total,
    'returned', jsonb_array_length(v_rows),
    'partners', v_rows,
    'note', CASE WHEN v_total > jsonb_array_length(v_rows)
      THEN format('%s more match than were returned — narrow the query or raise the limit.', v_total - jsonb_array_length(v_rows))
      ELSE 'every match is listed' END);
END $$;

REVOKE ALL ON FUNCTION public.search_partners(text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_partners(text, text, integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.search_partners(text, text, integer) IS
  'Söker i partsregistret genom en av de tre linserna. SECURITY INVOKER: '
  'sökningen ser exakt vad frågeställaren får se.';

-- ── Läs hela bilden av en part ─────────────────────────────────────────────
-- Kundkortet. Det som avgör om modellen känns rätt när någon faktiskt använder
-- den — och därför byggt för att svara ÄRLIGT: det som saknas rapporteras som
-- saknat i stället för att utelämnas, för ett kort utan fakturaadress och ett
-- kort som inte visar fakturaadresser ser likadana ut.
CREATE OR REPLACE FUNCTION public.read_partner(
  p_partner text
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_id uuid; v_p partners%ROWTYPE; v_com partners%ROWTYPE;
  v_n int;
BEGIN
  -- id, e-post eller namn — en agent har sällan ett uuid till hands.
  BEGIN
    v_id := p_partner::uuid;
  EXCEPTION WHEN others THEN
    SELECT id INTO v_id FROM partners
     WHERE active AND (lower(email) = lower(trim(p_partner)) OR lower(name) = lower(trim(p_partner)))
     ORDER BY is_company ASC, created_at ASC LIMIT 1;
    IF v_id IS NULL THEN
      SELECT id INTO v_id FROM partners
       WHERE active AND name ILIKE '%' || trim(p_partner) || '%'
       LIMIT 2;
      SELECT count(*) INTO v_n FROM partners
       WHERE active AND name ILIKE '%' || trim(p_partner) || '%';
      IF v_n > 1 THEN
        RETURN jsonb_build_object('ok', false,
          'reason', format('%s partners match "%s" — search_partners first and pass an id', v_n, p_partner));
      END IF;
    END IF;
  END;

  SELECT * INTO v_p FROM partners WHERE id = v_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', format('no partner matches "%s"', p_partner));
  END IF;
  SELECT * INTO v_com FROM partners WHERE id = v_p.commercial_partner_id;

  RETURN jsonb_build_object(
    'ok', true,
    'partner_id', v_p.id,
    'name', v_p.name,
    'is_company', v_p.is_company,
    'lenses', (SELECT jsonb_agg(l) FROM (
        SELECT 'contact' AS l
        UNION ALL SELECT 'customer' WHERE v_p.customer_rank > 0
        UNION ALL SELECT 'vendor'   WHERE v_p.supplier_rank > 0) x),

    'billed_to', jsonb_build_object(
      'partner_id', v_com.id, 'name', v_com.name,
      'is_the_partner_itself', v_com.id = v_p.id,
      'why', 'The legal entity the ledger books on. Documents may be addressed to a contact; money is always owed by this one.'),

    'identity', jsonb_build_object(
      'email', v_p.email, 'phone', v_p.phone,
      'company_registry', v_p.company_registry, 'vat', v_p.vat,
      'country', v_p.country_code,
      'language', (public.partner_language(v_p.id) ->> 'lang'),
      'language_source', (public.partner_language(v_p.id) ->> 'lang_source')),

    'commercial_terms', jsonb_build_object(
      'payment_terms', v_p.payment_terms,
      'currency', v_p.currency,
      'credit_limit_cents', v_p.credit_limit_cents,
      'inherited_from', CASE WHEN v_com.id <> v_p.id THEN v_com.name ELSE NULL END),

    'tax_treatment', public.partner_fiscal_position(v_p.id),

    'hierarchy', jsonb_build_object(
      'parent', (SELECT jsonb_build_object('partner_id', pa.id, 'name', pa.name)
                   FROM partners pa WHERE pa.id = v_p.parent_id),
      'contacts', coalesce((SELECT jsonb_agg(jsonb_build_object('partner_id', c.id, 'name', c.name, 'email', c.email))
                   FROM partners c WHERE c.parent_id = v_p.id AND c.type = 'contact' AND c.active), '[]'::jsonb)),

    -- Adresserna hänger på den JURIDISKA PERSONEN, inte på kontaktpersonen.
    -- Ett kort för Karin som visade noll adresser medan bolaget har en
    -- fakturaadress vore missvisande — hon faktureras till den.
    'addresses', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'partner_id', a.id, 'type', a.type, 'name', a.name,
        'street', a.street, 'postal_code', a.postal_code, 'city', a.city,
        'country', a.country_code,
        'on', CASE WHEN a.parent_id = v_p.id THEN 'this partner' ELSE v_com.name END)
        ORDER BY a.type)
      FROM partners a
      WHERE a.commercial_partner_id = v_com.id AND a.type <> 'contact' AND a.active), '[]'::jsonb),
    'default_addresses', jsonb_build_object(
      'invoice',  (SELECT p2.name FROM partners p2 WHERE p2.id = public.partner_address(v_p.id, 'invoice')),
      'delivery', (SELECT p2.name FROM partners p2 WHERE p2.id = public.partner_address(v_p.id, 'delivery')),
      'note', 'What a new document would default to. A partner with no registered address is its own address.'),

    'bank_accounts', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'bank_account_id', b.id, 'acc_number', b.acc_number,
        'payable', b.allow_out_payment,
        'note', CASE WHEN b.allow_out_payment THEN 'approved for outgoing payments'
                     ELSE 'registered but NOT approved — approval lapses whenever the number changes' END))
      FROM partner_bank_accounts b WHERE b.partner_id = v_com.id AND b.active), '[]'::jsonb),

    'ledger', jsonb_build_object(
      'balance_by_account', coalesce((SELECT jsonb_agg(jsonb_build_object(
          'account_code', l.account_code, 'role', l.partner_ledger_role,
          'balance_cents', l.balance_cents, 'lines', l.line_count))
        FROM v_partner_ledger l WHERE l.partner_id = v_com.id), '[]'::jsonb),
      'note', 'Grouped on the legal entity, never on the contact.'),

    'documents', jsonb_build_object(
      'invoices', (SELECT count(*) FROM invoices d WHERE d.partner_id = v_p.id),
      'quotes', (SELECT count(*) FROM quotes d WHERE d.partner_id = v_p.id),
      'orders', (SELECT count(*) FROM orders d WHERE d.partner_id = v_p.id),
      'subscriptions', (SELECT count(*) FROM subscriptions d WHERE d.partner_id = v_p.id),
      'tickets', (SELECT count(*) FROM tickets d WHERE d.partner_id = v_p.id),
      'contracts', (SELECT count(*) FROM contracts d WHERE d.partner_id = v_p.id)),

    'gaps', (SELECT coalesce(jsonb_agg(g), '[]'::jsonb) FROM (
        SELECT 'no organisation number on file — an invoice needs it' AS g
          WHERE v_com.is_company AND coalesce(trim(v_com.company_registry), '') = ''
        UNION ALL SELECT 'no email — nothing can be sent to this party'
          WHERE coalesce(trim(v_p.email), '') = '' AND NOT v_p.is_company
        UNION ALL SELECT 'no payment terms — every document must set them by hand'
          WHERE coalesce(trim(v_p.payment_terms), '') = ''
        UNION ALL SELECT 'no tax treatment chosen — a proposal exists but nobody has accepted it'
          WHERE v_p.fiscal_position_id IS NULL
      ) x));
END $$;

REVOKE ALL ON FUNCTION public.read_partner(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.read_partner(text) TO authenticated, service_role;

COMMENT ON FUNCTION public.read_partner(text) IS
  'Kundkortet: identitet, hierarki, adresser, bankkonton, villkor, '
  'momsbehandling, reskontra och dokument. Rapporterar VAD SOM SAKNAS i '
  '"gaps" — ett kort utan fakturaadress och ett kort som inte visar '
  'fakturaadresser ser annars likadana ut.';
