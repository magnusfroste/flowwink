-- EPIC-01: product attributes, values, variants
CREATE TABLE IF NOT EXISTS public.product_attributes (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    name text NOT NULL UNIQUE,
    display_type text DEFAULT 'select' NOT NULL CHECK (display_type IN ('select','color','radio','pills')),
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.product_attribute_values (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    attribute_id uuid NOT NULL REFERENCES public.product_attributes(id) ON DELETE CASCADE,
    value text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    UNIQUE (attribute_id, value)
);
CREATE TABLE IF NOT EXISTS public.product_variants (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    sku text,
    barcode text,
    price_delta_cents bigint DEFAULT 0 NOT NULL,
    stock_quantity integer,
    image_url text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS product_variants_sku_key ON public.product_variants (sku) WHERE sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS product_variants_product_id_idx ON public.product_variants (product_id);
CREATE TABLE IF NOT EXISTS public.product_variant_values (
    variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
    attribute_value_id uuid NOT NULL REFERENCES public.product_attribute_values(id) ON DELETE CASCADE,
    PRIMARY KEY (variant_id, attribute_value_id)
);

GRANT ALL ON TABLE public.product_attributes TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.product_attribute_values TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.product_variants TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.product_variant_values TO anon, authenticated, service_role;

ALTER TABLE public.product_attributes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_attribute_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variant_values ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage product attributes" ON public.product_attributes;
CREATE POLICY "Admins can manage product attributes" ON public.product_attributes USING (public.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS "Public can view product attributes" ON public.product_attributes;
CREATE POLICY "Public can view product attributes" ON public.product_attributes FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can manage product attribute values" ON public.product_attribute_values;
CREATE POLICY "Admins can manage product attribute values" ON public.product_attribute_values USING (public.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS "Public can view product attribute values" ON public.product_attribute_values;
CREATE POLICY "Public can view product attribute values" ON public.product_attribute_values FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can manage product variants" ON public.product_variants;
CREATE POLICY "Admins can manage product variants" ON public.product_variants USING (public.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS "Public can view active product variants" ON public.product_variants;
CREATE POLICY "Public can view active product variants" ON public.product_variants FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Admins can manage product variant values" ON public.product_variant_values;
CREATE POLICY "Admins can manage product variant values" ON public.product_variant_values USING (public.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS "Public can view product variant values" ON public.product_variant_values;
CREATE POLICY "Public can view product variant values" ON public.product_variant_values FOR SELECT USING (true);

DROP TRIGGER IF EXISTS update_product_attributes_updated_at ON public.product_attributes;
CREATE TRIGGER update_product_attributes_updated_at BEFORE UPDATE ON public.product_attributes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
DROP TRIGGER IF EXISTS update_product_variants_updated_at ON public.product_variants;
CREATE TRIGGER update_product_variants_updated_at BEFORE UPDATE ON public.product_variants FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.manage_product_variant(
  p_action text,
  p_product_id uuid DEFAULT NULL,
  p_variant_id uuid DEFAULT NULL,
  p_sku text DEFAULT NULL,
  p_barcode text DEFAULT NULL,
  p_price_delta_cents bigint DEFAULT NULL,
  p_stock_quantity integer DEFAULT NULL,
  p_is_active boolean DEFAULT NULL,
  p_attribute_value_ids uuid[] DEFAULT NULL,
  p_attributes jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_writer boolean := (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'));
  v_variant record;
  v_result jsonb;
  v_attr jsonb;
  v_attr_id uuid;
  v_val text;
  v_combo uuid[];
  v_created int := 0;
  v_sku_base text;
  v_suffix text;
  v_new_id uuid;
BEGIN
  IF p_action IN ('create','update','deactivate','generate') AND NOT v_is_writer THEN
    RAISE EXCEPTION 'Only admins can modify product variants';
  END IF;
  IF p_action = 'list' THEN
    IF p_product_id IS NULL THEN RAISE EXCEPTION 'product_id is required for list'; END IF;
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', v.id, 'sku', v.sku, 'barcode', v.barcode,
      'price_delta_cents', v.price_delta_cents, 'stock_quantity', v.stock_quantity, 'is_active', v.is_active,
      'values', (SELECT COALESCE(jsonb_agg(jsonb_build_object('attribute', a.name, 'value', av.value)), '[]'::jsonb)
                 FROM product_variant_values vv
                 JOIN product_attribute_values av ON av.id = vv.attribute_value_id
                 JOIN product_attributes a ON a.id = av.attribute_id
                 WHERE vv.variant_id = v.id)
    ) ORDER BY v.created_at), '[]'::jsonb) INTO v_result
    FROM product_variants v WHERE v.product_id = p_product_id;
    RETURN jsonb_build_object('success', true, 'variants', v_result);
  ELSIF p_action = 'get' THEN
    IF p_variant_id IS NULL THEN RAISE EXCEPTION 'variant_id is required for get'; END IF;
    SELECT * INTO v_variant FROM product_variants WHERE id = p_variant_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Variant % not found', p_variant_id; END IF;
    RETURN jsonb_build_object('success', true, 'variant', to_jsonb(v_variant));
  ELSIF p_action = 'create' THEN
    IF p_product_id IS NULL THEN RAISE EXCEPTION 'product_id is required for create'; END IF;
    INSERT INTO product_variants (product_id, sku, barcode, price_delta_cents, stock_quantity, is_active)
    VALUES (p_product_id, p_sku, p_barcode, COALESCE(p_price_delta_cents, 0), p_stock_quantity, COALESCE(p_is_active, true))
    RETURNING id INTO v_new_id;
    IF p_attribute_value_ids IS NOT NULL THEN
      INSERT INTO product_variant_values (variant_id, attribute_value_id)
      SELECT v_new_id, unnest(p_attribute_value_ids) ON CONFLICT DO NOTHING;
    END IF;
    RETURN jsonb_build_object('success', true, 'variant_id', v_new_id);
  ELSIF p_action = 'update' THEN
    IF p_variant_id IS NULL THEN RAISE EXCEPTION 'variant_id is required for update'; END IF;
    UPDATE product_variants SET
      sku = COALESCE(p_sku, sku), barcode = COALESCE(p_barcode, barcode),
      price_delta_cents = COALESCE(p_price_delta_cents, price_delta_cents),
      stock_quantity = COALESCE(p_stock_quantity, stock_quantity),
      is_active = COALESCE(p_is_active, is_active)
    WHERE id = p_variant_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Variant % not found', p_variant_id; END IF;
    RETURN jsonb_build_object('success', true, 'variant_id', p_variant_id);
  ELSIF p_action = 'deactivate' THEN
    IF p_variant_id IS NULL THEN RAISE EXCEPTION 'variant_id is required for deactivate'; END IF;
    UPDATE product_variants SET is_active = false WHERE id = p_variant_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Variant % not found', p_variant_id; END IF;
    RETURN jsonb_build_object('success', true, 'variant_id', p_variant_id);
  ELSIF p_action = 'generate' THEN
    IF p_product_id IS NULL OR p_attributes IS NULL OR jsonb_typeof(p_attributes) <> 'array' THEN
      RAISE EXCEPTION 'product_id and attributes (array) are required for generate';
    END IF;
    SELECT COALESCE(NULLIF(regexp_replace(upper(name), '[^A-Z0-9]+', '-', 'g'), ''), 'VAR')
    INTO v_sku_base FROM products WHERE id = p_product_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Product % not found', p_product_id; END IF;
    FOR v_attr IN SELECT * FROM jsonb_array_elements(p_attributes) LOOP
      IF v_attr->>'name' IS NULL OR jsonb_typeof(v_attr->'values') <> 'array'
         OR jsonb_array_length(v_attr->'values') = 0 THEN
        RAISE EXCEPTION 'Each attribute needs a name and a non-empty values array';
      END IF;
      INSERT INTO product_attributes (name) VALUES (v_attr->>'name')
      ON CONFLICT (name) DO UPDATE SET updated_at = now() RETURNING id INTO v_attr_id;
      FOR v_val IN SELECT jsonb_array_elements_text(v_attr->'values') LOOP
        INSERT INTO product_attribute_values (attribute_id, value) VALUES (v_attr_id, v_val)
        ON CONFLICT (attribute_id, value) DO NOTHING;
      END LOOP;
    END LOOP;
    DROP TABLE IF EXISTS _variant_combos;
    CREATE TEMP TABLE _variant_combos ON COMMIT DROP AS
    WITH RECURSIVE attrs AS (
      SELECT a.id AS attr_id, row_number() OVER (ORDER BY a.sort_order, a.name) AS rn
      FROM product_attributes a
      WHERE a.name IN (SELECT jsonb_array_elements(p_attributes)->>'name')
    ),
    combos(rn, value_ids, label) AS (
      SELECT a.rn, ARRAY[av.id], av.value
      FROM attrs a JOIN product_attribute_values av ON av.attribute_id = a.attr_id
      WHERE a.rn = 1 AND av.value IN (
        SELECT jsonb_array_elements_text(e->'values') FROM jsonb_array_elements(p_attributes) e
        WHERE e->>'name' = (SELECT pa.name FROM product_attributes pa WHERE pa.id = a.attr_id))
      UNION ALL
      SELECT a.rn, c.value_ids || av.id, c.label || '-' || av.value
      FROM combos c JOIN attrs a ON a.rn = c.rn + 1
      JOIN product_attribute_values av ON av.attribute_id = a.attr_id
      WHERE av.value IN (SELECT jsonb_array_elements_text(e->'values') FROM jsonb_array_elements(p_attributes) e
        WHERE e->>'name' = (SELECT pa.name FROM product_attributes pa WHERE pa.id = a.attr_id))
    )
    SELECT value_ids, label FROM combos WHERE rn = (SELECT max(rn) FROM attrs);
    FOR v_combo, v_suffix IN SELECT value_ids, label FROM _variant_combos LOOP
      IF EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p_product_id
        AND (SELECT array_agg(vv.attribute_value_id ORDER BY vv.attribute_value_id)
             FROM product_variant_values vv WHERE vv.variant_id = pv.id)
          = (SELECT array_agg(x ORDER BY x) FROM unnest(v_combo) x)) THEN CONTINUE; END IF;
      INSERT INTO product_variants (product_id, sku, price_delta_cents)
      VALUES (p_product_id, v_sku_base || '-' || regexp_replace(upper(v_suffix), '[^A-Z0-9-]+', '', 'g'), 0)
      RETURNING id INTO v_new_id;
      INSERT INTO product_variant_values (variant_id, attribute_value_id)
      SELECT v_new_id, unnest(v_combo);
      v_created := v_created + 1;
    END LOOP;
    RETURN jsonb_build_object('success', true, 'created', v_created);
  ELSE
    RAISE EXCEPTION 'Unknown action: %. Use list|get|create|update|deactivate|generate', p_action;
  END IF;
END;
$$;
GRANT ALL ON FUNCTION public.manage_product_variant(text,uuid,uuid,text,text,bigint,integer,boolean,uuid[],jsonb) TO anon, authenticated, service_role;

-- Order items: variant link + tax + qty_fulfilled
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS variant_id uuid,
  ADD COLUMN IF NOT EXISTS tax_rate_pct numeric(6,3),
  ADD COLUMN IF NOT EXISTS qty_fulfilled numeric(12,2) DEFAULT 0 NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='order_items_variant_id_fkey' AND table_name='order_items') THEN
    ALTER TABLE public.order_items ADD CONSTRAINT order_items_variant_id_fkey
      FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints WHERE constraint_name='order_items_qty_fulfilled_nonneg') THEN
    ALTER TABLE public.order_items ADD CONSTRAINT order_items_qty_fulfilled_nonneg CHECK (qty_fulfilled >= 0);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS order_items_variant_id_idx ON public.order_items (variant_id) WHERE variant_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.fulfill_order_line(p_line_id uuid, p_qty numeric DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_line record; v_new_fulfilled numeric; v_order_id uuid; v_remaining numeric; v_order_complete boolean;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admins can fulfill order lines';
  END IF;
  SELECT id, order_id, quantity, qty_fulfilled INTO v_line FROM order_items WHERE id = p_line_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order line % not found', p_line_id; END IF;
  v_order_id := v_line.order_id;
  v_new_fulfilled := LEAST(v_line.quantity, v_line.qty_fulfilled + COALESCE(p_qty, v_line.quantity - v_line.qty_fulfilled));
  IF v_new_fulfilled < 0 THEN v_new_fulfilled := 0; END IF;
  UPDATE order_items SET qty_fulfilled = v_new_fulfilled WHERE id = p_line_id;
  SELECT COALESCE(SUM(quantity - qty_fulfilled), 0) INTO v_remaining FROM order_items WHERE order_id = v_order_id;
  v_order_complete := (v_remaining <= 0);
  IF v_order_complete THEN
    UPDATE orders SET fulfillment_status = 'shipped', shipped_at = COALESCE(shipped_at, now())
    WHERE id = v_order_id AND fulfillment_status <> 'delivered';
  END IF;
  RETURN jsonb_build_object('line_id', p_line_id, 'qty_fulfilled', v_new_fulfilled,
    'line_quantity', v_line.quantity, 'line_complete', v_new_fulfilled >= v_line.quantity,
    'order_remaining', v_remaining, 'order_fully_fulfilled', v_order_complete);
END;
$$;
GRANT ALL ON FUNCTION public.fulfill_order_line(uuid, numeric) TO anon, authenticated, service_role;

-- POS sale lines: variant_id
ALTER TABLE public.pos_sale_lines ADD COLUMN IF NOT EXISTS variant_id uuid;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='pos_sale_lines_variant_id_fkey' AND table_name='pos_sale_lines') THEN
    ALTER TABLE public.pos_sale_lines ADD CONSTRAINT pos_sale_lines_variant_id_fkey
      FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS pos_sale_lines_variant_id_idx ON public.pos_sale_lines (variant_id) WHERE variant_id IS NOT NULL;

-- UoM
CREATE TABLE IF NOT EXISTS public.uom_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    name text NOT NULL UNIQUE,
    created_at timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.uoms (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    category_id uuid NOT NULL REFERENCES public.uom_categories(id) ON DELETE CASCADE,
    name text NOT NULL,
    code text,
    factor numeric(18,9) DEFAULT 1 NOT NULL CHECK (factor > 0),
    is_reference boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    UNIQUE (category_id, name)
);
CREATE UNIQUE INDEX IF NOT EXISTS uoms_one_reference_per_category ON public.uoms (category_id) WHERE is_reference;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sales_uom_id uuid;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='products_sales_uom_id_fkey' AND table_name='products') THEN
    ALTER TABLE public.products ADD CONSTRAINT products_sales_uom_id_fkey
      FOREIGN KEY (sales_uom_id) REFERENCES public.uoms(id) ON DELETE SET NULL;
  END IF;
END $$;

GRANT ALL ON TABLE public.uom_categories TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.uoms TO anon, authenticated, service_role;

ALTER TABLE public.uom_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uoms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage uom categories" ON public.uom_categories;
CREATE POLICY "Admins can manage uom categories" ON public.uom_categories USING (public.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS "Public can view uom categories" ON public.uom_categories;
CREATE POLICY "Public can view uom categories" ON public.uom_categories FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins can manage uoms" ON public.uoms;
CREATE POLICY "Admins can manage uoms" ON public.uoms USING (public.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS "Public can view uoms" ON public.uoms;
CREATE POLICY "Public can view uoms" ON public.uoms FOR SELECT USING (true);

INSERT INTO public.uom_categories (id, name) VALUES ('11111111-1111-4111-8111-111111111111', 'Units') ON CONFLICT (name) DO NOTHING;
INSERT INTO public.uoms (id, category_id, name, code, factor, is_reference)
VALUES ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'Unit', 'unit', 1, true)
ON CONFLICT (category_id, name) DO NOTHING;

CREATE OR REPLACE FUNCTION public.convert_uom(p_qty numeric, p_from_uom uuid, p_to_uom uuid)
RETURNS numeric LANGUAGE plpgsql STABLE SET search_path TO 'public'
AS $$
DECLARE v_from record; v_to record;
BEGIN
  IF p_from_uom = p_to_uom OR p_from_uom IS NULL OR p_to_uom IS NULL THEN RETURN p_qty; END IF;
  SELECT category_id, factor INTO v_from FROM uoms WHERE id = p_from_uom;
  IF NOT FOUND THEN RAISE EXCEPTION 'UoM % not found', p_from_uom; END IF;
  SELECT category_id, factor INTO v_to FROM uoms WHERE id = p_to_uom;
  IF NOT FOUND THEN RAISE EXCEPTION 'UoM % not found', p_to_uom; END IF;
  IF v_from.category_id <> v_to.category_id THEN RAISE EXCEPTION 'Cannot convert between UoMs in different categories'; END IF;
  RETURN p_qty * v_from.factor / v_to.factor;
END $$;
GRANT ALL ON FUNCTION public.convert_uom(numeric, uuid, uuid) TO anon, authenticated, service_role;

-- Pipeline stages
CREATE TABLE IF NOT EXISTS public.pipeline_stages (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    entity_type text NOT NULL CHECK (entity_type IN ('lead','deal','ticket')),
    key text NOT NULL,
    name text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    probability numeric(5,2) CHECK (probability IS NULL OR (probability >= 0 AND probability <= 100)),
    is_won boolean DEFAULT false NOT NULL,
    is_lost boolean DEFAULT false NOT NULL,
    fold boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    UNIQUE (entity_type, key)
);
GRANT ALL ON TABLE public.pipeline_stages TO anon, authenticated, service_role;
ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can manage pipeline stages" ON public.pipeline_stages;
CREATE POLICY "Admins can manage pipeline stages" ON public.pipeline_stages USING (public.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS "Staff can view pipeline stages" ON public.pipeline_stages;
CREATE POLICY "Staff can view pipeline stages" ON public.pipeline_stages FOR SELECT USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'approver'::public.app_role)
  OR public.has_role(auth.uid(), 'writer'::public.app_role)
);
DROP TRIGGER IF EXISTS update_pipeline_stages_updated_at ON public.pipeline_stages;
CREATE TRIGGER update_pipeline_stages_updated_at BEFORE UPDATE ON public.pipeline_stages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

INSERT INTO public.pipeline_stages (entity_type, key, name, sort_order, probability, is_won, is_lost, fold) VALUES
  ('lead','lead','Lead',10,10,false,false,false),
  ('lead','opportunity','Opportunity',20,40,false,false,false),
  ('lead','customer','Customer',30,100,true,false,false),
  ('lead','lost','Lost',40,0,false,true,true),
  ('deal','lead','Lead',10,10,false,false,false),
  ('deal','prospecting','Prospecting',20,20,false,false,false),
  ('deal','qualified','Qualified',30,40,false,false,false),
  ('deal','proposal','Proposal',40,60,false,false,false),
  ('deal','negotiation','Negotiation',50,80,false,false,false),
  ('deal','closed_won','Closed Won',60,100,true,false,false),
  ('deal','closed_lost','Closed Lost',70,0,false,true,true),
  ('ticket','new','New',10,NULL,false,false,false),
  ('ticket','open','Open',20,NULL,false,false,false),
  ('ticket','in_progress','In Progress',30,NULL,false,false,false),
  ('ticket','waiting','Waiting',40,NULL,false,false,false),
  ('ticket','resolved','Resolved',50,NULL,true,false,true),
  ('ticket','closed','Closed',60,NULL,true,false,true)
ON CONFLICT (entity_type, key) DO NOTHING;

ALTER TABLE public.leads   ADD COLUMN IF NOT EXISTS stage_id uuid;
ALTER TABLE public.deals   ADD COLUMN IF NOT EXISTS stage_id uuid;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS stage_id uuid;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='leads_stage_id_fkey' AND table_name='leads') THEN
    ALTER TABLE public.leads ADD CONSTRAINT leads_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES public.pipeline_stages(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='deals_stage_id_fkey' AND table_name='deals') THEN
    ALTER TABLE public.deals ADD CONSTRAINT deals_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES public.pipeline_stages(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='tickets_stage_id_fkey' AND table_name='tickets') THEN
    ALTER TABLE public.tickets ADD CONSTRAINT tickets_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES public.pipeline_stages(id) ON DELETE SET NULL;
  END IF;
