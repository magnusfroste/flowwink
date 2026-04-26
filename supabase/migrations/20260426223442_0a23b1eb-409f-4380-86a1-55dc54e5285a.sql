-- ============================================================
-- RFQ (Request for Quotation) workflow + Vendor Price List tiers
-- ============================================================

-- Extend vendor_products with validity + min-qty tiers (price list)
ALTER TABLE public.vendor_products
  ADD COLUMN IF NOT EXISTS valid_from date,
  ADD COLUMN IF NOT EXISTS valid_until date,
  ADD COLUMN IF NOT EXISTS price_tier_min_qty integer NOT NULL DEFAULT 1;

-- Drop the old uniqueness so we can have multiple tiers per (vendor, product)
ALTER TABLE public.vendor_products
  DROP CONSTRAINT IF EXISTS vendor_products_vendor_id_product_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS vendor_products_vendor_product_tier_key
  ON public.vendor_products (vendor_id, product_id, price_tier_min_qty);

-- ── RFQ status enum ─────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.rfq_status AS ENUM
    ('draft', 'sent', 'bidding', 'closed', 'awarded', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.rfq_bid_status AS ENUM
    ('pending', 'submitted', 'awarded', 'rejected', 'withdrawn');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── RFQ header ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rfqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_number text NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  status public.rfq_status NOT NULL DEFAULT 'draft',
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  response_deadline date,
  expected_delivery date,
  currency text NOT NULL DEFAULT 'SEK',
  notes text,
  awarded_vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  awarded_po_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── RFQ line items (what we want quotes for) ────────────────
CREATE TABLE IF NOT EXISTS public.rfq_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id uuid NOT NULL REFERENCES public.rfqs(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  description text NOT NULL,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  target_unit_price_cents integer,
  notes text,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rfq_lines_rfq ON public.rfq_lines(rfq_id);

-- ── Vendor invitations & their bids ─────────────────────────
CREATE TABLE IF NOT EXISTS public.rfq_bids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id uuid NOT NULL REFERENCES public.rfqs(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  status public.rfq_bid_status NOT NULL DEFAULT 'pending',
  invited_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  total_cents integer NOT NULL DEFAULT 0,
  lead_time_days integer,
  payment_terms text,
  validity_days integer DEFAULT 30,
  notes text,
  -- per-line offer stored as JSON: [{rfq_line_id, unit_price_cents, lead_time_days, note}]
  line_offers jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rfq_id, vendor_id)
);

CREATE INDEX IF NOT EXISTS idx_rfq_bids_rfq ON public.rfq_bids(rfq_id);
CREATE INDEX IF NOT EXISTS idx_rfq_bids_vendor ON public.rfq_bids(vendor_id);

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE public.rfqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfq_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfq_bids ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users full access to rfqs" ON public.rfqs;
CREATE POLICY "Authenticated users full access to rfqs"
  ON public.rfqs FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users full access to rfq_lines" ON public.rfq_lines;
CREATE POLICY "Authenticated users full access to rfq_lines"
  ON public.rfq_lines FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users full access to rfq_bids" ON public.rfq_bids;
CREATE POLICY "Authenticated users full access to rfq_bids"
  ON public.rfq_bids FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── RFQ number generator ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.generate_rfq_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  yr text := to_char(now(), 'YYYY');
  next_seq int;
BEGIN
  IF NEW.rfq_number IS NULL OR NEW.rfq_number = '' THEN
    SELECT COALESCE(MAX(NULLIF(regexp_replace(rfq_number, '^RFQ-' || yr || '-', ''), '')::int), 0) + 1
      INTO next_seq
      FROM public.rfqs
      WHERE rfq_number LIKE 'RFQ-' || yr || '-%';
    NEW.rfq_number := 'RFQ-' || yr || '-' || lpad(next_seq::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_generate_rfq_number ON public.rfqs;
CREATE TRIGGER trigger_generate_rfq_number
  BEFORE INSERT ON public.rfqs
  FOR EACH ROW
  WHEN (NEW.rfq_number IS NULL OR NEW.rfq_number = '')
  EXECUTE FUNCTION public.generate_rfq_number();

-- ── updated_at triggers ─────────────────────────────────────
DROP TRIGGER IF EXISTS update_rfqs_updated_at ON public.rfqs;
CREATE TRIGGER update_rfqs_updated_at
  BEFORE UPDATE ON public.rfqs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS update_rfq_bids_updated_at ON public.rfq_bids;
CREATE TRIGGER update_rfq_bids_updated_at
  BEFORE UPDATE ON public.rfq_bids
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ── Award RFQ → create PO ───────────────────────────────────
-- Awards the winning bid and atomically creates a draft purchase order
-- using the bid's per-line offer prices. Returns the new PO id.
CREATE OR REPLACE FUNCTION public.award_rfq(_rfq_id uuid, _bid_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bid public.rfq_bids%ROWTYPE;
  v_rfq public.rfqs%ROWTYPE;
  v_po_id uuid;
  v_line record;
  v_offer jsonb;
  v_unit_price int;
  v_total int := 0;
  v_subtotal int := 0;
BEGIN
  SELECT * INTO v_rfq FROM public.rfqs WHERE id = _rfq_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RFQ % not found', _rfq_id; END IF;
  IF v_rfq.status = 'awarded' THEN RAISE EXCEPTION 'RFQ % already awarded', _rfq_id; END IF;

  SELECT * INTO v_bid FROM public.rfq_bids
    WHERE id = _bid_id AND rfq_id = _rfq_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bid % not found for RFQ %', _bid_id, _rfq_id; END IF;

  -- Create draft PO
  INSERT INTO public.purchase_orders (vendor_id, currency, expected_delivery, notes, created_by)
  VALUES (
    v_bid.vendor_id,
    v_rfq.currency,
    v_rfq.expected_delivery,
    'Awarded from ' || v_rfq.rfq_number || ' — ' || COALESCE(v_rfq.title, ''),
    auth.uid()
  )
  RETURNING id INTO v_po_id;

  -- Create PO lines from RFQ lines using bid offer prices
  FOR v_line IN SELECT * FROM public.rfq_lines WHERE rfq_id = _rfq_id ORDER BY position LOOP
    SELECT elem INTO v_offer
      FROM jsonb_array_elements(v_bid.line_offers) elem
      WHERE elem->>'rfq_line_id' = v_line.id::text
      LIMIT 1;

    v_unit_price := COALESCE((v_offer->>'unit_price_cents')::int, 0);
    v_total := v_unit_price * v_line.quantity;
    v_subtotal := v_subtotal + v_total;

    INSERT INTO public.purchase_order_lines
      (purchase_order_id, product_id, description, quantity, unit_price_cents, total_cents)
    VALUES
      (v_po_id, v_line.product_id, v_line.description, v_line.quantity, v_unit_price, v_total);
  END LOOP;

  -- Update PO totals (25% VAT default — same convention as create_po)
  UPDATE public.purchase_orders
     SET subtotal_cents = v_subtotal,
         tax_cents = (v_subtotal * 0.25)::int,
         total_cents = v_subtotal + (v_subtotal * 0.25)::int
   WHERE id = v_po_id;

  -- Mark winning bid + close other bids + award RFQ
  UPDATE public.rfq_bids SET status = 'awarded' WHERE id = _bid_id;
  UPDATE public.rfq_bids SET status = 'rejected'
    WHERE rfq_id = _rfq_id AND id <> _bid_id AND status NOT IN ('withdrawn');

  UPDATE public.rfqs
     SET status = 'awarded',
         awarded_vendor_id = v_bid.vendor_id,
         awarded_po_id = v_po_id
   WHERE id = _rfq_id;

  RETURN v_po_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.award_rfq(uuid, uuid) TO authenticated;