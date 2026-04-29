-- ════════════════════════════════════════════════════════════════════
-- Manufacturing (MRP-light) module
-- Spec: docs/modules/manufacturing.md
-- ════════════════════════════════════════════════════════════════════

-- ─── Enum ───────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.mo_status AS ENUM (
    'draft', 'planned', 'confirmed', 'in_progress', 'done', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── BOM headers ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bom_headers (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id         uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  version            text NOT NULL DEFAULT 'v1',
  is_active          boolean NOT NULL DEFAULT true,
  quantity_produced  numeric(12,4) NOT NULL DEFAULT 1 CHECK (quantity_produced > 0),
  routing_notes      text,
  created_by         uuid,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, version)
);

CREATE INDEX IF NOT EXISTS idx_bom_headers_product ON public.bom_headers(product_id);
-- Only one active version per product
CREATE UNIQUE INDEX IF NOT EXISTS idx_bom_headers_one_active
  ON public.bom_headers(product_id) WHERE is_active = true;

-- ─── BOM lines ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bom_lines (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bom_id                uuid NOT NULL REFERENCES public.bom_headers(id) ON DELETE CASCADE,
  component_product_id  uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity              numeric(12,4) NOT NULL CHECK (quantity > 0),
  unit                  text,
  scrap_pct             numeric(5,2) NOT NULL DEFAULT 0 CHECK (scrap_pct >= 0 AND scrap_pct < 100),
  position              integer NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bom_id, component_product_id)
);

CREATE INDEX IF NOT EXISTS idx_bom_lines_bom ON public.bom_lines(bom_id);
CREATE INDEX IF NOT EXISTS idx_bom_lines_component ON public.bom_lines(component_product_id);

-- ─── Manufacturing Orders ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.manufacturing_orders (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mo_number     text NOT NULL UNIQUE,
  product_id    uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  bom_id        uuid REFERENCES public.bom_headers(id) ON DELETE SET NULL,
  quantity      numeric(12,4) NOT NULL CHECK (quantity > 0),
  status        public.mo_status NOT NULL DEFAULT 'draft',
  due_date      date,
  started_at    timestamptz,
  completed_at  timestamptz,
  source_type   text NOT NULL DEFAULT 'manual'
                CHECK (source_type IN ('manual', 'sales_order', 'reorder', 'agent')),
  source_id     uuid,
  notes         text,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mo_status      ON public.manufacturing_orders(status);
CREATE INDEX IF NOT EXISTS idx_mo_product     ON public.manufacturing_orders(product_id);
CREATE INDEX IF NOT EXISTS idx_mo_due_date    ON public.manufacturing_orders(due_date);
CREATE INDEX IF NOT EXISTS idx_mo_source      ON public.manufacturing_orders(source_type, source_id);

-- ─── MO components (snapshot at confirm) ────────────────────────────
CREATE TABLE IF NOT EXISTS public.mo_components (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mo_id                 uuid NOT NULL REFERENCES public.manufacturing_orders(id) ON DELETE CASCADE,
  component_product_id  uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  qty_required          numeric(12,4) NOT NULL CHECK (qty_required >= 0),
  qty_consumed          numeric(12,4) NOT NULL DEFAULT 0 CHECK (qty_consumed >= 0),
  availability          text NOT NULL DEFAULT 'unknown'
                        CHECK (availability IN ('unknown', 'ok', 'short', 'awaiting_po')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mo_id, component_product_id)
);

CREATE INDEX IF NOT EXISTS idx_mo_components_mo ON public.mo_components(mo_id);

-- ─── Extend stock_moves with optional MO link ───────────────────────
ALTER TABLE public.stock_moves
  ADD COLUMN IF NOT EXISTS mo_id uuid REFERENCES public.manufacturing_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_stock_moves_mo ON public.stock_moves(mo_id) WHERE mo_id IS NOT NULL;

-- ─── updated_at triggers ────────────────────────────────────────────
CREATE OR REPLACE TRIGGER update_bom_headers_updated_at
  BEFORE UPDATE ON public.bom_headers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE TRIGGER update_manufacturing_orders_updated_at
  BEFORE UPDATE ON public.manufacturing_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ════════════════════════════════════════════════════════════════════
-- RLS
-- ════════════════════════════════════════════════════════════════════
ALTER TABLE public.bom_headers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bom_lines             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manufacturing_orders  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mo_components         ENABLE ROW LEVEL SECURITY;

-- bom_headers
DROP POLICY IF EXISTS "Authenticated can view BOM headers" ON public.bom_headers;
CREATE POLICY "Authenticated can view BOM headers" ON public.bom_headers
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Writers can manage BOM headers" ON public.bom_headers;
CREATE POLICY "Writers can manage BOM headers" ON public.bom_headers
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'writer') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'writer') OR public.has_role(auth.uid(), 'admin'));

