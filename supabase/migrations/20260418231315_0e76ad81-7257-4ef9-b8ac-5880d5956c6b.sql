-- =============================================
-- Approvals Module — Generic Approval Engine
-- =============================================

-- ── Enums ──
DO $$ BEGIN
  CREATE TYPE public.approval_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.approval_decision_kind AS ENUM ('approve', 'reject');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── approval_rules ──
CREATE TABLE IF NOT EXISTS public.approval_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  entity_type TEXT NOT NULL,                 -- e.g. 'expense_report', 'purchase_order', 'invoice', 'quote'
  amount_threshold_cents BIGINT,             -- NULL = always require approval
  currency TEXT NOT NULL DEFAULT 'SEK',
  required_role public.app_role NOT NULL DEFAULT 'admin',
  is_active BOOLEAN NOT NULL DEFAULT true,
  priority INT NOT NULL DEFAULT 100,         -- lower priority = evaluated first
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

CREATE INDEX IF NOT EXISTS idx_approval_rules_entity ON public.approval_rules(entity_type, is_active, priority);

-- ── approval_requests ──
CREATE TABLE IF NOT EXISTS public.approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID REFERENCES public.approval_rules(id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,                   -- TEXT to support non-UUID IDs (e.g. report periods)
  amount_cents BIGINT,
  currency TEXT NOT NULL DEFAULT 'SEK',
  reason TEXT,
  status public.approval_status NOT NULL DEFAULT 'pending',
  required_role public.app_role NOT NULL DEFAULT 'admin',
  requested_by UUID,
  resolved_by UUID,
  resolved_at TIMESTAMPTZ,
  context JSONB DEFAULT '{}'::jsonb,         -- arbitrary metadata (e.g. PO line items, expense breakdown)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approval_requests_entity ON public.approval_requests(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON public.approval_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_approval_requests_requested_by ON public.approval_requests(requested_by);

-- ── approval_decisions (audit trail) ──
CREATE TABLE IF NOT EXISTS public.approval_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.approval_requests(id) ON DELETE CASCADE,
  decision public.approval_decision_kind NOT NULL,
  decided_by UUID NOT NULL,
  decided_role public.app_role NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approval_decisions_request ON public.approval_decisions(request_id);

-- ── updated_at triggers ──
DROP TRIGGER IF EXISTS update_approval_rules_updated_at ON public.approval_rules;
CREATE TRIGGER update_approval_rules_updated_at
  BEFORE UPDATE ON public.approval_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS update_approval_requests_updated_at ON public.approval_requests;
CREATE TRIGGER update_approval_requests_updated_at
  BEFORE UPDATE ON public.approval_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ── RLS ──
ALTER TABLE public.approval_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_decisions ENABLE ROW LEVEL SECURITY;

-- approval_rules: only admins manage
DROP POLICY IF EXISTS "Admins manage approval rules" ON public.approval_rules;
CREATE POLICY "Admins manage approval rules"
  ON public.approval_rules
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Authenticated read approval rules" ON public.approval_rules;
CREATE POLICY "Authenticated read approval rules"
  ON public.approval_rules
  FOR SELECT
  TO authenticated
  USING (true);

-- approval_requests
DROP POLICY IF EXISTS "Authenticated read approval requests" ON public.approval_requests;
CREATE POLICY "Authenticated read approval requests"
  ON public.approval_requests
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated create approval requests" ON public.approval_requests;
CREATE POLICY "Authenticated create approval requests"
  ON public.approval_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Approvers update approval requests" ON public.approval_requests;
CREATE POLICY "Approvers update approval requests"
  ON public.approval_requests
  FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), required_role)
    OR requested_by = auth.uid()
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), required_role)
    OR requested_by = auth.uid()
  );

DROP POLICY IF EXISTS "Admins delete approval requests" ON public.approval_requests;
CREATE POLICY "Admins delete approval requests"
  ON public.approval_requests
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- approval_decisions: audit-only — insert by approvers, read by all authed
DROP POLICY IF EXISTS "Authenticated read decisions" ON public.approval_decisions;
CREATE POLICY "Authenticated read decisions"
  ON public.approval_decisions
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Approvers insert decisions" ON public.approval_decisions;
CREATE POLICY "Approvers insert decisions"
  ON public.approval_decisions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    decided_by = auth.uid()
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), decided_role)
    )
  );

-- ── Helper RPC: evaluate_approval_required ──
-- Returns the matching rule (if any) for an entity_type + amount.
CREATE OR REPLACE FUNCTION public.evaluate_approval_required(
  p_entity_type TEXT,
  p_amount_cents BIGINT DEFAULT NULL,
  p_currency TEXT DEFAULT 'SEK'
)
RETURNS TABLE (
  rule_id UUID,
  required_role public.app_role,
  rule_name TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, required_role, name
  FROM public.approval_rules
  WHERE is_active = true
    AND entity_type = p_entity_type
    AND currency = p_currency
    AND (
      amount_threshold_cents IS NULL
      OR (p_amount_cents IS NOT NULL AND p_amount_cents >= amount_threshold_cents)
    )
  ORDER BY priority ASC, amount_threshold_cents DESC NULLS LAST
  LIMIT 1;
$$;

-- ── Helper RPC: resolve_approval (atomic decide + audit) ──
CREATE OR REPLACE FUNCTION public.resolve_approval(
  p_request_id UUID,
  p_decision public.approval_decision_kind,
  p_comment TEXT DEFAULT NULL
)
RETURNS public.approval_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.approval_requests;
  v_user_role public.app_role;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_request FROM public.approval_requests WHERE id = p_request_id FOR UPDATE;
  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'Approval request not found';
  END IF;
  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'Request already resolved (status: %)', v_request.status;
  END IF;

  -- Permission check
  IF NOT (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), v_request.required_role)
  ) THEN
    RAISE EXCEPTION 'Insufficient permissions to resolve this approval (need %)', v_request.required_role;
  END IF;

  v_user_role := CASE
    WHEN public.has_role(auth.uid(), 'admin') THEN 'admin'::public.app_role
    ELSE v_request.required_role
  END;

  UPDATE public.approval_requests
  SET status = CASE p_decision WHEN 'approve' THEN 'approved'::public.approval_status ELSE 'rejected'::public.approval_status END,
      resolved_by = auth.uid(),
      resolved_at = now()
  WHERE id = p_request_id
  RETURNING * INTO v_request;

  INSERT INTO public.approval_decisions (request_id, decision, decided_by, decided_role, comment)
  VALUES (p_request_id, p_decision, auth.uid(), v_user_role, p_comment);

  RETURN v_request;
END;
$$;

-- ── Seed: a few starter rules for SMB ──
INSERT INTO public.approval_rules (name, description, entity_type, amount_threshold_cents, currency, required_role, priority)
VALUES
  ('Expense report > 5 000 SEK', 'Monthly expense reports above 5 000 SEK require admin approval', 'expense_report', 500000, 'SEK', 'admin', 100),
  ('Purchase order > 10 000 SEK', 'Purchase orders above 10 000 SEK require admin approval', 'purchase_order', 1000000, 'SEK', 'admin', 100),
  ('Invoice > 50 000 SEK', 'Outgoing invoices above 50 000 SEK require admin approval before sending', 'invoice', 5000000, 'SEK', 'admin', 100),
  ('Quote > 25 000 SEK', 'Quotes above 25 000 SEK require admin approval before sending to customer', 'quote', 2500000, 'SEK', 'admin', 100)
ON CONFLICT DO NOTHING;