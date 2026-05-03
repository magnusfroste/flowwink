-- Sprint A+B+C: Pricelists, P2P tiers, RMA + carriers
CREATE TABLE IF NOT EXISTS public.pricelists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  currency text NOT NULL DEFAULT 'SEK',
  valid_from date,
  valid_until date,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  is_default boolean NOT NULL DEFAULT false,
  priority integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pricelists_active_idx ON public.pricelists(is_active, priority);
CREATE INDEX IF NOT EXISTS pricelists_company_idx ON public.pricelists(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS pricelists_lead_idx ON public.pricelists(lead_id) WHERE lead_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.pricelist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pricelist_id uuid NOT NULL REFERENCES public.pricelists(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  fixed_price_cents integer,
  discount_pct numeric(5,2),
  min_quantity numeric(12,3) NOT NULL DEFAULT 1,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pricelist_items_price_or_discount CHECK (
    fixed_price_cents IS NOT NULL OR discount_pct IS NOT NULL
  )
);
CREATE INDEX IF NOT EXISTS pricelist_items_pricelist_idx ON public.pricelist_items(pricelist_id);
CREATE INDEX IF NOT EXISTS pricelist_items_product_idx ON public.pricelist_items(product_id) WHERE product_id IS NOT NULL;

ALTER TABLE public.pricelists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricelist_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage pricelists" ON public.pricelists;
CREATE POLICY "Admins manage pricelists" ON public.pricelists FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'sales'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'sales'));

DROP POLICY IF EXISTS "Admins manage pricelist_items" ON public.pricelist_items;
CREATE POLICY "Admins manage pricelist_items" ON public.pricelist_items FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'sales'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'sales'));

CREATE OR REPLACE FUNCTION public.resolve_pricelist_price(
  p_product_id uuid, p_lead_id uuid DEFAULT NULL, p_company_id uuid DEFAULT NULL,
  p_quantity numeric DEFAULT 1, p_at date DEFAULT CURRENT_DATE, p_currency text DEFAULT 'SEK'
)
RETURNS TABLE(price_cents integer, pricelist_id uuid, pricelist_name text, source text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_base_price integer;
BEGIN
  SELECT COALESCE(price_cents, 0) INTO v_base_price FROM public.products WHERE id = p_product_id;
  RETURN QUERY
  WITH candidates AS (
    SELECT pl.id, pl.name,
      CASE WHEN pli.fixed_price_cents IS NOT NULL THEN pli.fixed_price_cents
           WHEN pli.discount_pct IS NOT NULL THEN GREATEST(0, ROUND(v_base_price * (1 - pli.discount_pct/100.0))::int)
           ELSE v_base_price END AS resolved_price,
      (CASE WHEN pl.lead_id = p_lead_id THEN 1000 ELSE 0 END
       + CASE WHEN pl.company_id = p_company_id THEN 500 ELSE 0 END
       + CASE WHEN pli.product_id = p_product_id THEN 100 ELSE 0 END
       - pl.priority) AS specificity
    FROM public.pricelists pl
    JOIN public.pricelist_items pli ON pli.pricelist_id = pl.id
    WHERE pl.is_active AND pl.currency = p_currency
      AND (pl.valid_from IS NULL OR pl.valid_from <= p_at)
      AND (pl.valid_until IS NULL OR pl.valid_until >= p_at)
      AND (pli.product_id = p_product_id OR pli.product_id IS NULL)
      AND p_quantity >= pli.min_quantity
      AND ((pl.lead_id IS NULL AND pl.company_id IS NULL)
        OR (p_lead_id IS NOT NULL AND pl.lead_id = p_lead_id)
        OR (p_company_id IS NOT NULL AND pl.company_id = p_company_id))
  )
  SELECT resolved_price, id, name, 'pricelist'::text FROM candidates ORDER BY specificity DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN QUERY SELECT v_base_price, NULL::uuid, NULL::text, 'product_base'::text;
  END IF;
END; $$;

-- Tiered approval rules
INSERT INTO public.approval_rules (name, description, entity_type, amount_threshold_cents, currency, required_role, priority, is_active)
VALUES
  ('Quote > 100 000 SEK (CFO)', 'Quotes above 100k SEK require admin sign-off', 'quote', 10000000, 'SEK', 'admin', 50, true),
  ('PO 5k-50k (Manager)',  'Purchase orders 5k-50k SEK require approver sign-off',     'purchase_order', 500000,   'SEK', 'approver', 100, true),
  ('PO 50k-500k (Admin)',  'Purchase orders 50k-500k SEK require admin sign-off',      'purchase_order', 5000000,  'SEK', 'admin',     80, true),
  ('PO > 500k (CFO)',      'Purchase orders above 500k SEK require admin sign-off',    'purchase_order', 50000000, 'SEK', 'admin',     50, true)
ON CONFLICT DO NOTHING;

UPDATE public.approval_rules SET is_active = false
WHERE entity_type = 'purchase_order' AND name = 'Purchase order > 10 000 SEK';

-- Tolerance policies
CREATE TABLE IF NOT EXISTS public.tolerance_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  entity_type text NOT NULL DEFAULT 'vendor_invoice',
  max_price_variance_pct numeric(5,2) NOT NULL DEFAULT 5.00,
  max_qty_variance_pct numeric(5,2) NOT NULL DEFAULT 0.00,
  max_absolute_variance_cents integer,
  currency text NOT NULL DEFAULT 'SEK',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tolerance_policies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage tolerance" ON public.tolerance_policies;
CREATE POLICY "Admins manage tolerance" ON public.tolerance_policies FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'accounting') OR has_role(auth.uid(), 'purchasing'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'accounting') OR has_role(auth.uid(), 'purchasing'));

