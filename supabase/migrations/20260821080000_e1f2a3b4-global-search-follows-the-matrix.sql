-- global_search följer matrisen — ⌘K var tomt för varje avdelningsroll.
--
-- Incidentklassen: nekad behörighet renderad som frånvarande data. Sökningen
-- grindade på has_role(admin) i toppen och kastade 'unauthorized' — som
-- frontend renderade som noll träffar. Sales/marketing/support såg en sökruta
-- som aldrig hittade något.
--
-- Regeln: retrieval-with-caller's-eyes. Grinden flyttar från funktionens topp
-- ner i VARJE entitetsgren: rollen söker i exakt de moduler matrisen ger den,
-- varken mer eller mindre. Modul-id:n är samma som respektive tabells
-- läspolicy använder (verifierat mot pg_policies + rls-reads-the-matrix-kartan).
-- service_role (agentvägen via mcp_global_search) ser allt, som förr.
--
-- documents-grenen bär dessutom tabellens RADNIVÅ-synlighet (shared/role/
-- private) — modulratten räcker inte där, annars läcker sökningen titlar på
-- privata dokument till modulens medlemmar.
--
-- Allowlist-posten för global_search i src/lib/admin-only-rpcs.ts tas bort i
-- samma commit: "en modulgrind vore fel dimension" var sant — lösningen är
-- sexton modulgrindar i rätt dimension.

CREATE OR REPLACE FUNCTION public._global_search_internal(search_query text, result_limit integer DEFAULT 8)
 RETURNS TABLE(entity_type text, entity_id uuid, title text, subtitle text, url text, rank real)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  q tsquery;
  q_like text;
  v_all boolean := (auth.role() = 'service_role');
  v_uid uuid := auth.uid();
  v_companies boolean; v_leads boolean; v_deals boolean; v_ecom boolean;
  v_invoicing boolean; v_quotes boolean; v_tickets boolean; v_contracts boolean;
  v_documents boolean; v_kb boolean; v_pages boolean; v_blog boolean;
  v_hr boolean; v_purchasing boolean; v_projects boolean;
  v_admin boolean;
