-- Vendor-product pricing/sourcing table
CREATE TABLE IF NOT EXISTS public.vendor_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  unit_price_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'SEK',
  lead_time_days INTEGER DEFAULT 7,
  min_order_quantity INTEGER DEFAULT 1,
  vendor_sku TEXT,
  is_preferred BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(vendor_id, product_id)
);

-- Add auto-reorder fields to product_stock
ALTER TABLE public.product_stock
  ADD COLUMN IF NOT EXISTS reorder_quantity INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS auto_reorder BOOLEAN NOT NULL DEFAULT false;

-- Ensure only one preferred vendor per product
CREATE UNIQUE INDEX IF NOT EXISTS idx_vendor_products_preferred
  ON public.vendor_products(product_id) WHERE is_preferred = true;

-- RLS for vendor_products (admin-only via authenticated)
ALTER TABLE public.vendor_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view vendor products"
  ON public.vendor_products FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage vendor products"
  ON public.vendor_products FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));