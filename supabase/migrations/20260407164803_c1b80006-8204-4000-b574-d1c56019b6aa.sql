
-- ═══ Inventory Module ═══

-- Stock levels per product
CREATE TABLE IF NOT EXISTS public.product_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity_on_hand integer NOT NULL DEFAULT 0,
  quantity_reserved integer NOT NULL DEFAULT 0,
  reorder_point integer NOT NULL DEFAULT 0,
  last_counted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_id)
);

-- Stock movement log
CREATE TABLE IF NOT EXISTS public.stock_moves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity integer NOT NULL,
  move_type text NOT NULL DEFAULT 'adjustment',
  reference_type text,
  reference_id text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_product_stock_product ON public.product_stock(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_moves_product ON public.stock_moves(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_moves_type ON public.stock_moves(move_type);

-- Updated_at trigger
CREATE OR REPLACE TRIGGER update_product_stock_updated_at
  BEFORE UPDATE ON public.product_stock
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ═══ RLS ═══
ALTER TABLE public.product_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_moves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view stock" ON public.product_stock
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Writers can manage stock" ON public.product_stock
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'writer') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'writer') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can view stock moves" ON public.stock_moves
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Writers can create stock moves" ON public.stock_moves
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'writer') OR public.has_role(auth.uid(), 'admin'));

-- ═══ Auto-decrement on order creation ═══
CREATE OR REPLACE FUNCTION public.trigger_order_stock_decrement()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  item record;
BEGIN
  -- Loop through order items and decrement stock
  IF NEW.items IS NOT NULL THEN
    FOR item IN SELECT * FROM jsonb_array_elements(NEW.items::jsonb)
    LOOP
      -- Insert stock move
      INSERT INTO public.stock_moves (product_id, quantity, move_type, reference_type, reference_id, notes)
      VALUES (
        (item.value->>'product_id')::uuid,
        -(item.value->>'quantity')::integer,
        'out',
        'order',
        NEW.id::text,
        'Auto-decrement from order'
      );
      
      -- Update stock level
      UPDATE public.product_stock
      SET quantity_on_hand = quantity_on_hand - (item.value->>'quantity')::integer
      WHERE product_id = (item.value->>'product_id')::uuid;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_order_stock_decrement
  AFTER INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_order_stock_decrement();