END $$;

UPDATE public.leads l SET stage_id = s.id FROM public.pipeline_stages s
  WHERE s.entity_type='lead' AND s.key = l.status::text AND l.stage_id IS NULL;
UPDATE public.deals d SET stage_id = s.id FROM public.pipeline_stages s
  WHERE s.entity_type='deal' AND s.key = d.stage::text AND d.stage_id IS NULL;
UPDATE public.tickets t SET stage_id = s.id FROM public.pipeline_stages s
  WHERE s.entity_type='ticket' AND s.key = t.status::text AND t.stage_id IS NULL;

CREATE OR REPLACE FUNCTION public.manage_pipeline_stage(
  p_action text,
  p_entity_type text DEFAULT NULL,
  p_stage_id uuid DEFAULT NULL,
  p_key text DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_sort_order integer DEFAULT NULL,
  p_probability numeric DEFAULT NULL,
  p_is_won boolean DEFAULT NULL,
  p_is_lost boolean DEFAULT NULL,
  p_fold boolean DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_writer boolean := (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'));
  v_id uuid; v_result jsonb;
BEGIN
  IF p_action IN ('create','update','delete') AND NOT v_writer THEN
    RAISE EXCEPTION 'Only admins can modify pipeline stages';
  END IF;
  IF p_action = 'list' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.sort_order), '[]'::jsonb) INTO v_result
    FROM pipeline_stages s WHERE p_entity_type IS NULL OR s.entity_type = p_entity_type;
    RETURN jsonb_build_object('success', true, 'stages', v_result);
  ELSIF p_action = 'create' THEN
    IF p_entity_type IS NULL OR p_name IS NULL THEN RAISE EXCEPTION 'entity_type and name are required'; END IF;
    INSERT INTO pipeline_stages (entity_type, key, name, sort_order, probability, is_won, is_lost, fold)
    VALUES (p_entity_type,
      COALESCE(p_key, regexp_replace(lower(p_name), '[^a-z0-9]+', '_', 'g')),
      p_name, COALESCE(p_sort_order, 0), p_probability,
      COALESCE(p_is_won, false), COALESCE(p_is_lost, false), COALESCE(p_fold, false))
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('success', true, 'stage_id', v_id);
  ELSIF p_action = 'update' THEN
    IF p_stage_id IS NULL THEN RAISE EXCEPTION 'stage_id is required for update'; END IF;
    UPDATE pipeline_stages SET name = COALESCE(p_name, name),
      sort_order = COALESCE(p_sort_order, sort_order),
      probability = COALESCE(p_probability, probability),
      is_won = COALESCE(p_is_won, is_won), is_lost = COALESCE(p_is_lost, is_lost),
      fold = COALESCE(p_fold, fold)
    WHERE id = p_stage_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Stage % not found', p_stage_id; END IF;
    RETURN jsonb_build_object('success', true, 'stage_id', p_stage_id);
  ELSIF p_action = 'delete' THEN
    IF p_stage_id IS NULL THEN RAISE EXCEPTION 'stage_id is required for delete'; END IF;
    DELETE FROM pipeline_stages WHERE id = p_stage_id;
    RETURN jsonb_build_object('success', true, 'deleted', p_stage_id);
  ELSE RAISE EXCEPTION 'Unknown action: %. Use list|create|update|delete', p_action;
  END IF;
