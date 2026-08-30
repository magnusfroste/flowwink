-- Kundryggraden, steg 17: parten kan pensioneras.
--
-- Sexton steg byggde ett register där ingenting går att ta bort — med flit:
-- partners_no_delete_with_history vägrar radera en part som något dokument
-- pekar på, och det är rätt. Men "arkivera, radera aldrig" var bara halva
-- löftet. `partners.active` finns i schemat och INGENTING exponerar den. En
-- part som skapats av misstag — en dubblett som inte gick att slå ihop, en
-- felstavad kund, ett provbolag — kan varken tas bort eller pensioneras.
--
-- Det är samma klass av död ratt som steg 15 stängde: en förmåga som finns i
-- modellen men saknar väg ut till den som ska använda den.
--
-- ODOO-BETEENDET, verifierat ur 18.0-källan och inte ur minnet:
--   * `active` är ett vanligt fält utan egen logik
--   * INGEN kaskad till barn — child_ids filtrerar bara på active i sin domän
--   * commercial_partner_id räknas INTE om vid arkivering
--   * write() VÄGRAR arkivera en part med ett aktivt inloggningskonto
--
-- Vi följer det, med ett tillägg som är vårt eget: arkivering RAPPORTERAR vad
-- den lämnade efter sig — barn som fortfarande är aktiva, obetalda fakturor,
-- levande prenumerationer. Att tysta ner en kund som är skyldig pengar är
-- inget att förbjuda (det är reversibelt på en sekund), men det är något att
-- SÄGA. Samma hållning som `gaps` i kundkortet: rapportera, gata inte.
--
-- Egen part (is_self) skyddas redan av partners_self_protection. Den här
-- funktionen fångar det före triggern bara för att ge ett begripligare svar.

-- ── Att hitta tillbaka är en del av att arkivera ───────────────────────────
-- Utan det här är arkivering en enkelriktad gata: parten försvinner ur linsen
-- och kan aldrig återställas därför att ingenting hittar den längre.
DROP FUNCTION IF EXISTS public.search_partners(text, text, integer);

