INSERT INTO public.quote_items (quote_id, position, description, quantity, unit_price_cents, tax_rate_pct)
SELECT q.id, 0, COALESCE(p.name, NULLIF(d.notes,''), 'Service'), 1, d.value_cents, 25
FROM public.quotes q
JOIN public.deals d ON d.id = q.deal_id
LEFT JOIN public.products p ON p.id = d.product_id
WHERE NOT EXISTS (SELECT 1 FROM public.quote_items WHERE quote_id = q.id)
  AND d.value_cents > 0;