END $$;
GRANT ALL ON FUNCTION public.manage_pipeline_stage(text,text,uuid,text,text,integer,numeric,boolean,boolean,boolean) TO anon, authenticated, service_role;

-- Approval chains
CREATE TABLE IF NOT EXISTS public.approval_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    name text NOT NULL UNIQUE,
    description text,
    created_at timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.approval_group_members (
    group_id uuid NOT NULL REFERENCES public.approval_groups(id) ON DELETE CASCADE,
    user_id uuid NOT NULL,
    PRIMARY KEY (group_id, user_id)
);
CREATE TABLE IF NOT EXISTS public.approval_chains (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    name text NOT NULL UNIQUE,
    entity_type text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.approval_steps (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    chain_id uuid NOT NULL REFERENCES public.approval_chains(id) ON DELETE CASCADE,
    sort_order integer NOT NULL,
    required_role public.app_role,
    group_id uuid REFERENCES public.approval_groups(id) ON DELETE RESTRICT,
    min_approvals integer DEFAULT 1 NOT NULL CHECK (min_approvals >= 1),
    created_at timestamptz DEFAULT now() NOT NULL,
    UNIQUE (chain_id, sort_order),
    CHECK ((required_role IS NOT NULL) <> (group_id IS NOT NULL))
);
ALTER TABLE public.approval_requests
  ADD COLUMN IF NOT EXISTS chain_id uuid,
  ADD COLUMN IF NOT EXISTS current_step integer;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='approval_requests_chain_id_fkey' AND table_name='approval_requests') THEN
    ALTER TABLE public.approval_requests ADD CONSTRAINT approval_requests_chain_id_fkey
      FOREIGN KEY (chain_id) REFERENCES public.approval_chains(id) ON DELETE SET NULL;
  END IF;