INSERT INTO public.tolerance_policies (name, entity_type, max_price_variance_pct, max_qty_variance_pct, max_absolute_variance_cents)
SELECT 'Default vendor-invoice tolerance', 'vendor_invoice', 5.00, 0.00, 50000
WHERE NOT EXISTS (SELECT 1 FROM public.tolerance_policies WHERE name = 'Default vendor-invoice tolerance');

-- Carriers
CREATE TABLE IF NOT EXISTS public.carriers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  tracking_url_template text,
  api_credentials_secret_ref text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.carriers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage carriers" ON public.carriers;
CREATE POLICY "Admins manage carriers" ON public.carriers FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'warehouse'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'warehouse'));

INSERT INTO public.carriers (code, name, tracking_url_template) VALUES
  ('postnord', 'PostNord', 'https://tracking.postnord.com/en/?id={tracking_number}'),
  ('dhl', 'DHL', 'https://www.dhl.com/en/express/tracking.html?AWB={tracking_number}'),
  ('bring', 'Bring', 'https://tracking.bring.com/tracking/{tracking_number}')
ON CONFLICT (code) DO NOTHING;

-- Shipments
CREATE TABLE IF NOT EXISTS public.shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  carrier_id uuid REFERENCES public.carriers(id),
  carrier_code text,
  tracking_number text,
  tracking_url text,
  label_url text,
  status text NOT NULL DEFAULT 'pending',
  weight_grams integer,
  cost_cents integer,
  shipped_at timestamptz,
  delivered_at timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shipments_order_idx ON public.shipments(order_id);
ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff manage shipments" ON public.shipments;
CREATE POLICY "Staff manage shipments" ON public.shipments FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'warehouse') OR has_role(auth.uid(), 'sales'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'warehouse') OR has_role(auth.uid(), 'sales'));

-- Returns / RMA
CREATE TABLE IF NOT EXISTS public.returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rma_number text NOT NULL UNIQUE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'requested',
  reason text,
  customer_notes text,
  internal_notes text,
  refund_amount_cents integer,
  refund_currency text,
  refund_method text,
  refund_processed_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  received_at timestamptz,
  return_tracking_number text,
  return_carrier_code text,
  return_label_url text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS returns_order_idx ON public.returns(order_id);
