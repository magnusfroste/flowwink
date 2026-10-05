-- Ramavtalet och avropen — blanket purchase agreements and call-offs.
--
-- Odoo's Purchase Agreements (blanket order): a vendor commits to a price for
-- an agreed quantity over a period; the buyer calls goods off it as separate
-- purchase orders. FlowWink had every PO priced and quantified on its own, so
-- "we agreed 500 at 42,00 for the year" lived in a note and nothing stopped
-- the 501st, or the 43,00 price on the next order.
--
-- One truth for "how much is left": the call-off lines themselves. An
-- agreement line stores what was AGREED; what was called is the sum of
-- purchase-order lines pointing at it on orders that are not cancelled. A
-- cancelled call-off releases its quantity by construction — no counter to
-- forget to decrement. The guard sits on purchase_order_lines, so a call-off
-- edited after the fact (update_purchase_order, amend) is held to the same
-- ceiling as one created through call_off_purchase_agreement.

CREATE SEQUENCE IF NOT EXISTS public.purchase_agreement_seq;

CREATE TABLE IF NOT EXISTS public.purchase_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_number text NOT NULL UNIQUE
    DEFAULT ('BPA-' || lpad(nextval('public.purchase_agreement_seq')::text, 5, '0')),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'closed', 'cancelled')),
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  currency text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT purchase_agreements_period CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS public.purchase_agreement_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id uuid NOT NULL REFERENCES public.purchase_agreements(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  description text NOT NULL,
  agreed_quantity integer NOT NULL CHECK (agreed_quantity > 0),
  unit_price_cents bigint NOT NULL CHECK (unit_price_cents >= 0),
  tax_rate numeric(5,2) NOT NULL DEFAULT 25.00,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS purchase_agreements_vendor ON public.purchase_agreements (vendor_id, status);
CREATE INDEX IF NOT EXISTS purchase_agreement_lines_agreement ON public.purchase_agreement_lines (agreement_id);

ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS agreement_id uuid
  REFERENCES public.purchase_agreements(id) ON DELETE SET NULL;
ALTER TABLE public.purchase_order_lines ADD COLUMN IF NOT EXISTS agreement_line_id uuid
  REFERENCES public.purchase_agreement_lines(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS purchase_order_lines_agreement_line
  ON public.purchase_order_lines (agreement_line_id) WHERE agreement_line_id IS NOT NULL;
COMMENT ON COLUMN public.purchase_orders.agreement_id IS 'The blanket agreement this order calls off (purchase_agreements.id)';

DROP TRIGGER IF EXISTS update_purchase_agreements_updated_at ON public.purchase_agreements;
CREATE TRIGGER update_purchase_agreements_updated_at BEFORE UPDATE ON public.purchase_agreements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.purchase_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_agreement_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Purchasing module manages agreements" ON public.purchase_agreements;
CREATE POLICY "Purchasing module manages agreements" ON public.purchase_agreements
  FOR ALL TO authenticated
  USING (can_access_module(auth.uid(), 'purchasing'))
  WITH CHECK (can_access_module(auth.uid(), 'purchasing'));

DROP POLICY IF EXISTS "Purchasing module manages agreement lines" ON public.purchase_agreement_lines;
CREATE POLICY "Purchasing module manages agreement lines" ON public.purchase_agreement_lines
  FOR ALL TO authenticated
  USING (can_access_module(auth.uid(), 'purchasing'))
  WITH CHECK (can_access_module(auth.uid(), 'purchasing'));

REVOKE ALL ON public.purchase_agreements, public.purchase_agreement_lines FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_agreements, public.purchase_agreement_lines TO authenticated, service_role;
GRANT USAGE ON SEQUENCE public.purchase_agreement_seq TO authenticated, service_role;

-- What has been called off a line: purchase-order lines on orders that still count.
CREATE OR REPLACE FUNCTION public.purchase_agreement_line_called(p_line_id uuid, p_exclude_po_line uuid DEFAULT NULL)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(SUM(pol.quantity), 0)::integer
    FROM purchase_order_lines pol
    JOIN purchase_orders po ON po.id = pol.purchase_order_id
   WHERE pol.agreement_line_id = p_line_id
     AND po.status <> 'cancelled'
     AND (p_exclude_po_line IS NULL OR pol.id <> p_exclude_po_line);
$$;

-- The ceiling, on the table: no path past it, whoever writes the line.
CREATE OR REPLACE FUNCTION public.guard_purchase_agreement_call_off()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agreed integer; v_status text; v_number text; v_called integer;
BEGIN
  IF NEW.agreement_line_id IS NULL THEN RETURN NEW; END IF;

  SELECT l.agreed_quantity, a.status, a.agreement_number
    INTO v_agreed, v_status, v_number
    FROM purchase_agreement_lines l JOIN purchase_agreements a ON a.id = l.agreement_id
   WHERE l.id = NEW.agreement_line_id
   FOR UPDATE OF l;
  IF NOT FOUND THEN RAISE EXCEPTION 'agreement line % not found', NEW.agreement_line_id; END IF;

  -- A new call-off needs a live agreement; an existing call-off may still be
  -- edited downwards after the agreement closes.
  IF TG_OP = 'INSERT' AND v_status <> 'active' THEN
    RAISE EXCEPTION 'Agreement % is %; only an active agreement can be called off', v_number, v_status;
  END IF;

  v_called := public.purchase_agreement_line_called(NEW.agreement_line_id, CASE WHEN TG_OP = 'UPDATE' THEN NEW.id END);
  IF v_called + COALESCE(NEW.quantity, 0) > v_agreed THEN
    RAISE EXCEPTION 'Call-off exceeds agreement %: % agreed, % already called, % requested (remaining %)',
      v_number, v_agreed, v_called, NEW.quantity, GREATEST(v_agreed - v_called, 0);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_purchase_agreement_call_off ON public.purchase_order_lines;
CREATE TRIGGER trg_guard_purchase_agreement_call_off
  BEFORE INSERT OR UPDATE OF quantity, agreement_line_id ON public.purchase_order_lines
  FOR EACH ROW EXECUTE FUNCTION public.guard_purchase_agreement_call_off();
REVOKE EXECUTE ON FUNCTION public.guard_purchase_agreement_call_off() FROM PUBLIC, anon, authenticated;

-- One agreement with its lines and progress, the shape both the UI and the agent read.
CREATE OR REPLACE FUNCTION public.purchase_agreement_snapshot(p_agreement_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'agreement', to_jsonb(a) || jsonb_build_object('vendor_name', v.name),
    'lines', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
          'id', l.id, 'product_id', l.product_id, 'description', l.description,
          'agreed_quantity', l.agreed_quantity, 'unit_price_cents', l.unit_price_cents, 'tax_rate', l.tax_rate,
          'called_quantity', c.called,
          'remaining_quantity', GREATEST(l.agreed_quantity - c.called, 0),
          'received_quantity', c.received)
        ORDER BY l.created_at)
        FROM purchase_agreement_lines l
        CROSS JOIN LATERAL (
          SELECT COALESCE(SUM(pol.quantity), 0)::int AS called,
                 COALESCE(SUM(pol.received_quantity), 0)::int AS received
            FROM purchase_order_lines pol JOIN purchase_orders po ON po.id = pol.purchase_order_id
           WHERE pol.agreement_line_id = l.id AND po.status <> 'cancelled') c
       WHERE l.agreement_id = a.id), '[]'::jsonb),
    'call_offs', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', po.id, 'po_number', po.po_number, 'status', po.status,
               'order_date', po.order_date, 'total_cents', po.total_cents) ORDER BY po.created_at)
        FROM purchase_orders po WHERE po.agreement_id = a.id), '[]'::jsonb))
  FROM purchase_agreements a LEFT JOIN vendors v ON v.id = a.vendor_id
  WHERE a.id = p_agreement_id;