-- bom_lines
DROP POLICY IF EXISTS "Authenticated can view BOM lines" ON public.bom_lines;
CREATE POLICY "Authenticated can view BOM lines" ON public.bom_lines
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Writers can manage BOM lines" ON public.bom_lines;
CREATE POLICY "Writers can manage BOM lines" ON public.bom_lines
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'writer') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'writer') OR public.has_role(auth.uid(), 'admin'));

-- manufacturing_orders
DROP POLICY IF EXISTS "Authenticated can view MOs" ON public.manufacturing_orders;
CREATE POLICY "Authenticated can view MOs" ON public.manufacturing_orders
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Writers can manage MOs" ON public.manufacturing_orders;
CREATE POLICY "Writers can manage MOs" ON public.manufacturing_orders
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'writer') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'writer') OR public.has_role(auth.uid(), 'admin'));

-- mo_components
DROP POLICY IF EXISTS "Authenticated can view MO components" ON public.mo_components;
CREATE POLICY "Authenticated can view MO components" ON public.mo_components
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Writers can manage MO components" ON public.mo_components;
CREATE POLICY "Writers can manage MO components" ON public.mo_components
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'writer') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'writer') OR public.has_role(auth.uid(), 'admin'));

-- ════════════════════════════════════════════════════════════════════
-- MO number sequence (per year)
-- ════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.next_mo_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year text := to_char(now(), 'YYYY');
  v_seq  int;
BEGIN
  -- Lock to avoid race conditions on concurrent inserts
  PERFORM pg_advisory_xact_lock(hashtext('mo_number_' || v_year));
  SELECT COALESCE(MAX(NULLIF(regexp_replace(mo_number, '^MO-' || v_year || '-', ''), '')::int), 0) + 1
    INTO v_seq
    FROM public.manufacturing_orders
   WHERE mo_number LIKE 'MO-' || v_year || '-%';
  RETURN 'MO-' || v_year || '-' || lpad(v_seq::text, 4, '0');
END;
$$;

-- ════════════════════════════════════════════════════════════════════
-- RPC: create_bom
-- ════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.create_bom(
  p_product_id        uuid,
  p_lines             jsonb,            -- [{component_product_id, quantity, unit?, scrap_pct?, position?}]
  p_version           text DEFAULT NULL,
  p_quantity_produced numeric DEFAULT 1,
  p_routing_notes     text DEFAULT NULL,
  p_activate          boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bom_id  uuid;
  v_version text;
  v_line    jsonb;
  v_pos     int := 0;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'writer') OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF p_product_id IS NULL THEN
    RAISE EXCEPTION 'product_id is required';
  END IF;
  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'lines must contain at least one component';
  END IF;

  -- Auto-version: v1, v2, ...
  IF p_version IS NULL OR trim(p_version) = '' THEN
    SELECT 'v' || (COALESCE(COUNT(*), 0) + 1)::text
      INTO v_version
      FROM public.bom_headers WHERE product_id = p_product_id;
  ELSE
    v_version := p_version;
  END IF;

  -- Deactivate other versions if activating this one
  IF p_activate THEN
    UPDATE public.bom_headers SET is_active = false WHERE product_id = p_product_id AND is_active = true;
  END IF;

  INSERT INTO public.bom_headers (product_id, version, is_active, quantity_produced, routing_notes, created_by)
  VALUES (p_product_id, v_version, p_activate, COALESCE(p_quantity_produced, 1), p_routing_notes, auth.uid())
  RETURNING id INTO v_bom_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_pos := v_pos + 1;
    INSERT INTO public.bom_lines (bom_id, component_product_id, quantity, unit, scrap_pct, position)
    VALUES (
      v_bom_id,
      (v_line->>'component_product_id')::uuid,
      (v_line->>'quantity')::numeric,
      v_line->>'unit',
      COALESCE((v_line->>'scrap_pct')::numeric, 0),
      COALESCE((v_line->>'position')::int, v_pos)
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'bom_id', v_bom_id,
    'version', v_version,
    'line_count', jsonb_array_length(p_lines)
  );