END $$;
ALTER TABLE public.approval_decisions ADD COLUMN IF NOT EXISTS step_sort_order integer;

DROP TRIGGER IF EXISTS update_approval_chains_updated_at ON public.approval_chains;
CREATE TRIGGER update_approval_chains_updated_at BEFORE UPDATE ON public.approval_chains FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['approval_groups','approval_group_members','approval_chains','approval_steps']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "Admins manage %1$s" ON public.%1$s', t);
    EXECUTE format('CREATE POLICY "Admins manage %1$s" ON public.%1$s USING (public.has_role(auth.uid(), ''admin''::public.app_role))', t);
    EXECUTE format('DROP POLICY IF EXISTS "Staff view %1$s" ON public.%1$s', t);
    EXECUTE format('CREATE POLICY "Staff view %1$s" ON public.%1$s FOR SELECT USING (public.has_role(auth.uid(), ''admin''::public.app_role) OR public.has_role(auth.uid(), ''approver''::public.app_role) OR public.has_role(auth.uid(), ''writer''::public.app_role))', t);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO anon, authenticated, service_role', t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.advance_approval_step(
  p_request_id uuid,
  p_decision public.approval_decision_kind,
  p_decided_by uuid DEFAULT NULL,
  p_decided_role public.app_role DEFAULT NULL,
  p_comment text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_req record; v_step record;
  v_is_service boolean := (auth.role() = 'service_role');
  v_actor uuid := COALESCE(p_decided_by, auth.uid());
  v_role app_role := p_decided_role;
  v_satisfied boolean; v_approvals int; v_is_last boolean; v_authorized boolean;
