
-- Purchasing parity: PO change orders, vendor rating, invoice dispute/credit memo

-- 1) PO change-order revisions ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.purchase_order_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  revision_number integer NOT NULL,
  reason text,
  snapshot jsonb NOT NULL,
  prev_total_cents bigint,
  new_total_cents bigint,
  amount_delta_cents bigint,
  approval_request_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT purchase_order_revisions_unique UNIQUE (purchase_order_id, revision_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_order_revisions TO authenticated;
GRANT ALL ON public.purchase_order_revisions TO service_role;
ALTER TABLE public.purchase_order_revisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read PO revisions" ON public.purchase_order_revisions;
CREATE POLICY "Authenticated read PO revisions" ON public.purchase_order_revisions
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated write PO revisions" ON public.purchase_order_revisions;
CREATE POLICY "Authenticated write PO revisions" ON public.purchase_order_revisions
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_po_revisions_po ON public.purchase_order_revisions(purchase_order_id, revision_number DESC);

-- 2) Vendor rating (manual override + notes) --------------------------------
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS manual_rating numeric CHECK (manual_rating IS NULL OR (manual_rating >= 0 AND manual_rating <= 5)),
  ADD COLUMN IF NOT EXISTS rating_notes text;

-- Aggregated scorecard view (best-effort, tolerant to missing history)
CREATE OR REPLACE VIEW public.v_vendor_scorecard AS
WITH po AS (
  SELECT vendor_id, id, expected_delivery, status, total_cents
  FROM public.purchase_orders
),
receipts AS (
  SELECT gr.purchase_order_id, min(gr.received_date) AS first_received
  FROM public.goods_receipts gr
  GROUP BY gr.purchase_order_id
),
combined AS (
  SELECT po.vendor_id,
         po.id AS po_id,
         po.expected_delivery,
         r.first_received,
         CASE
           WHEN po.expected_delivery IS NOT NULL AND r.first_received IS NOT NULL
             AND r.first_received <= po.expected_delivery THEN 1
           WHEN po.expected_delivery IS NOT NULL AND r.first_received IS NOT NULL
             AND r.first_received > po.expected_delivery THEN 0
           ELSE NULL
         END AS on_time_flag
  FROM po
  LEFT JOIN receipts r ON r.purchase_order_id = po.id
),
invoices AS (
  SELECT vi.vendor_id,
         count(*) FILTER (WHERE vi.match_status IN ('over_invoiced','under_invoiced')) AS variance_invoices,
         count(*) AS total_invoices
  FROM public.vendor_invoices vi
  GROUP BY vi.vendor_id
)
SELECT
  v.id AS vendor_id,
  v.name,
  v.manual_rating,
  (SELECT count(*) FROM combined c WHERE c.vendor_id = v.id) AS po_count,
  (SELECT count(*) FROM combined c WHERE c.vendor_id = v.id AND c.on_time_flag IS NOT NULL) AS delivered_count,
  (SELECT count(*) FROM combined c WHERE c.vendor_id = v.id AND c.on_time_flag = 1) AS on_time_count,
  CASE
    WHEN (SELECT count(*) FROM combined c WHERE c.vendor_id = v.id AND c.on_time_flag IS NOT NULL) > 0
      THEN round(100.0 * (SELECT count(*) FROM combined c WHERE c.vendor_id = v.id AND c.on_time_flag = 1)::numeric
             / (SELECT count(*) FROM combined c WHERE c.vendor_id = v.id AND c.on_time_flag IS NOT NULL), 1)
    ELSE NULL
  END AS on_time_pct,
  COALESCE((SELECT total_invoices FROM invoices i WHERE i.vendor_id = v.id), 0) AS invoice_count,
  COALESCE((SELECT variance_invoices FROM invoices i WHERE i.vendor_id = v.id), 0) AS variance_invoice_count,
  CASE
    WHEN COALESCE((SELECT total_invoices FROM invoices i WHERE i.vendor_id = v.id), 0) > 0
      THEN round(100.0 * COALESCE((SELECT variance_invoices FROM invoices i WHERE i.vendor_id = v.id), 0)::numeric
             / (SELECT total_invoices FROM invoices i WHERE i.vendor_id = v.id), 1)
    ELSE NULL
  END AS variance_pct,
  v.rating_notes,
  v.is_active
FROM public.vendors v;

GRANT SELECT ON public.v_vendor_scorecard TO authenticated, service_role;

-- 3) Vendor invoice disputes -----------------------------------------------
CREATE TABLE IF NOT EXISTS public.vendor_invoice_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_invoice_id uuid NOT NULL REFERENCES public.vendor_invoices(id) ON DELETE CASCADE,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  disputed_amount_cents bigint,
  resolution text,
  opened_by uuid,
  opened_at timestamptz NOT NULL DEFAULT now(),
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_invoice_disputes TO authenticated;
GRANT ALL ON public.vendor_invoice_disputes TO service_role;
ALTER TABLE public.vendor_invoice_disputes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated manage disputes" ON public.vendor_invoice_disputes;
CREATE POLICY "Authenticated manage disputes" ON public.vendor_invoice_disputes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_vendor_disputes_invoice ON public.vendor_invoice_disputes(vendor_invoice_id);
CREATE INDEX IF NOT EXISTS idx_vendor_disputes_status ON public.vendor_invoice_disputes(status);

-- 4) Vendor credit memos ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vendor_credit_memos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_number text NOT NULL,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id),
  vendor_invoice_id uuid REFERENCES public.vendor_invoices(id) ON DELETE SET NULL,
  dispute_id uuid REFERENCES public.vendor_invoice_disputes(id) ON DELETE SET NULL,
  credit_date date NOT NULL DEFAULT current_date,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  currency text NOT NULL DEFAULT 'SEK',
  reason text,
  status text NOT NULL DEFAULT 'issued',
  applied_at timestamptz,
  journal_entry_id uuid,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendor_credit_memos_number_unique UNIQUE (credit_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_credit_memos TO authenticated;
GRANT ALL ON public.vendor_credit_memos TO service_role;
ALTER TABLE public.vendor_credit_memos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated manage credit memos" ON public.vendor_credit_memos;
CREATE POLICY "Authenticated manage credit memos" ON public.vendor_credit_memos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_credit_memos_vendor ON public.vendor_credit_memos(vendor_id);
CREATE INDEX IF NOT EXISTS idx_credit_memos_invoice ON public.vendor_credit_memos(vendor_invoice_id);

-- updated_at triggers ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_touch_disputes ON public.vendor_invoice_disputes;
CREATE TRIGGER trg_touch_disputes BEFORE UPDATE ON public.vendor_invoice_disputes
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_credit_memos ON public.vendor_credit_memos;
CREATE TRIGGER trg_touch_credit_memos BEFORE UPDATE ON public.vendor_credit_memos
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
