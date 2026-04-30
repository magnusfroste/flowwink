-- ── Field Service tables ──

CREATE TABLE IF NOT EXISTS public.service_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text UNIQUE,
  title text NOT NULL,
  description text,
  customer_name text NOT NULL,
  customer_email text,
  customer_phone text,
  service_address text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','in_progress','completed','invoiced','cancelled')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  requested_date date,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  completed_at timestamptz,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  deal_id uuid,
  project_id uuid,
  contract_id uuid,
  invoice_id uuid,
  total_amount numeric(12,2) DEFAULT 0,
  currency text DEFAULT 'SEK',
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_orders_status ON public.service_orders(status);
CREATE INDEX IF NOT EXISTS idx_service_orders_assigned ON public.service_orders(assigned_to);
CREATE INDEX IF NOT EXISTS idx_service_orders_scheduled ON public.service_orders(scheduled_start);

CREATE TABLE IF NOT EXISTS public.service_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id uuid NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'labor' CHECK (kind IN ('labor','material','expense','other')),
  description text NOT NULL,
  quantity numeric(12,3) NOT NULL DEFAULT 1,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  product_id uuid,
  total numeric(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  position integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_order_lines_order ON public.service_order_lines(service_order_id);

CREATE TABLE IF NOT EXISTS public.service_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id uuid NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  technician_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  scheduled_start timestamptz NOT NULL,
  scheduled_end timestamptz NOT NULL,
  actual_start timestamptz,
  actual_end timestamptz,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','in_progress','done','no_show','cancelled')),
  calendar_event_id uuid,
  technician_notes text,
  signature_url text,
  signed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_visits_order ON public.service_visits(service_order_id);
CREATE INDEX IF NOT EXISTS idx_service_visits_tech ON public.service_visits(technician_id);
CREATE INDEX IF NOT EXISTS idx_service_visits_start ON public.service_visits(scheduled_start);

-- ── Order number generator ──
CREATE OR REPLACE FUNCTION public.generate_service_order_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_seq int;
BEGIN
  IF NEW.order_number IS NULL THEN
    SELECT COALESCE(MAX(NULLIF(regexp_replace(order_number, '\D', '', 'g'), '')::int), 0) + 1
      INTO next_seq
    FROM public.service_orders
    WHERE order_number LIKE 'SO-%';
    NEW.order_number := 'SO-' || lpad(next_seq::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS service_orders_set_number ON public.service_orders;
CREATE TRIGGER service_orders_set_number
BEFORE INSERT ON public.service_orders
FOR EACH ROW EXECUTE FUNCTION public.generate_service_order_number();

-- ── Updated-at triggers ──
DROP TRIGGER IF EXISTS service_orders_updated_at ON public.service_orders;
CREATE TRIGGER service_orders_updated_at
BEFORE UPDATE ON public.service_orders
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS service_visits_updated_at ON public.service_visits;
CREATE TRIGGER service_visits_updated_at
BEFORE UPDATE ON public.service_visits
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Total recompute trigger ──
CREATE OR REPLACE FUNCTION public.recompute_service_order_total()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
BEGIN
  v_order_id := COALESCE(NEW.service_order_id, OLD.service_order_id);
  UPDATE public.service_orders
     SET total_amount = COALESCE((SELECT SUM(total) FROM public.service_order_lines WHERE service_order_id = v_order_id), 0),
         updated_at = now()
   WHERE id = v_order_id;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS service_order_lines_recompute ON public.service_order_lines;
CREATE TRIGGER service_order_lines_recompute
AFTER INSERT OR UPDATE OR DELETE ON public.service_order_lines
FOR EACH ROW EXECUTE FUNCTION public.recompute_service_order_total();

-- ── Platform event on completion ──
CREATE OR REPLACE FUNCTION public.emit_service_order_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.emit_platform_event('service_order.created',
      jsonb_build_object('id', NEW.id, 'order_number', NEW.order_number, 'customer_name', NEW.customer_name, 'priority', NEW.priority),
      'service_orders');
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'completed' THEN
      PERFORM public.emit_platform_event('service_order.completed',
        jsonb_build_object('id', NEW.id, 'order_number', NEW.order_number, 'customer_name', NEW.customer_name, 'customer_email', NEW.customer_email, 'total_amount', NEW.total_amount),
        'service_orders');
    ELSIF NEW.status = 'scheduled' THEN
      PERFORM public.emit_platform_event('service_order.scheduled',
        jsonb_build_object('id', NEW.id, 'order_number', NEW.order_number, 'scheduled_start', NEW.scheduled_start),
        'service_orders');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS service_orders_emit_event ON public.service_orders;
CREATE TRIGGER service_orders_emit_event
AFTER INSERT OR UPDATE ON public.service_orders
FOR EACH ROW EXECUTE FUNCTION public.emit_service_order_event();

-- ── RLS ──
ALTER TABLE public.service_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_orders_admin_all ON public.service_orders;
CREATE POLICY service_orders_admin_all ON public.service_orders
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'sales'::app_role) OR has_role(auth.uid(), 'support'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'sales'::app_role) OR has_role(auth.uid(), 'support'::app_role));

DROP POLICY IF EXISTS service_orders_assigned_view ON public.service_orders;
CREATE POLICY service_orders_assigned_view ON public.service_orders
  FOR SELECT TO authenticated
  USING (assigned_to = auth.uid());

DROP POLICY IF EXISTS service_order_lines_admin_all ON public.service_order_lines;
CREATE POLICY service_order_lines_admin_all ON public.service_order_lines
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'sales'::app_role) OR has_role(auth.uid(), 'support'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'sales'::app_role) OR has_role(auth.uid(), 'support'::app_role));

DROP POLICY IF EXISTS service_visits_admin_all ON public.service_visits;
CREATE POLICY service_visits_admin_all ON public.service_visits
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'sales'::app_role) OR has_role(auth.uid(), 'support'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'sales'::app_role) OR has_role(auth.uid(), 'support'::app_role));

DROP POLICY IF EXISTS service_visits_tech_view ON public.service_visits;
CREATE POLICY service_visits_tech_view ON public.service_visits
  FOR SELECT TO authenticated
  USING (technician_id = auth.uid());

DROP POLICY IF EXISTS service_visits_tech_update ON public.service_visits;
CREATE POLICY service_visits_tech_update ON public.service_visits
  FOR UPDATE TO authenticated
  USING (technician_id = auth.uid())
  WITH CHECK (technician_id = auth.uid());

-- ── SECURITY DEFINER RPC: complete_service_order (also bumps invoice link if generated) ──
CREATE OR REPLACE FUNCTION public.complete_service_order(_order_id uuid, _completion_notes text DEFAULT NULL)
RETURNS public.service_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.service_orders;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'sales'::app_role) OR has_role(auth.uid(), 'support'::app_role)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.service_orders
     SET status = 'completed',
         completed_at = now(),
         notes = COALESCE(notes, '') || CASE WHEN _completion_notes IS NULL THEN '' ELSE E'\n[completion] ' || _completion_notes END,
         updated_at = now()
   WHERE id = _order_id
   RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'service_order_not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_service_order(uuid, text) TO authenticated;