BEGIN
  SELECT * INTO v_req FROM approval_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Approval request % not found', p_request_id; END IF;
  IF v_req.chain_id IS NULL THEN RAISE EXCEPTION 'Request % has no chain — use resolve_approval', p_request_id; END IF;
  IF v_req.status <> 'pending' THEN RAISE EXCEPTION 'Request % is already %', p_request_id, v_req.status; END IF;
  SELECT * INTO v_step FROM approval_steps WHERE chain_id = v_req.chain_id AND sort_order = v_req.current_step;
  IF NOT FOUND THEN RAISE EXCEPTION 'No step % on chain %', v_req.current_step, v_req.chain_id; END IF;
  IF v_is_service THEN v_authorized := true;
  ELSIF v_step.required_role IS NOT NULL THEN v_authorized := has_role(v_actor, v_step.required_role);
  ELSE v_authorized := EXISTS (SELECT 1 FROM approval_group_members m WHERE m.group_id = v_step.group_id AND m.user_id = v_actor);
  END IF;
  IF NOT v_authorized THEN RAISE EXCEPTION 'User % is not authorized to act on step %', v_actor, v_req.current_step; END IF;
  INSERT INTO approval_decisions (request_id, decision, decided_by, decided_role, comment, step_sort_order)
  VALUES (p_request_id, p_decision, v_actor, COALESCE(v_role, v_step.required_role, 'approver'::app_role), p_comment, v_req.current_step);
  IF p_decision = 'reject' THEN
    UPDATE approval_requests SET status = 'rejected', resolved_by = v_actor, resolved_at = now() WHERE id = p_request_id;
    RETURN jsonb_build_object('success', true, 'status', 'rejected', 'step', v_req.current_step);
  END IF;
  SELECT count(DISTINCT decided_by) INTO v_approvals FROM approval_decisions
  WHERE request_id = p_request_id AND step_sort_order = v_req.current_step AND decision = 'approve';
  v_satisfied := (v_approvals >= v_step.min_approvals);
  IF NOT v_satisfied THEN
    RETURN jsonb_build_object('success', true, 'status', 'pending', 'step', v_req.current_step, 'approvals', v_approvals, 'needed', v_step.min_approvals);
  END IF;
  v_is_last := NOT EXISTS (SELECT 1 FROM approval_steps WHERE chain_id = v_req.chain_id AND sort_order > v_req.current_step);
  IF v_is_last THEN
    UPDATE approval_requests SET status = 'approved', resolved_by = v_actor, resolved_at = now() WHERE id = p_request_id;
    RETURN jsonb_build_object('success', true, 'status', 'approved', 'step', v_req.current_step);
  ELSE
    UPDATE approval_requests SET current_step = (SELECT min(sort_order) FROM approval_steps
      WHERE chain_id = v_req.chain_id AND sort_order > v_req.current_step) WHERE id = p_request_id;
    RETURN jsonb_build_object('success', true, 'status', 'pending',
      'advanced_to', (SELECT current_step FROM approval_requests WHERE id = p_request_id));
  END IF;