BEGIN
  IF search_query IS NULL OR length(trim(search_query)) < 2 THEN
    RETURN;
  END IF;
  q := websearch_to_tsquery('simple', search_query);
  q_like := '%' || search_query || '%';

  v_admin      := v_all OR public.has_role(v_uid, 'admin');
  v_companies  := v_all OR public.can_access_module(v_uid, 'companies');
  v_leads      := v_all OR public.can_access_module(v_uid, 'leads');
  v_deals      := v_all OR public.can_access_module(v_uid, 'deals');
  v_ecom       := v_all OR public.can_access_module(v_uid, 'ecommerce');
  v_invoicing  := v_all OR public.can_access_module(v_uid, 'invoicing');
  v_quotes     := v_all OR public.can_access_module(v_uid, 'quotes');
  v_tickets    := v_all OR public.can_access_module(v_uid, 'tickets');
  v_contracts  := v_all OR public.can_access_module(v_uid, 'contracts');
  v_documents  := v_all OR public.can_access_module(v_uid, 'documents');
  v_kb         := v_all OR public.can_access_module(v_uid, 'knowledgeBase');
  v_pages      := v_all OR public.can_access_module(v_uid, 'pages');
  v_blog       := v_all OR public.can_access_module(v_uid, 'blog');
  v_hr         := v_all OR public.can_access_module(v_uid, 'hr');
  v_purchasing := v_all OR public.can_access_module(v_uid, 'purchasing');
  v_projects   := v_all OR public.can_access_module(v_uid, 'projects');

  RETURN QUERY
  SELECT * FROM (
  (SELECT 'company'::text AS entity_type, c.id AS entity_id, c.name AS title, coalesce(c.domain, c.industry) AS subtitle, '/admin/companies/' || c.id::text AS url,
          ts_rank(to_tsvector('simple', coalesce(c.name,'') || ' ' || coalesce(c.domain,'') || ' ' || coalesce(c.industry,'') || ' ' || coalesce(c.notes,'')), q) AS rank
   FROM companies c
   WHERE v_companies AND (to_tsvector('simple', coalesce(c.name,'') || ' ' || coalesce(c.domain,'') || ' ' || coalesce(c.industry,'') || ' ' || coalesce(c.notes,'')) @@ q OR c.name ILIKE q_like)
   ORDER BY 6 DESC LIMIT result_limit)
  UNION ALL
  (SELECT 'lead'::text, l.id, l.name, coalesce(l.email, l.status::text), '/admin/crm?lead=' || l.id::text,
          ts_rank(to_tsvector('simple', coalesce(l.name,'') || ' ' || coalesce(l.email,'') || ' ' || coalesce(l.phone,'') || ' ' || coalesce(l.ai_summary,'')), q)
   FROM leads l
   WHERE v_leads AND (to_tsvector('simple', coalesce(l.name,'') || ' ' || coalesce(l.email,'') || ' ' || coalesce(l.phone,'') || ' ' || coalesce(l.ai_summary,'')) @@ q OR l.email ILIKE q_like OR l.name ILIKE q_like)
   ORDER BY 6 DESC LIMIT result_limit)
  UNION ALL
  (SELECT 'deal'::text, d.id, coalesce(d.notes, 'Deal ' || substring(d.id::text, 1, 8)), d.stage::text, '/admin/deals?id=' || d.id::text,
          ts_rank(to_tsvector('simple', coalesce(d.notes,'')), q)
   FROM deals d WHERE v_deals AND to_tsvector('simple', coalesce(d.notes,'')) @@ q ORDER BY 6 DESC LIMIT result_limit)
  UNION ALL
  (SELECT 'order'::text, o.id, 'Order ' || substring(o.id::text, 1, 8), coalesce(o.customer_email, o.status::text), '/admin/orders/' || o.id::text,
          ts_rank(to_tsvector('simple', coalesce(o.customer_email,'') || ' ' || coalesce(o.customer_name,'') || ' ' || coalesce(o.tracking_number,'')), q)
   FROM orders o
   WHERE v_ecom AND (to_tsvector('simple', coalesce(o.customer_email,'') || ' ' || coalesce(o.customer_name,'') || ' ' || coalesce(o.tracking_number,'')) @@ q OR o.customer_email ILIKE q_like)
   ORDER BY 6 DESC LIMIT result_limit)
  UNION ALL
  (SELECT 'invoice'::text, i.id, coalesce(i.invoice_number, 'Invoice'), coalesce(i.customer_name, i.customer_email), '/admin/invoices/' || i.id::text,
          ts_rank(to_tsvector('simple', coalesce(i.invoice_number,'') || ' ' || coalesce(i.customer_email,'') || ' ' || coalesce(i.customer_name,'') || ' ' || coalesce(i.notes,'')), q)
   FROM invoices i
   WHERE v_invoicing AND (to_tsvector('simple', coalesce(i.invoice_number,'') || ' ' || coalesce(i.customer_email,'') || ' ' || coalesce(i.customer_name,'') || ' ' || coalesce(i.notes,'')) @@ q OR i.invoice_number ILIKE q_like)
   ORDER BY 6 DESC LIMIT result_limit)
  UNION ALL
  (SELECT 'quote'::text, qu.id, coalesce(qu.quote_number, qu.title, 'Quote'), coalesce(qu.customer_name, qu.customer_email), '/admin/quotes/' || qu.id::text,
          ts_rank(to_tsvector('simple', coalesce(qu.quote_number,'') || ' ' || coalesce(qu.title,'') || ' ' || coalesce(qu.customer_name,'') || ' ' || coalesce(qu.customer_email,'')), q)
   FROM quotes qu
   WHERE v_quotes AND (to_tsvector('simple', coalesce(qu.quote_number,'') || ' ' || coalesce(qu.title,'') || ' ' || coalesce(qu.customer_name,'') || ' ' || coalesce(qu.customer_email,'')) @@ q OR qu.quote_number ILIKE q_like)
   ORDER BY 6 DESC LIMIT result_limit)
  UNION ALL
  (SELECT 'ticket'::text, t.id, t.subject, coalesce(t.contact_email, t.status::text), '/admin/tickets/' || t.id::text,
          ts_rank(to_tsvector('simple', coalesce(t.subject,'') || ' ' || coalesce(t.description,'') || ' ' || coalesce(t.contact_email,'') || ' ' || coalesce(t.contact_name,'')), q)
   FROM tickets t
   WHERE v_tickets AND to_tsvector('simple', coalesce(t.subject,'') || ' ' || coalesce(t.description,'') || ' ' || coalesce(t.contact_email,'') || ' ' || coalesce(t.contact_name,'')) @@ q
   ORDER BY 6 DESC LIMIT result_limit)
  UNION ALL
  (SELECT 'contract'::text, ct.id, ct.title, coalesce(ct.counterparty_name, ct.status::text), '/admin/contracts/' || ct.id::text,
          ts_rank(to_tsvector('simple', coalesce(ct.title,'') || ' ' || coalesce(ct.counterparty_name,'') || ' ' || coalesce(ct.counterparty_email,'') || ' ' || coalesce(ct.notes,'')), q)
   FROM contracts ct
   WHERE v_contracts AND to_tsvector('simple', coalesce(ct.title,'') || ' ' || coalesce(ct.counterparty_name,'') || ' ' || coalesce(ct.counterparty_email,'') || ' ' || coalesce(ct.notes,'')) @@ q
   ORDER BY 6 DESC LIMIT result_limit)
  UNION ALL
  -- documents: modulratt + tabellens radnivå-synlighet (speglar SELECT-policyn;
  -- utan den läcker sökningen titlar på privata dokument till modulmedlemmar)
  (SELECT 'document'::text, dc.id, dc.title, coalesce(dc.category::text, dc.file_name), '/admin/documents?id=' || dc.id::text,
          ts_rank(to_tsvector('simple', coalesce(dc.title,'') || ' ' || coalesce(dc.file_name,'') || ' ' || coalesce(dc.description,'') || ' ' || coalesce(dc.content_md,'')), q)
   FROM documents dc
   WHERE v_documents
     AND (v_admin
          OR dc.visibility = 'shared'
          OR (dc.visibility = 'role' AND (public.has_role(v_uid, dc.visible_to_role) OR dc.uploaded_by = v_uid))
          OR (dc.visibility = 'private' AND dc.uploaded_by = v_uid))
     AND to_tsvector('simple', coalesce(dc.title,'') || ' ' || coalesce(dc.file_name,'') || ' ' || coalesce(dc.description,'') || ' ' || coalesce(dc.content_md,'')) @@ q
   ORDER BY 6 DESC LIMIT result_limit)
  UNION ALL
  (SELECT 'kb_article'::text, k.id, k.title, k.question, '/admin/kb/' || k.id::text,
          ts_rank(to_tsvector('simple', coalesce(k.title,'') || ' ' || coalesce(k.question,'') || ' ' || coalesce(k.answer_text,'')), q)
   FROM kb_articles k
   WHERE v_kb AND to_tsvector('simple', coalesce(k.title,'') || ' ' || coalesce(k.question,'') || ' ' || coalesce(k.answer_text,'')) @@ q
   ORDER BY 6 DESC LIMIT result_limit)
  UNION ALL
  (SELECT 'product'::text, p.id, p.name, coalesce(p.description, p.barcode), '/admin/products?id=' || p.id::text,
          ts_rank(to_tsvector('simple', coalesce(p.name,'') || ' ' || coalesce(p.description,'') || ' ' || coalesce(p.barcode,'')), q)
   FROM products p
   WHERE v_ecom AND (to_tsvector('simple', coalesce(p.name,'') || ' ' || coalesce(p.description,'') || ' ' || coalesce(p.barcode,'')) @@ q OR p.barcode ILIKE q_like)
   ORDER BY 6 DESC LIMIT result_limit)
  UNION ALL
  (SELECT 'page'::text, pg.id, pg.title, pg.slug, '/admin/pages/' || pg.id::text,
          ts_rank(to_tsvector('simple', coalesce(pg.title,'') || ' ' || coalesce(pg.slug,'')), q)
   FROM pages pg WHERE v_pages AND to_tsvector('simple', coalesce(pg.title,'') || ' ' || coalesce(pg.slug,'')) @@ q AND pg.deleted_at IS NULL
   ORDER BY 6 DESC LIMIT result_limit)
  UNION ALL
  (SELECT 'blog_post'::text, b.id, b.title, b.slug, '/admin/blog/' || b.id::text,
          ts_rank(to_tsvector('simple', coalesce(b.title,'') || ' ' || coalesce(b.slug,'') || ' ' || coalesce(b.excerpt,'')), q)
   FROM blog_posts b WHERE v_blog AND to_tsvector('simple', coalesce(b.title,'') || ' ' || coalesce(b.slug,'') || ' ' || coalesce(b.excerpt,'')) @@ q
   ORDER BY 6 DESC LIMIT result_limit)
  UNION ALL
  (SELECT 'employee'::text, e.id, e.name, coalesce(e.title, e.department, e.email), '/admin/hr?employee=' || e.id::text,
          ts_rank(to_tsvector('simple', coalesce(e.name,'') || ' ' || coalesce(e.email,'') || ' ' || coalesce(e.title,'') || ' ' || coalesce(e.department,'')), q)
   FROM employees e
   WHERE v_hr AND to_tsvector('simple', coalesce(e.name,'') || ' ' || coalesce(e.email,'') || ' ' || coalesce(e.title,'') || ' ' || coalesce(e.department,'')) @@ q
   ORDER BY 6 DESC LIMIT result_limit)
  UNION ALL
  (SELECT 'vendor'::text, v.id, v.name, v.email, '/admin/vendors?id=' || v.id::text,
          ts_rank(to_tsvector('simple', coalesce(v.name,'') || ' ' || coalesce(v.email,'') || ' ' || coalesce(v.notes,'')), q)
   FROM vendors v WHERE v_purchasing AND to_tsvector('simple', coalesce(v.name,'') || ' ' || coalesce(v.email,'') || ' ' || coalesce(v.notes,'')) @@ q
   ORDER BY 6 DESC LIMIT result_limit)
  UNION ALL
  (SELECT 'project'::text, pr.id, pr.name, coalesce(pr.client_name, pr.description), '/admin/projects?id=' || pr.id::text,
          ts_rank(to_tsvector('simple', coalesce(pr.name,'') || ' ' || coalesce(pr.client_name,'') || ' ' || coalesce(pr.description,'')), q)
   FROM projects pr WHERE v_projects AND to_tsvector('simple', coalesce(pr.name,'') || ' ' || coalesce(pr.client_name,'') || ' ' || coalesce(pr.description,'')) @@ q
   ORDER BY 6 DESC LIMIT result_limit)
  ) AS combined
  ORDER BY combined.rank DESC
  LIMIT result_limit * 4;
END;
$function$;

-- Toppgrinden: inte längre admin — bara "inloggad eller service". En roll utan
-- moduler får tomt resultat av grenarna själva (fail closed per gren), inte
-- ett exception som UI:t maskerar till "inga träffar".
CREATE OR REPLACE FUNCTION public.global_search(search_query text, result_limit integer DEFAULT 8)
 RETURNS TABLE(entity_type text, entity_id uuid, title text, subtitle text, url text, rank real)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() <> 'service_role' AND auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  RETURN QUERY SELECT * FROM public._global_search_internal(search_query, result_limit);
END;
$function$;

-- ── LACKMUS ────────────────────────────────────────────────────────────────
--   Med sales-JWT: global_search('...') ska ge träffar ur leads/deals/quotes
--   men ALDRIG rader med entity_type 'employee' eller 'invoice' (sales saknar
--   hr/invoicing i matrisen). Med support-JWT: tickets syns, quotes inte.
--   Ta bort (sales,'quotes') ur role_module_access → quote-träffarna försvinner.
--   Anon (ingen JWT): exception 'unauthorized', fail closed.