CREATE OR REPLACE FUNCTION public.search_partners(
  p_query text DEFAULT NULL,
  p_lens  text DEFAULT 'contacts',
  p_limit integer DEFAULT 25,
  p_include_archived boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE v_rows jsonb; v_q text; v_total int; v_hidden int;
BEGIN
  IF p_lens NOT IN ('contacts', 'customers', 'vendors') THEN
    RAISE EXCEPTION 'Unknown lens % — the three lenses over one table are contacts, customers, vendors', p_lens;
  END IF;
  v_q := nullif(trim(coalesce(p_query, '')), '');

  WITH base AS (
    SELECT p.* FROM partners p
     WHERE (p.active OR p_include_archived)
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
      'archived', NOT b.active,
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

  -- Antalet dolda sägs rakt ut. En sökning som tyst utelämnar arkiverade och
  -- en sökning där det inte FINNS några arkiverade ser annars likadana ut.
  SELECT count(*) INTO v_hidden FROM partners p
   WHERE NOT p.active
     AND (p_lens <> 'customers' OR p.customer_rank > 0)
     AND (p_lens <> 'vendors'   OR p.supplier_rank > 0)
     AND (v_q IS NULL
          OR p.name ILIKE '%' || v_q || '%'
          OR p.email ILIKE '%' || v_q || '%'
          OR p.company_registry ILIKE '%' || v_q || '%'
          OR p.vat ILIKE '%' || v_q || '%');

  RETURN jsonb_build_object(
    'lens', p_lens,
    'query', coalesce(v_q, '(all)'),
    'includes_archived', p_include_archived,
    'archived_matches', v_hidden,
    'matches', v_total,
    'returned', jsonb_array_length(v_rows),
    'partners', v_rows,
    'note', CASE
      WHEN v_total > jsonb_array_length(v_rows)
        THEN format('%s more match than were returned — narrow the query or raise the limit.', v_total - jsonb_array_length(v_rows))
      WHEN NOT p_include_archived AND v_hidden > 0
        THEN CASE WHEN v_hidden = 1
               THEN '1 archived party also matches — pass include_archived to see it.'
               ELSE format('%s archived parties also match — pass include_archived to see them.', v_hidden) END
      ELSE 'every match is listed' END);
END $$;

REVOKE ALL ON FUNCTION public.search_partners(text, text, integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_partners(text, text, integer, boolean) TO authenticated, service_role;

COMMENT ON FUNCTION public.search_partners(text, text, integer, boolean) IS
  'Söker i partsregistret genom en av de tre linserna. SECURITY INVOKER. '
  'Arkiverade utelämnas som standard men RÄKNAS och rapporteras — annars vore '
  'arkivering en enkelriktad gata.';

-- ── read_partner hittar den arkiverade ────────────────────────────────────
-- Patchad ur den LEVANDE definitionen, inte kopierad ur en gammal migrering:
-- att återställa en äldre kropp genom CREATE OR REPLACE är en bugg jag redan
-- gjort en gång i den här serien.
CREATE OR REPLACE FUNCTION public.read_partner(p_partner text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid; v_p partners%ROWTYPE; v_com partners%ROWTYPE;
  v_n int;
BEGIN
  -- id, e-post eller namn — en agent har sällan ett uuid till hands.
  BEGIN
    v_id := p_partner::uuid;
  EXCEPTION WHEN others THEN
    SELECT id INTO v_id FROM partners
     WHERE (lower(email) = lower(trim(p_partner)) OR lower(name) = lower(trim(p_partner)))
     ORDER BY active DESC, is_company ASC, created_at ASC LIMIT 1;
    IF v_id IS NULL THEN
      SELECT id INTO v_id FROM partners
       WHERE name ILIKE '%' || trim(p_partner) || '%'
       ORDER BY active DESC LIMIT 1;
      SELECT count(*) INTO v_n FROM partners
       WHERE name ILIKE '%' || trim(p_partner) || '%';
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
    'archived', NOT v_p.active,
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
END $function$;

REVOKE ALL ON FUNCTION public.read_partner(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.read_partner(text) TO authenticated, service_role;

-- ── Pensioneringen ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.archive_partner(
  p_partner  text,
  p_archive  boolean DEFAULT true,
  p_reason   text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid; v_p partners%ROWTYPE; v_n int;
  v_left jsonb; v_open jsonb; v_account boolean;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role)
          OR can_access_module(auth.uid(), 'leads')) THEN
    RAISE EXCEPTION 'Forbidden: retiring a party requires CRM access';
  END IF;

  -- Uppslaget måste hitta ARKIVERADE också, annars går ingenting att återställa.
  BEGIN
    v_id := p_partner::uuid;
  EXCEPTION WHEN others THEN
    SELECT id INTO v_id FROM partners
     WHERE lower(email) = lower(trim(p_partner)) OR lower(name) = lower(trim(p_partner))
     ORDER BY active DESC, is_company ASC, created_at ASC LIMIT 1;
    IF v_id IS NULL THEN
      SELECT count(*) INTO v_n FROM partners WHERE name ILIKE '%' || trim(p_partner) || '%';
      IF v_n > 1 THEN
        RETURN jsonb_build_object('ok', false,
          'reason', format('%s partners match "%s" — search_partners first and pass an id', v_n, p_partner));
      END IF;
      SELECT id INTO v_id FROM partners WHERE name ILIKE '%' || trim(p_partner) || '%' LIMIT 1;
    END IF;
  END;

  SELECT * INTO v_p FROM partners WHERE id = v_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', format('no partner matches "%s"', p_partner));
  END IF;

  -- Egen part. Triggern vägrar ändå; det här ger bara ett svar man förstår.
  IF v_p.is_self AND p_archive THEN
    RETURN jsonb_build_object('ok', false, 'partner_id', v_p.id, 'name', v_p.name,
      'reason', 'this is our own company — it cannot be retired while we are still here',
      'what_to_do', 'change the company identity in site settings instead');
  END IF;

  IF v_p.active = (NOT p_archive) THEN
    -- Redan i önskat läge. Idempotent, inte ett fel.
    RETURN jsonb_build_object('ok', true, 'partner_id', v_p.id, 'name', v_p.name,
      'archived', p_archive, 'changed', false,
      'note', format('already %s — nothing to do', CASE WHEN p_archive THEN 'archived' ELSE 'active' END));
  END IF;

  UPDATE partners SET active = NOT p_archive WHERE id = v_id;

  -- Vad som lämnades kvar. INGEN kaskad — det är Odoos beteende och vårt: ett
  -- barn är en egen part med egna relationer, inte en detalj hos föräldern.
  -- Men tystnad om det vore en lögn, så det räknas och sägs.
  SELECT jsonb_build_object(
      'contacts', count(*) FILTER (WHERE type = 'contact' AND active),
      'addresses', count(*) FILTER (WHERE type <> 'contact' AND active))
    INTO v_left
    FROM partners WHERE parent_id = v_id;

  SELECT jsonb_build_object(
      'unpaid_invoices', (SELECT count(*) FROM invoices i
                           WHERE i.partner_id = v_id AND i.status NOT IN ('paid', 'cancelled', 'void')),
      'live_subscriptions', (SELECT count(*) FROM subscriptions s
                           WHERE s.partner_id = v_id AND s.status = 'active'),
      'open_tickets', (SELECT count(*) FROM tickets t
                           WHERE t.partner_id = v_id AND t.status NOT IN ('closed', 'resolved')))
    INTO v_open;

  -- Odoo vägrar arkivera en part med aktivt inloggningskonto. Vi har ingen
  -- FK mellan part och konto, bara e-posten — så det RAPPORTERAS i stället för
  -- att blockera. Att gata på en gissning är värre än att inte gata alls.
  SELECT EXISTS (SELECT 1 FROM auth.users u
                  WHERE lower(u.email) = lower(coalesce(v_p.email, '@none'))
                    AND u.deleted_at IS NULL)
    INTO v_account;

  RETURN jsonb_build_object(
    'ok', true,
    'partner_id', v_p.id,
    'name', v_p.name,
    'archived', p_archive,
    'changed', true,
    'reason_given', p_reason,
    'left_active_underneath', v_left,
    'open_items', v_open,
    'has_a_login_account', v_account,
    'note', CASE WHEN p_archive
      THEN 'Archived, not deleted — every document still points at this party and the ledger is unchanged. '
        || 'It no longer appears in search_partners unless include_archived is passed.'
      ELSE 'Restored. It appears in the lenses again.' END,
    'warnings', (SELECT coalesce(jsonb_agg(w), '[]'::jsonb) FROM (
        SELECT 'archived while money is still owed — the receivable stays on the ledger, only the party is hidden' AS w
          WHERE p_archive AND (v_open ->> 'unpaid_invoices')::int > 0
        UNION ALL SELECT 'archived while a subscription is still billing — it will keep charging'
          WHERE p_archive AND (v_open ->> 'live_subscriptions')::int > 0
        UNION ALL SELECT 'this party has a login account — archiving does not revoke it'
          WHERE p_archive AND v_account
        UNION ALL SELECT format('%s contact(s) under it stay active and still book on it',
                                v_left ->> 'contacts')
          WHERE p_archive AND (v_left ->> 'contacts')::int > 0
      ) x));
END $$;

REVOKE ALL ON FUNCTION public.archive_partner(text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_partner(text, boolean, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.archive_partner(text, boolean, text) IS
  'Pensionerar eller återställer en part. Arkiverar, raderar aldrig — '
  'dokumenten och huvudboken är orörda. Ingen kaskad till barn (Odoo 18), men '
  'allt som lämnas kvar rapporteras: aktiva barn, obetalda fakturor, levande '
  'prenumerationer, inloggningskonto.';

-- ── Invarianten in i kedjan ────────────────────────────────────────────────
-- Pensioneringen är värdelös om den är enkelriktad. Påståendet mäter hela
-- rundan: ut ur linsen, fortfarande läsbar, och tillbaka igen.
CREATE OR REPLACE FUNCTION public.assert_a_party_can_be_retired()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_r jsonb; v_self uuid;
BEGIN
  INSERT INTO partners (name, is_company, company_registry, customer_rank)
  VALUES ('Pensionsprovet AB', true, '556000-1717', 1) RETURNING id INTO v_id;

  v_r := public.archive_partner(v_id::text, true, 'nightly invariant');
  IF NOT (v_r ->> 'ok')::boolean OR NOT (v_r ->> 'archived')::boolean THEN
    RAISE EXCEPTION 'retire check: a party could not be archived — %', v_r ->> 'reason';
  END IF;

  IF (public.search_partners('Pensionsprovet', 'customers') -> 'matches')::int <> 0 THEN
    RAISE EXCEPTION 'retire check: an archived party still shows in the customers lens';
  END IF;
  IF (public.search_partners('Pensionsprovet', 'customers', 25, true) -> 'matches')::int <> 1 THEN
    RAISE EXCEPTION 'retire check: an archived party is invisible even WITH include_archived — archiving would be a one-way street';
  END IF;
  IF NOT (public.read_partner('Pensionsprovet AB') -> 'archived')::boolean THEN
    RAISE EXCEPTION 'retire check: the card does not say the party is archived';
  END IF;

  v_r := public.archive_partner(v_id::text, false);
  IF (public.search_partners('Pensionsprovet', 'customers') -> 'matches')::int <> 1 THEN
    RAISE EXCEPTION 'retire check: a restored party did not come back to the lens';
  END IF;

  -- Vår egen part går aldrig att pensionera.
  SELECT id INTO v_self FROM partners WHERE is_self;
  IF v_self IS NOT NULL
     AND (public.archive_partner(v_self::text, true) ->> 'ok')::boolean THEN
    RAISE EXCEPTION 'retire check: our own company was allowed to be retired';
  END IF;

  DELETE FROM partners WHERE id = v_id;
END $$;

REVOKE ALL ON FUNCTION public.assert_a_party_can_be_retired() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_a_party_can_be_retired() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.sandbox_seed_subscriptions()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v jsonb;
BEGIN
  v := public.sandbox_seed_subscriptions_core();
  PERFORM public.assert_ledger_rolls_up_to_company();
  PERFORM public.assert_invoiced_customer_is_visible();
  PERFORM public.assert_no_silently_unbillable_subscriptions();
  PERFORM public.assert_commercial_fields_inherit();
  PERFORM public.assert_bank_account_rules();
  PERFORM public.assert_language_is_personal_not_commercial();
  PERFORM public.assert_own_company_is_a_party();
  PERFORM public.assert_company_and_party_share_an_id();
  PERFORM public.assert_a_party_can_be_retired();
  RETURN v || jsonb_build_object(
    'ledger_rolls_up_to_the_company', true,
    'invoiced_customers_visible_in_the_lens', true,
    'no_silently_unbillable_subscriptions', true,
    'commercial_fields_inherit', true,
    'bank_accounts_belong_to_the_legal_entity', true,
    'language_is_personal_not_commercial', true,
    'our_own_company_is_a_party', true,
    'company_and_party_share_an_id', true,
    'a_party_can_be_retired', true);
END $function$;

REVOKE ALL ON FUNCTION public.sandbox_seed_subscriptions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sandbox_seed_subscriptions() TO authenticated, service_role;