$$;
REVOKE EXECUTE ON FUNCTION public.purchase_agreement_snapshot(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purchase_agreement_snapshot(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.manage_purchase_agreement(
  p_action text,
  p_agreement_id uuid DEFAULT NULL,
  p_vendor_id uuid DEFAULT NULL,
  p_lines jsonb DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_currency text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_product_id uuid DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_quantity integer DEFAULT NULL,
  p_unit_price_cents bigint DEFAULT NULL,
  p_tax_rate numeric DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_writer boolean := (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'purchasing'));
  v_id uuid; v_status text; v_line jsonb; v_count int := 0; v_out jsonb; v_calls int;
BEGIN
  IF p_action NOT IN ('create','add_line','activate','close','cancel','get','list') THEN
    RAISE EXCEPTION 'action must be one of create, add_line, activate, close, cancel, get, list';
  END IF;
  IF NOT v_writer THEN
    RAISE EXCEPTION 'Requires the purchasing module — an admin can grant it under Users → Role Permissions';
  END IF;

  IF p_action = 'create' THEN
    IF p_vendor_id IS NULL THEN RAISE EXCEPTION 'vendor_id is required (look it up with manage_vendor action:list)'; END IF;
    INSERT INTO purchase_agreements (vendor_id, start_date, end_date, currency, notes, created_by)
    VALUES (p_vendor_id, COALESCE(p_start_date, CURRENT_DATE), p_end_date, upper(NULLIF(p_currency, '')), p_notes, auth.uid())
    RETURNING id INTO v_id;
    IF p_lines IS NOT NULL AND jsonb_typeof(p_lines) = 'array' THEN
      FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
        PERFORM public.manage_purchase_agreement('add_line', v_id,
          p_product_id := NULLIF(v_line->>'product_id', '')::uuid,
          p_description := v_line->>'description',
          p_quantity := (v_line->>'quantity')::integer,
          p_unit_price_cents := (v_line->>'unit_price_cents')::bigint,
          p_tax_rate := (v_line->>'tax_rate')::numeric);
        v_count := v_count + 1;
      END LOOP;
    END IF;
    RETURN jsonb_build_object('success', true, 'agreement_id', v_id,
      'agreement_number', (SELECT agreement_number FROM purchase_agreements WHERE id = v_id),
      'status', 'draft', 'lines', v_count);

  ELSIF p_action = 'add_line' THEN
    IF p_agreement_id IS NULL OR COALESCE(p_quantity, 0) <= 0 OR p_unit_price_cents IS NULL THEN
      RAISE EXCEPTION 'agreement_id, a positive quantity and unit_price_cents are required for each line';
    END IF;
    SELECT status INTO v_status FROM purchase_agreements WHERE id = p_agreement_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'agreement_not_found'; END IF;
    IF v_status <> 'draft' THEN
      RAISE EXCEPTION 'Agreement is %; lines can only be added while it is a draft', v_status;
    END IF;
    IF p_product_id IS NULL AND NULLIF(trim(p_description), '') IS NULL THEN
      RAISE EXCEPTION 'each line needs a product_id or a description';
    END IF;
    INSERT INTO purchase_agreement_lines (agreement_id, product_id, description, agreed_quantity, unit_price_cents, tax_rate)
    VALUES (p_agreement_id, p_product_id,
            COALESCE(NULLIF(trim(p_description), ''), (SELECT name FROM products WHERE id = p_product_id), 'Line'),
            p_quantity, p_unit_price_cents, COALESCE(p_tax_rate, 25))
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('success', true, 'line_id', v_id);

  ELSIF p_action IN ('activate','close','cancel') THEN
    SELECT status INTO v_status FROM purchase_agreements WHERE id = p_agreement_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'agreement_not_found'; END IF;
    IF p_action = 'activate' THEN
      IF v_status <> 'draft' THEN RAISE EXCEPTION 'Only a draft agreement can be activated (it is %)', v_status; END IF;
      IF NOT EXISTS (SELECT 1 FROM purchase_agreement_lines WHERE agreement_id = p_agreement_id) THEN
        RAISE EXCEPTION 'An agreement needs at least one line before it is activated';
      END IF;
      UPDATE purchase_agreements SET status = 'active' WHERE id = p_agreement_id;
    ELSIF p_action = 'close' THEN
      IF v_status <> 'active' THEN RAISE EXCEPTION 'Only an active agreement can be closed (it is %)', v_status; END IF;
      UPDATE purchase_agreements SET status = 'closed' WHERE id = p_agreement_id;
    ELSE
      SELECT count(*) INTO v_calls FROM purchase_orders WHERE agreement_id = p_agreement_id AND status <> 'cancelled';
      IF v_status NOT IN ('draft','active') OR v_calls > 0 THEN
        RAISE EXCEPTION 'Only a draft, or an active agreement with no live call-offs, can be cancelled — close it instead';
      END IF;
      UPDATE purchase_agreements SET status = 'cancelled' WHERE id = p_agreement_id;
    END IF;
    RETURN public.purchase_agreement_snapshot(p_agreement_id);

  ELSIF p_action = 'get' THEN
    v_out := public.purchase_agreement_snapshot(p_agreement_id);
    IF v_out IS NULL THEN RAISE EXCEPTION 'agreement_not_found'; END IF;
    RETURN v_out;

  ELSE -- list
    SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'created_at') DESC), '[]'::jsonb) INTO v_out FROM (
      SELECT jsonb_build_object('id', a.id, 'agreement_number', a.agreement_number, 'status', a.status,
        'vendor_id', a.vendor_id, 'vendor_name', v.name, 'start_date', a.start_date, 'end_date', a.end_date,
        'created_at', a.created_at,
        'agreed_quantity', (SELECT COALESCE(SUM(agreed_quantity), 0) FROM purchase_agreement_lines l WHERE l.agreement_id = a.id),
        'called_quantity', (SELECT COALESCE(SUM(pol.quantity), 0) FROM purchase_order_lines pol
                              JOIN purchase_orders po ON po.id = pol.purchase_order_id
                              JOIN purchase_agreement_lines l ON l.id = pol.agreement_line_id
                             WHERE l.agreement_id = a.id AND po.status <> 'cancelled')) AS x
      FROM purchase_agreements a LEFT JOIN vendors v ON v.id = a.vendor_id
      WHERE (p_status IS NULL OR a.status = p_status)
        AND (p_vendor_id IS NULL OR a.vendor_id = p_vendor_id)
      ORDER BY a.created_at DESC
      LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200)
    ) s;
    RETURN jsonb_build_object('agreements', v_out);
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.manage_purchase_agreement(text, uuid, uuid, jsonb, date, date, text, text, uuid, text, integer, bigint, numeric, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_purchase_agreement(text, uuid, uuid, jsonb, date, date, text, text, uuid, text, integer, bigint, numeric, text, integer) TO authenticated, service_role;

-- A call-off: a draft purchase order at the agreement's price, its lines tied
-- to the agreement lines they consume. Atomic — the order exists only with
-- all its lines, and the line guard refuses anything past the agreed quantity.
CREATE OR REPLACE FUNCTION public.call_off_purchase_agreement(
  p_agreement_id uuid,
  p_lines jsonb,
  p_expected_delivery date DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a purchase_agreements%ROWTYPE;
  v_line jsonb; v_al purchase_agreement_lines%ROWTYPE;
  v_po uuid; v_qty integer; v_sub bigint := 0; v_tax bigint := 0; v_n int := 0;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'purchasing')) THEN
    RAISE EXCEPTION 'Requires the purchasing module — an admin can grant it under Users → Role Permissions';
  END IF;
  SELECT * INTO v_a FROM purchase_agreements WHERE id = p_agreement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'agreement_not_found'; END IF;
  IF v_a.status <> 'active' THEN
    RAISE EXCEPTION 'Agreement % is %; only an active agreement can be called off', v_a.agreement_number, v_a.status;
  END IF;
  IF CURRENT_DATE < v_a.start_date OR (v_a.end_date IS NOT NULL AND CURRENT_DATE > v_a.end_date) THEN
    RAISE EXCEPTION 'Agreement % runs % – %; today is outside its period',
      v_a.agreement_number, v_a.start_date, COALESCE(v_a.end_date::text, 'open');
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'lines is required: [{agreement_line_id, quantity}]';
  END IF;

  -- currency NULL → the FX trigger takes the vendor's own and stamps the rate.
  INSERT INTO purchase_orders (vendor_id, status, order_date, expected_delivery, notes, currency,
                               subtotal_cents, tax_cents, total_cents, agreement_id, source_type, source_id, created_by)
  VALUES (v_a.vendor_id, 'draft', CURRENT_DATE, p_expected_delivery,
          COALESCE(p_notes, 'Call-off from ' || v_a.agreement_number), v_a.currency,
          0, 0, 0, v_a.id, 'agreement', v_a.id, auth.uid())
  RETURNING id INTO v_po;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_qty := (v_line->>'quantity')::integer;
    IF COALESCE(v_qty, 0) <= 0 THEN RAISE EXCEPTION 'each call-off line needs a positive quantity'; END IF;
    SELECT * INTO v_al FROM purchase_agreement_lines
     WHERE id = NULLIF(v_line->>'agreement_line_id', '')::uuid AND agreement_id = v_a.id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'agreement_line_id % is not a line of %', v_line->>'agreement_line_id', v_a.agreement_number;
    END IF;
    INSERT INTO purchase_order_lines (purchase_order_id, product_id, description, quantity,
                                      unit_price_cents, tax_rate, total_cents, agreement_line_id)
    VALUES (v_po, v_al.product_id, v_al.description, v_qty, v_al.unit_price_cents, v_al.tax_rate,
            v_qty * v_al.unit_price_cents, v_al.id);
    v_sub := v_sub + v_qty * v_al.unit_price_cents;
    v_tax := v_tax + round(v_qty * v_al.unit_price_cents * v_al.tax_rate / 100);
    v_n := v_n + 1;
  END LOOP;

  UPDATE purchase_orders SET subtotal_cents = v_sub, tax_cents = v_tax, total_cents = v_sub + v_tax WHERE id = v_po;

  RETURN jsonb_build_object('success', true, 'purchase_order_id', v_po,
    'po_number', (SELECT po_number FROM purchase_orders WHERE id = v_po),
    'status', 'draft', 'lines', v_n, 'total_cents', v_sub + v_tax,
    'agreement', public.purchase_agreement_snapshot(v_a.id));
END $$;

REVOKE ALL ON FUNCTION public.call_off_purchase_agreement(uuid, jsonb, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.call_off_purchase_agreement(uuid, jsonb, date, text) TO authenticated, service_role;