END $$;
GRANT ALL ON FUNCTION public.advance_approval_step(uuid, public.approval_decision_kind, uuid, public.app_role, text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.manage_approval_chain(
  p_action text, p_chain_id uuid DEFAULT NULL, p_name text DEFAULT NULL,
  p_entity_type text DEFAULT NULL, p_steps jsonb DEFAULT NULL,
  p_group_id uuid DEFAULT NULL, p_user_ids uuid[] DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_writer boolean := (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'));
  v_chain_id uuid; v_step jsonb; v_idx int := 0; v_result jsonb;
BEGIN
  IF p_action <> 'list' AND NOT v_writer THEN RAISE EXCEPTION 'Only admins can modify approval chains'; END IF;
  IF p_action = 'list' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', c.id, 'name', c.name, 'entity_type', c.entity_type, 'is_active', c.is_active,
      'steps', (SELECT COALESCE(jsonb_agg(jsonb_build_object('sort_order', s.sort_order,
                  'required_role', s.required_role, 'group_id', s.group_id,
                  'min_approvals', s.min_approvals) ORDER BY s.sort_order), '[]'::jsonb)
                FROM approval_steps s WHERE s.chain_id = c.id)
    ) ORDER BY c.name), '[]'::jsonb) INTO v_result
    FROM approval_chains c WHERE p_entity_type IS NULL OR c.entity_type = p_entity_type;
    RETURN jsonb_build_object('success', true, 'chains', v_result);
  ELSIF p_action = 'create_chain' THEN
    IF p_name IS NULL OR p_entity_type IS NULL THEN RAISE EXCEPTION 'name and entity_type required'; END IF;
    INSERT INTO approval_chains (name, entity_type) VALUES (p_name, p_entity_type) RETURNING id INTO v_chain_id;
    IF p_steps IS NOT NULL THEN
      FOR v_step IN SELECT * FROM jsonb_array_elements(p_steps) LOOP
        v_idx := v_idx + 1;
        INSERT INTO approval_steps (chain_id, sort_order, required_role, group_id, min_approvals)
        VALUES (v_chain_id, COALESCE((v_step->>'sort_order')::int, v_idx * 10),
          NULLIF(v_step->>'required_role','')::app_role, NULLIF(v_step->>'group_id','')::uuid,
          COALESCE((v_step->>'min_approvals')::int, 1));
      END LOOP;
    END IF;
    RETURN jsonb_build_object('success', true, 'chain_id', v_chain_id);
  ELSIF p_action = 'delete_chain' THEN
    IF p_chain_id IS NULL THEN RAISE EXCEPTION 'chain_id required'; END IF;
    DELETE FROM approval_chains WHERE id = p_chain_id;
    RETURN jsonb_build_object('success', true, 'deleted', p_chain_id);
  ELSIF p_action = 'create_group' THEN
    IF p_name IS NULL THEN RAISE EXCEPTION 'name required'; END IF;
    INSERT INTO approval_groups (name) VALUES (p_name) RETURNING id INTO v_chain_id;
    IF p_user_ids IS NOT NULL THEN
      INSERT INTO approval_group_members (group_id, user_id) SELECT v_chain_id, unnest(p_user_ids) ON CONFLICT DO NOTHING;
    END IF;
    RETURN jsonb_build_object('success', true, 'group_id', v_chain_id);
  ELSIF p_action = 'set_group_members' THEN
    IF p_group_id IS NULL THEN RAISE EXCEPTION 'group_id required'; END IF;
    DELETE FROM approval_group_members WHERE group_id = p_group_id;
    IF p_user_ids IS NOT NULL THEN
      INSERT INTO approval_group_members (group_id, user_id) SELECT p_group_id, unnest(p_user_ids) ON CONFLICT DO NOTHING;
    END IF;
    RETURN jsonb_build_object('success', true, 'group_id', p_group_id);
  ELSE RAISE EXCEPTION 'Unknown action: %. Use list|create_chain|delete_chain|create_group|set_group_members', p_action;
  END IF;
