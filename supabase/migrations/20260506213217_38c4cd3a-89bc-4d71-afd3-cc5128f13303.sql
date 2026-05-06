CREATE INDEX IF NOT EXISTS idx_companies_search ON public.companies USING GIN (to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(domain,'') || ' ' || coalesce(industry,'') || ' ' || coalesce(notes,'')));
CREATE INDEX IF NOT EXISTS idx_leads_search ON public.leads USING GIN (to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(email,'') || ' ' || coalesce(phone,'') || ' ' || coalesce(ai_summary,'')));
CREATE INDEX IF NOT EXISTS idx_deals_search ON public.deals USING GIN (to_tsvector('simple', coalesce(notes,'')));
CREATE INDEX IF NOT EXISTS idx_orders_search ON public.orders USING GIN (to_tsvector('simple', coalesce(customer_email,'') || ' ' || coalesce(customer_name,'') || ' ' || coalesce(tracking_number,'')));
CREATE INDEX IF NOT EXISTS idx_invoices_search ON public.invoices USING GIN (to_tsvector('simple', coalesce(invoice_number,'') || ' ' || coalesce(customer_email,'') || ' ' || coalesce(customer_name,'') || ' ' || coalesce(notes,'')));
CREATE INDEX IF NOT EXISTS idx_quotes_search ON public.quotes USING GIN (to_tsvector('simple', coalesce(quote_number,'') || ' ' || coalesce(title,'') || ' ' || coalesce(customer_name,'') || ' ' || coalesce(customer_email,'')));
CREATE INDEX IF NOT EXISTS idx_tickets_search ON public.tickets USING GIN (to_tsvector('simple', coalesce(subject,'') || ' ' || coalesce(description,'') || ' ' || coalesce(contact_email,'') || ' ' || coalesce(contact_name,'')));
CREATE INDEX IF NOT EXISTS idx_contracts_search ON public.contracts USING GIN (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(counterparty_name,'') || ' ' || coalesce(counterparty_email,'') || ' ' || coalesce(notes,'')));
CREATE INDEX IF NOT EXISTS idx_documents_search ON public.documents USING GIN (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(file_name,'') || ' ' || coalesce(description,'') || ' ' || coalesce(content_md,'')));
CREATE INDEX IF NOT EXISTS idx_kb_articles_search ON public.kb_articles USING GIN (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(question,'') || ' ' || coalesce(answer_text,'')));
CREATE INDEX IF NOT EXISTS idx_products_search ON public.products USING GIN (to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(description,'') || ' ' || coalesce(barcode,'')));
CREATE INDEX IF NOT EXISTS idx_pages_search ON public.pages USING GIN (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(slug,'')));
CREATE INDEX IF NOT EXISTS idx_blog_posts_search ON public.blog_posts USING GIN (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(slug,'') || ' ' || coalesce(excerpt,'')));
CREATE INDEX IF NOT EXISTS idx_employees_search ON public.employees USING GIN (to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(email,'') || ' ' || coalesce(title,'') || ' ' || coalesce(department,'')));
CREATE INDEX IF NOT EXISTS idx_vendors_search ON public.vendors USING GIN (to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(email,'') || ' ' || coalesce(notes,'')));
CREATE INDEX IF NOT EXISTS idx_projects_search ON public.projects USING GIN (to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(client_name,'') || ' ' || coalesce(description,'')));