CREATE INDEX IF NOT EXISTS returns_status_idx ON public.returns(status);

CREATE TABLE IF NOT EXISTS public.return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES public.returns(id) ON DELETE CASCADE,
  order_item_id uuid REFERENCES public.order_items(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  quantity numeric(12,3) NOT NULL DEFAULT 1,
  unit_refund_cents integer,
  condition text,
  restock boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS return_items_return_idx ON public.return_items(return_id);

ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff manage returns" ON public.returns;
CREATE POLICY "Staff manage returns" ON public.returns FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'support') OR has_role(auth.uid(), 'warehouse') OR has_role(auth.uid(), 'sales'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'support') OR has_role(auth.uid(), 'warehouse') OR has_role(auth.uid(), 'sales'));

DROP POLICY IF EXISTS "Customers see own returns" ON public.returns;
CREATE POLICY "Customers see own returns" ON public.returns FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = returns.order_id AND o.user_id = auth.uid()));

DROP POLICY IF EXISTS "Staff manage return_items" ON public.return_items;
CREATE POLICY "Staff manage return_items" ON public.return_items FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'support') OR has_role(auth.uid(), 'warehouse') OR has_role(auth.uid(), 'sales'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'support') OR has_role(auth.uid(), 'warehouse') OR has_role(auth.uid(), 'sales'));

CREATE OR REPLACE FUNCTION public.generate_rma_number()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_count int;
BEGIN
  SELECT COUNT(*) + 1 INTO v_count FROM public.returns;
  RETURN 'RMA-' || LPAD(v_count::text, 5, '0');
END; $$;

CREATE OR REPLACE FUNCTION public.approve_return(p_return_id uuid, p_notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.returns
    SET status = 'approved', approved_by = auth.uid(), approved_at = now(),
        internal_notes = COALESCE(internal_notes || E'\n', '') || COALESCE(p_notes, '')
    WHERE id = p_return_id AND status = 'requested';
  IF NOT FOUND THEN RAISE EXCEPTION 'Return not found or not in requested state'; END IF;
  RETURN jsonb_build_object('success', true, 'return_id', p_return_id);
END; $$;

CREATE OR REPLACE FUNCTION public.receive_return(p_return_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.returns SET status = 'received', received_at = now()
    WHERE id = p_return_id AND status = 'approved';
  IF NOT FOUND THEN RAISE EXCEPTION 'Return must be approved before receiving'; END IF;
  INSERT INTO public.agent_events (event_name, payload, source)
  SELECT 'stock.movement',
    jsonb_build_object('lines', jsonb_agg(jsonb_build_object(
      'product_id', ri.product_id, 'qty', ri.quantity,
      'reason', 'rma_restock', 'reference_id', p_return_id::text)))
    , 'returns'
  FROM public.return_items ri
  WHERE ri.return_id = p_return_id AND ri.restock = true AND ri.product_id IS NOT NULL
  GROUP BY p_return_id HAVING COUNT(*) > 0;
  RETURN jsonb_build_object('success', true, 'return_id', p_return_id);
END; $$;

CREATE OR REPLACE FUNCTION public.refund_return(p_return_id uuid, p_refund_cents integer, p_method text DEFAULT 'manual')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.returns
    SET status = 'refunded', refund_amount_cents = p_refund_cents,
        refund_method = p_method, refund_processed_at = now()
    WHERE id = p_return_id AND status IN ('received', 'approved');
  IF NOT FOUND THEN RAISE EXCEPTION 'Return not in refundable state'; END IF;
  RETURN jsonb_build_object('success', true, 'return_id', p_return_id, 'refunded_cents', p_refund_cents);
END; $$;

GRANT EXECUTE ON FUNCTION public.resolve_pricelist_price(uuid, uuid, uuid, numeric, date, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_return(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.receive_return(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refund_return(uuid, integer, text) TO authenticated;