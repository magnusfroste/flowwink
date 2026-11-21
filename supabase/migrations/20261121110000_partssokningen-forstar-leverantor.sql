-- search_partners understands the words agents use for its lenses (2026-11-21).
--
-- Read on Nordbrygg: an agent asked for lens 'supplier' and was refused ("the
-- three lenses … are contacts, customers, vendors"). A supplier IS a vendor; the
-- skill now takes supplier(s), vendor, customer, client(s) and contact, and
-- answers with the lens it used. An unknown word is still refused.

CREATE OR REPLACE FUNCTION public.search_partners(
  p_query text DEFAULT NULL,
  p_lens  text DEFAULT 'contacts',
  p_limit integer DEFAULT 25,
  p_include_archived boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE v_rows jsonb; v_q text; v_total int; v_hidden int;
BEGIN
  -- The words people and agents use for the three lenses (2026-11-21).
  p_lens := CASE lower(btrim(coalesce(p_lens, 'contacts')))
    WHEN 'contact' THEN 'contacts' WHEN 'all' THEN 'contacts' WHEN 'partners' THEN 'contacts'
    WHEN 'customer' THEN 'customers' WHEN 'client' THEN 'customers' WHEN 'clients' THEN 'customers'
    WHEN 'vendor' THEN 'vendors' WHEN 'supplier' THEN 'vendors' WHEN 'suppliers' THEN 'vendors'
    ELSE lower(btrim(coalesce(p_lens, 'contacts'))) END;
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

-- Proof: reads only, on names nobody has.
DO $$
BEGIN
  IF (public.search_partners('zz-no-such-party-zz', 'supplier') ->> 'lens') <> 'vendors' THEN
    RAISE EXCEPTION 'supplier is not read as vendors';
  END IF;
  IF (public.search_partners('zz-no-such-party-zz', 'Clients') ->> 'lens') <> 'customers' THEN
    RAISE EXCEPTION 'clients is not read as customers';
  END IF;
  BEGIN
    PERFORM public.search_partners('zz', 'banana');
    RAISE EXCEPTION 'an unknown lens was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'an unknown lens was accepted' THEN RAISE; END IF;
  END;
END $$;