END;
$$;

-- ════════════════════════════════════════════════════════════════════
-- RPC: confirm_mo  (snapshot BOM + recompute availability)
-- ════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.confirm_mo(p_mo_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mo         public.manufacturing_orders%ROWTYPE;
  v_bom_id     uuid;
  v_bom_qty    numeric;
  v_factor     numeric;
  v_shortages  jsonb := '[]'::jsonb;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'writer') OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT * INTO v_mo FROM public.manufacturing_orders WHERE id = p_mo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MO % not found', p_mo_id; END IF;

  IF v_mo.status NOT IN ('draft', 'planned') THEN
    -- Idempotent re-check
    PERFORM public.check_mo_availability(p_mo_id);
    RETURN jsonb_build_object('success', true, 'mo_id', p_mo_id, 'status', v_mo.status, 'note', 'already confirmed');
  END IF;

  -- Resolve BOM (use stored bom_id, else active)
  v_bom_id := v_mo.bom_id;
  IF v_bom_id IS NULL THEN
    SELECT id, quantity_produced INTO v_bom_id, v_bom_qty
      FROM public.bom_headers
     WHERE product_id = v_mo.product_id AND is_active = true
     LIMIT 1;
    IF v_bom_id IS NULL THEN
      RAISE EXCEPTION 'No active BOM for product %', v_mo.product_id;
    END IF;
    UPDATE public.manufacturing_orders SET bom_id = v_bom_id WHERE id = p_mo_id;
  ELSE
    SELECT quantity_produced INTO v_bom_qty FROM public.bom_headers WHERE id = v_bom_id;
  END IF;

  v_factor := v_mo.quantity / NULLIF(v_bom_qty, 0);

  -- Snapshot components
  DELETE FROM public.mo_components WHERE mo_id = p_mo_id;
  INSERT INTO public.mo_components (mo_id, component_product_id, qty_required, availability)
  SELECT p_mo_id,
         bl.component_product_id,
         ROUND(bl.quantity * v_factor * (1 + bl.scrap_pct / 100.0), 4),
         'unknown'
    FROM public.bom_lines bl
   WHERE bl.bom_id = v_bom_id;

  UPDATE public.manufacturing_orders
     SET status = 'confirmed', updated_at = now()
   WHERE id = p_mo_id;

  -- Compute availability now
  v_shortages := (public.check_mo_availability(p_mo_id))->'shortages';

  -- Emit event (best-effort; helper exists per memory)
  BEGIN
    PERFORM public.emit_platform_event(
      'mo.confirmed',
      jsonb_build_object('mo_id', p_mo_id, 'shortages', v_shortages),
      'manufacturing'
    );
  EXCEPTION WHEN undefined_function THEN NULL; END;

  RETURN jsonb_build_object(
    'success', true,
    'mo_id', p_mo_id,
    'bom_id', v_bom_id,
    'shortages', v_shortages
  );
END;
$$;

-- ════════════════════════════════════════════════════════════════════
-- RPC: check_mo_availability  (read + cache update)
-- ════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.check_mo_availability(p_mo_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shortages jsonb := '[]'::jsonb;
  v_overall   text := 'ok';
BEGIN
  -- Update per-row availability based on current stock
  WITH stock AS (
    SELECT product_id, COALESCE(quantity_on_hand, 0) AS qty FROM public.product_stock
  ), updated AS (
    UPDATE public.mo_components mc
       SET availability = CASE
                            WHEN COALESCE(s.qty, 0) >= mc.qty_required THEN 'ok'
                            ELSE 'short'
                          END
      FROM (SELECT mc2.id, COALESCE(st.qty, 0) AS qty
              FROM public.mo_components mc2
              LEFT JOIN stock st ON st.product_id = mc2.component_product_id
             WHERE mc2.mo_id = p_mo_id) s
     WHERE mc.id = s.id
     RETURNING mc.component_product_id, mc.qty_required, mc.availability, s.qty AS on_hand
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'component_product_id', component_product_id,
           'qty_required', qty_required,
           'qty_on_hand', on_hand,
           'qty_short', GREATEST(qty_required - on_hand, 0)
         )), '[]'::jsonb)
    INTO v_shortages
    FROM updated WHERE availability = 'short';

  IF jsonb_array_length(v_shortages) > 0 THEN v_overall := 'short'; END IF;

  -- Emit shortage event
  IF v_overall = 'short' THEN
    BEGIN
      PERFORM public.emit_platform_event(
        'mo.shortage_detected',
        jsonb_build_object('mo_id', p_mo_id, 'components', v_shortages),
        'manufacturing'
      );
    EXCEPTION WHEN undefined_function THEN NULL; END;
  END IF;

  RETURN jsonb_build_object('mo_id', p_mo_id, 'overall', v_overall, 'shortages', v_shortages);