CREATE OR REPLACE FUNCTION public.global_search(search_query text, result_limit int DEFAULT 8)
RETURNS TABLE (entity_type text, entity_id uuid, title text, subtitle text, url text, rank real)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  q tsquery;
  q_like text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF search_query IS NULL OR length(trim(search_query)) < 2 THEN
    RETURN;
  END IF;
  q := websearch_to_tsquery('simple', search_query);
  q_like := '%' || search_query || '%';

  RETURN QUERY
  (SELECT 'company'::text, c.id, c.name, coalesce(c.domain, c.industry), '/admin/companies/' || c.id::text,
          ts_rank(to_tsvector('simple', coalesce(c.name,'') || ' ' || coalesce(c.domain,'') || ' ' || coalesce(c.industry,'') || ' ' || coalesce(c.notes,'')), q)
   FROM companies c
   WHERE to_tsvector('simple', coalesce(c.name,'') || ' ' || coalesce(c.domain,'') || ' ' || coalesce(c.industry,'') || ' ' || coalesce(c.notes,'')) @@ q OR c.name ILIKE q_like
   ORDER BY 6 DESC LIMIT result_limit)
  UNION ALL
  (SELECT 'lead'::text, l.id, l.name, coalesce(l.email, l.status), '/admin/crm?lead=' || l.id::text,
          ts_rank(to_tsvector('simple', coalesce(l.name,'') || ' ' || coalesce(l.email,'') || ' ' || coalesce(l.phone,'') || ' ' || coalesce(l.ai_summary,'')), q)
   FROM leads l
   WHERE to_tsvector('simple', coalesce(l.name,'') || ' ' || coalesce(l.email,'') || ' ' || coalesce(l.phone,'') || ' ' || coalesce(l.ai_summary,'')) @@ q OR l.email ILIKE q_like OR l.name ILIKE q_like
   ORDER BY 6 DESC LIMIT result_limit)
  UNION ALL
  (SELECT 'deal'::text, d.id, coalesce(d.notes, 'Deal ' || substring(d.id::text, 1, 8)), d.stage::text, '/admin/deals?id=' || d.id::text,
          ts_rank(to_tsvector('simple', coalesce(d.notes,'')), q)
   FROM deals d WHERE to_tsvector('simple', coalesce(d.notes,'')) @@ q ORDER BY 6 DESC LIMIT result_limit)
  UNION ALL
  (SELECT 'order'::text, o.id, 'Order ' || substring(o.id::text, 1, 8), coalesce(o.customer_email, o.status), '/admin/orders/' || o.id::text,
          ts_rank(to_tsvector('simple', coalesce(o.customer_email,'') || ' ' || coalesce(o.customer_name,'') || ' ' || coalesce(o.tracking_number,'')), q)
   FROM orders o
   WHERE to_tsvector('simple', coalesce(o.customer_email,'') || ' ' || coalesce(o.customer_name,'') || ' ' || coalesce(o.tracking_number,'')) @@ q OR o.customer_email ILIKE q_like
   ORDER BY 6 DESC LIMIT result_limit)
  UNION ALL
  (SELECT 'invoice'::text, i.id, coalesce(i.invoice_number, 'Invoice'), coalesce(i.customer_name, i.customer_email), '/admin/invoices/' || i.id::text,
          ts_rank(to_tsvector('simple', coalesce(i.invoice_number,'') || ' ' || coalesce(i.customer_email,'') || ' ' || coalesce(i.customer_name,'') || ' ' || coalesce(i.notes,'')), q)
   FROM invoices i
   WHERE to_tsvector('simple', coalesce(i.invoice_number,'') || ' ' || coalesce(i.customer_email,'') || ' ' || coalesce(i.customer_name,'') || ' ' || coalesce(i.notes,'')) @@ q OR i.invoice_number ILIKE q_like
   ORDER BY 6 DESC LIMIT result_limit)
  UNION ALL
  (SELECT 'quote'::text, qu.id, coalesce(qu.quote_number, qu.title, 'Quote'), coalesce(qu.customer_name, qu.customer_email), '/admin/quotes/' || qu.id::text,
          ts_rank(to_tsvector('simple', coalesce(qu.quote_number,'') || ' ' || coalesce(qu.title,'') || ' ' || coalesce(qu.customer_name,'') || ' ' || coalesce(qu.customer_email,'')), q)
   FROM quotes qu
   WHERE to_tsvector('simple', coalesce(qu.quote_number,'') || ' ' || coalesce(qu.title,'') || ' ' || coalesce(qu.customer_name,'') || ' ' || coalesce(qu.customer_email,'')) @@ q OR qu.quote_number ILIKE q_like
   ORDER BY 6 DESC LIMIT result_limit)
  UNION ALL
  (SELECT 'ticket'::text, t.id, t.subject, coalesce(t.contact_email, t.status::text), '/admin/tickets/' || t.id::text,
          ts_rank(to_tsvector('simple', coalesce(t.subject,'') || ' ' || coalesce(t.description,'') || ' ' || coalesce(t.contact_email,'') || ' ' || coalesce(t.contact_name,'')), q)
   FROM tickets t
   WHERE to_tsvector('simple', coalesce(t.subject,'') || ' ' || coalesce(t.description,'') || ' ' || coalesce(t.contact_email,'') || ' ' || coalesce(t.contact_name,'')) @@ q
   ORDER BY 6 DESC LIMIT result_limit)
  UNION ALL
  (SELECT 'contract'::text, ct.id, ct.title, coalesce(ct.counterparty_name, ct.status::text), '/admin/contracts/' || ct.id::text,
          ts_rank(to_tsvector('simple', coalesce(ct.title,'') || ' ' || coalesce(ct.counterparty_name,'') || ' ' || coalesce(ct.counterparty_email,'') || ' ' || coalesce(ct.notes,'')), q)
   FROM contracts ct
   WHERE to_tsvector('simple', coalesce(ct.title,'') || ' ' || coalesce(ct.counterparty_name,'') || ' ' || coalesce(ct.counterparty_email,'') || ' ' || coalesce(ct.notes,'')) @@ q
   ORDER BY 6 DESC LIMIT result_limit)
  UNION ALL
  (SELECT 'document'::text, dc.id, dc.title, coalesce(dc.category::text, dc.file_name), '/admin/documents?id=' || dc.id::text,
          ts_rank(to_tsvector('simple', coalesce(dc.title,'') || ' ' || coalesce(dc.file_name,'') || ' ' || coalesce(dc.description,'') || ' ' || coalesce(dc.content_md,'')), q)
   FROM documents dc
   WHERE to_tsvector('simple', coalesce(dc.title,'') || ' ' || coalesce(dc.file_name,'') || ' ' || coalesce(dc.description,'') || ' ' || coalesce(dc.content_md,'')) @@ q
   ORDER BY 6 DESC LIMIT result_limit)
  UNION ALL
  (SELECT 'kb_article'::text, k.id, k.title, k.question, '/admin/kb/' || k.id::text,
          ts_rank(to_tsvector('simple', coalesce(k.title,'') || ' ' || coalesce(k.question,'') || ' ' || coalesce(k.answer_text,'')), q)
   FROM kb_articles k
   WHERE to_tsvector('simple', coalesce(k.title,'') || ' ' || coalesce(k.question,'') || ' ' || coalesce(k.answer_text,'')) @@ q
   ORDER BY 6 DESC LIMIT result_limit)
  UNION ALL
  (SELECT 'product'::text, p.id, p.name, coalesce(p.description, p.barcode), '/admin/products?id=' || p.id::text,
          ts_rank(to_tsvector('simple', coalesce(p.name,'') || ' ' || coalesce(p.description,'') || ' ' || coalesce(p.barcode,'')), q)
   FROM products p
   WHERE to_tsvector('simple', coalesce(p.name,'') || ' ' || coalesce(p.description,'') || ' ' || coalesce(p.barcode,'')) @@ q OR p.barcode ILIKE q_like
   ORDER BY 6 DESC LIMIT result_limit)
  UNION ALL
  (SELECT 'page'::text, pg.id, pg.title, pg.slug, '/admin/pages/' || pg.id::text,
          ts_rank(to_tsvector('simple', coalesce(pg.title,'') || ' ' || coalesce(pg.slug,'')), q)
   FROM pages pg WHERE to_tsvector('simple', coalesce(pg.title,'') || ' ' || coalesce(pg.slug,'')) @@ q AND pg.deleted_at IS NULL
   ORDER BY 6 DESC LIMIT result_limit)
  UNION ALL
  (SELECT 'blog_post'::text, b.id, b.title, b.slug, '/admin/blog/' || b.id::text,
          ts_rank(to_tsvector('simple', coalesce(b.title,'') || ' ' || coalesce(b.slug,'') || ' ' || coalesce(b.excerpt,'')), q)
   FROM blog_posts b WHERE to_tsvector('simple', coalesce(b.title,'') || ' ' || coalesce(b.slug,'') || ' ' || coalesce(b.excerpt,'')) @@ q
   ORDER BY 6 DESC LIMIT result_limit)
  UNION ALL
  (SELECT 'employee'::text, e.id, e.name, coalesce(e.title, e.department, e.email), '/admin/hr?employee=' || e.id::text,
          ts_rank(to_tsvector('simple', coalesce(e.name,'') || ' ' || coalesce(e.email,'') || ' ' || coalesce(e.title,'') || ' ' || coalesce(e.department,'')), q)
   FROM employees e
   WHERE to_tsvector('simple', coalesce(e.name,'') || ' ' || coalesce(e.email,'') || ' ' || coalesce(e.title,'') || ' ' || coalesce(e.department,'')) @@ q
   ORDER BY 6 DESC LIMIT result_limit)
  UNION ALL
  (SELECT 'vendor'::text, v.id, v.name, v.email, '/admin/vendors?id=' || v.id::text,
          ts_rank(to_tsvector('simple', coalesce(v.name,'') || ' ' || coalesce(v.email,'') || ' ' || coalesce(v.notes,'')), q)
   FROM vendors v WHERE to_tsvector('simple', coalesce(v.name,'') || ' ' || coalesce(v.email,'') || ' ' || coalesce(v.notes,'')) @@ q
   ORDER BY 6 DESC LIMIT result_limit)
  UNION ALL
  (SELECT 'project'::text, pr.id, pr.name, coalesce(pr.client_name, pr.description), '/admin/projects?id=' || pr.id::text,
          ts_rank(to_tsvector('simple', coalesce(pr.name,'') || ' ' || coalesce(pr.client_name,'') || ' ' || coalesce(pr.description,'')), q)
   FROM projects pr WHERE to_tsvector('simple', coalesce(pr.name,'') || ' ' || coalesce(pr.client_name,'') || ' ' || coalesce(pr.description,'')) @@ q
   ORDER BY 6 DESC LIMIT result_limit)
  ORDER BY rank DESC LIMIT result_limit * 4;
END;
$$;

GRANT EXECUTE ON FUNCTION public.global_search(text, int) TO authenticated;

COMMENT ON FUNCTION public.global_search IS 'Unified global search across 16 entity types. Admin-only. Returns ranked matches with deep-link URLs. Used by /admin ⌘K palette and global_search MCP skill.';