END $$;
GRANT ALL ON FUNCTION public.manage_approval_chain(text,uuid,text,text,jsonb,uuid,uuid[]) TO anon, authenticated, service_role;

-- Enum ↔ stage_id sync triggers
CREATE OR REPLACE FUNCTION public.sync_lead_stage() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE v_key text; v_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.stage_id IS NOT NULL THEN
      SELECT key INTO v_key FROM pipeline_stages WHERE id = NEW.stage_id AND entity_type='lead';
      IF v_key IS NOT NULL THEN NEW.status := v_key::lead_status; END IF;
    ELSIF NEW.status IS NOT NULL THEN
      SELECT id INTO v_id FROM pipeline_stages WHERE entity_type='lead' AND key = NEW.status::text;
      NEW.stage_id := v_id;
    END IF;
  ELSE
    IF NEW.stage_id IS DISTINCT FROM OLD.stage_id AND NEW.stage_id IS NOT NULL THEN
      SELECT key INTO v_key FROM pipeline_stages WHERE id = NEW.stage_id AND entity_type='lead';
      IF v_key IS NOT NULL THEN NEW.status := v_key::lead_status; END IF;
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
      SELECT id INTO v_id FROM pipeline_stages WHERE entity_type='lead' AND key = NEW.status::text;
      IF v_id IS NOT NULL THEN NEW.stage_id := v_id; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sync_lead_stage_trg ON public.leads;