END;
$$;

-- ════════════════════════════════════════════════════════════════════
-- RPC: start_mo
-- ════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.start_mo(p_mo_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status public.mo_status;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'writer') OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT status INTO v_status FROM public.manufacturing_orders WHERE id = p_mo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MO % not found', p_mo_id; END IF;

  IF v_status = 'in_progress' THEN
    RETURN jsonb_build_object('success', true, 'mo_id', p_mo_id, 'note', 'already in_progress');
  END IF;
  IF v_status <> 'confirmed' THEN
    RAISE EXCEPTION 'MO must be confirmed before starting (current: %)', v_status;
  END IF;

  UPDATE public.manufacturing_orders
     SET status = 'in_progress', started_at = now(), updated_at = now()
   WHERE id = p_mo_id;

  RETURN jsonb_build_object('success', true, 'mo_id', p_mo_id, 'status', 'in_progress');
END;
$$;

-- ════════════════════════════════════════════════════════════════════
-- RPC: complete_mo  (post stock moves + emit event)
-- ════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.complete_mo(
  p_mo_id      uuid,
  p_actual_qty numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mo         public.manufacturing_orders%ROWTYPE;
  v_qty        numeric;
  v_consumed   int := 0;
  v_comp       record;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'writer') OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT * INTO v_mo FROM public.manufacturing_orders WHERE id = p_mo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MO % not found', p_mo_id; END IF;

  IF v_mo.status = 'done' THEN
    RETURN jsonb_build_object('success', true, 'mo_id', p_mo_id, 'note', 'already done');
  END IF;
  IF v_mo.status <> 'in_progress' THEN
    RAISE EXCEPTION 'MO must be in_progress to complete (current: %)', v_mo.status;
  END IF;

  v_qty := COALESCE(p_actual_qty, v_mo.quantity);

  -- Consume components: post negative stock_moves and decrement product_stock
  FOR v_comp IN SELECT component_product_id, qty_required FROM public.mo_components WHERE mo_id = p_mo_id
  LOOP
    INSERT INTO public.stock_moves (product_id, quantity, move_type, reference_type, reference_id, mo_id, created_by, notes)
    VALUES (v_comp.component_product_id, -CEIL(v_comp.qty_required)::int, 'mo_consumption',
            'manufacturing_order', p_mo_id::text, p_mo_id, auth.uid(),
            'Consumed for MO ' || v_mo.mo_number);

    UPDATE public.product_stock
       SET quantity_on_hand = GREATEST(quantity_on_hand - CEIL(v_comp.qty_required)::int, 0),
           updated_at = now()
     WHERE product_id = v_comp.component_product_id;

    UPDATE public.mo_components SET qty_consumed = v_comp.qty_required
     WHERE mo_id = p_mo_id AND component_product_id = v_comp.component_product_id;

    v_consumed := v_consumed + 1;
  END LOOP;

  -- Produce finished good
  INSERT INTO public.stock_moves (product_id, quantity, move_type, reference_type, reference_id, mo_id, created_by, notes)
  VALUES (v_mo.product_id, CEIL(v_qty)::int, 'mo_production',
          'manufacturing_order', p_mo_id::text, p_mo_id, auth.uid(),
          'Produced by MO ' || v_mo.mo_number);

  INSERT INTO public.product_stock (product_id, quantity_on_hand)
  VALUES (v_mo.product_id, CEIL(v_qty)::int)
  ON CONFLICT (product_id) DO UPDATE
    SET quantity_on_hand = public.product_stock.quantity_on_hand + EXCLUDED.quantity_on_hand,
        updated_at = now();

  UPDATE public.manufacturing_orders
     SET status = 'done', completed_at = now(), updated_at = now()
   WHERE id = p_mo_id;

  -- Emit event
  BEGIN
    PERFORM public.emit_platform_event(
      'mo.completed',
      jsonb_build_object('mo_id', p_mo_id, 'qty_produced', v_qty, 'components_consumed', v_consumed),
      'manufacturing'
    );
  EXCEPTION WHEN undefined_function THEN NULL; END;

  RETURN jsonb_build_object('success', true, 'mo_id', p_mo_id, 'qty_produced', v_qty, 'components_consumed', v_consumed);
END;
$$;

-- ════════════════════════════════════════════════════════════════════
-- RPC: cancel_mo
-- ════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.cancel_mo(p_mo_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status public.mo_status;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'writer') OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT status INTO v_status FROM public.manufacturing_orders WHERE id = p_mo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MO % not found', p_mo_id; END IF;

  IF v_status IN ('done', 'cancelled') THEN
    RETURN jsonb_build_object('success', true, 'mo_id', p_mo_id, 'note', 'already terminal: ' || v_status);
  END IF;

  UPDATE public.manufacturing_orders
     SET status = 'cancelled',
         notes = COALESCE(notes, '') || E'\n[cancelled] ' || COALESCE(p_reason, 'no reason'),
         updated_at = now()
   WHERE id = p_mo_id;

  BEGIN
    PERFORM public.emit_platform_event(
      'mo.cancelled',
      jsonb_build_object('mo_id', p_mo_id, 'reason', p_reason),
      'manufacturing'
    );
  EXCEPTION WHEN undefined_function THEN NULL; END;

  RETURN jsonb_build_object('success', true, 'mo_id', p_mo_id, 'status', 'cancelled');
END;
$$;

-- ════════════════════════════════════════════════════════════════════
-- RPC: trigger_procurement_for_mo
-- Creates draft PO drafts for shorted components. Idempotent: skips
-- components that already have an open PO referencing this MO.
-- ════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.trigger_procurement_for_mo(p_mo_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_short  record;
  v_po_ids jsonb := '[]'::jsonb;
  v_skipped int := 0;
  v_short_qty numeric;
  v_existing uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'writer') OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  -- Make sure availability is fresh
  PERFORM public.check_mo_availability(p_mo_id);

  FOR v_short IN
    SELECT mc.component_product_id, mc.qty_required,
           COALESCE(ps.quantity_on_hand, 0) AS on_hand
      FROM public.mo_components mc
      LEFT JOIN public.product_stock ps ON ps.product_id = mc.component_product_id
     WHERE mc.mo_id = p_mo_id AND mc.availability = 'short'
  LOOP
    v_short_qty := v_short.qty_required - v_short.on_hand;

    -- Skip if an open PO already exists for this MO + component
    SELECT po.id INTO v_existing
      FROM public.purchase_orders po
      JOIN public.purchase_order_lines pol ON pol.po_id = po.id
     WHERE po.source_type = 'manufacturing'
       AND po.source_id = p_mo_id
       AND pol.product_id = v_short.component_product_id
       AND po.status IN ('draft', 'sent', 'confirmed')
     LIMIT 1;

    IF v_existing IS NOT NULL THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- Mark as awaiting_po regardless of whether we can create the PO
    UPDATE public.mo_components
       SET availability = 'awaiting_po'
     WHERE mo_id = p_mo_id AND component_product_id = v_short.component_product_id;

    v_po_ids := v_po_ids || jsonb_build_object(
      'component_product_id', v_short.component_product_id,
      'qty_short', v_short_qty,
      'note', 'PO creation deferred — call create_purchase_order skill with source_type=manufacturing, source_id=' || p_mo_id::text
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'mo_id', p_mo_id,
    'requests', v_po_ids,
    'skipped_existing', v_skipped
  );
END;
$$;

-- Grants
GRANT EXECUTE ON FUNCTION public.create_bom(uuid, jsonb, text, numeric, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_mo(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_mo_availability(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_mo(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_mo(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_mo(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_procurement_for_mo(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_mo_number() TO authenticated;