CREATE TRIGGER sync_lead_stage_trg BEFORE INSERT OR UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.sync_lead_stage();

CREATE OR REPLACE FUNCTION public.sync_deal_stage() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE v_key text; v_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.stage_id IS NOT NULL THEN
      SELECT key INTO v_key FROM pipeline_stages WHERE id = NEW.stage_id AND entity_type='deal';
      IF v_key IS NOT NULL THEN NEW.stage := v_key::deal_stage; END IF;
    ELSIF NEW.stage IS NOT NULL THEN
      SELECT id INTO v_id FROM pipeline_stages WHERE entity_type='deal' AND key = NEW.stage::text;
      NEW.stage_id := v_id;
    END IF;
  ELSE
    IF NEW.stage_id IS DISTINCT FROM OLD.stage_id AND NEW.stage_id IS NOT NULL THEN
      SELECT key INTO v_key FROM pipeline_stages WHERE id = NEW.stage_id AND entity_type='deal';
      IF v_key IS NOT NULL THEN NEW.stage := v_key::deal_stage; END IF;
    ELSIF NEW.stage IS DISTINCT FROM OLD.stage THEN
      SELECT id INTO v_id FROM pipeline_stages WHERE entity_type='deal' AND key = NEW.stage::text;
      IF v_id IS NOT NULL THEN NEW.stage_id := v_id; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sync_deal_stage_trg ON public.deals;
CREATE TRIGGER sync_deal_stage_trg BEFORE INSERT OR UPDATE ON public.deals FOR EACH ROW EXECUTE FUNCTION public.sync_deal_stage();

CREATE OR REPLACE FUNCTION public.sync_ticket_stage() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE v_key text; v_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.stage_id IS NOT NULL THEN
      SELECT key INTO v_key FROM pipeline_stages WHERE id = NEW.stage_id AND entity_type='ticket';
      IF v_key IS NOT NULL THEN NEW.status := v_key::ticket_status; END IF;
    ELSIF NEW.status IS NOT NULL THEN
      SELECT id INTO v_id FROM pipeline_stages WHERE entity_type='ticket' AND key = NEW.status::text;
      NEW.stage_id := v_id;
    END IF;
  ELSE
    IF NEW.stage_id IS DISTINCT FROM OLD.stage_id AND NEW.stage_id IS NOT NULL THEN
      SELECT key INTO v_key FROM pipeline_stages WHERE id = NEW.stage_id AND entity_type='ticket';
      IF v_key IS NOT NULL THEN NEW.status := v_key::ticket_status; END IF;
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
      SELECT id INTO v_id FROM pipeline_stages WHERE entity_type='ticket' AND key = NEW.status::text;
      IF v_id IS NOT NULL THEN NEW.stage_id := v_id; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sync_ticket_stage_trg ON public.tickets;
CREATE TRIGGER sync_ticket_stage_trg BEFORE INSERT OR UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.sync_ticket_stage();

-- Note: record_pos_sale_v2 variant-aware update is in the existing migration file
-- and depends on emit_platform_event + product columns; not re-applied here to avoid
-- divergence with the canonical version in supabase/migrations.