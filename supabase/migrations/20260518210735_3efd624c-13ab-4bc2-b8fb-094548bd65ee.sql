-- Accounting Nivå 1
ALTER TABLE public.agent_skills ADD COLUMN IF NOT EXISTS requires_staging boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.pending_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id uuid REFERENCES public.agent_skills(id) ON DELETE SET NULL,
  skill_name text NOT NULL,
  args jsonb NOT NULL DEFAULT '{}'::jsonb,
  preview jsonb NOT NULL DEFAULT '{}'::jsonb,
  risk_level text NOT NULL DEFAULT 'medium' CHECK (risk_level IN ('low','medium','high')),
  period_status text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','executed','failed','expired')),
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_agent text,
  conversation_id uuid,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  rejection_reason text,
  executed_at timestamptz,
  execution_result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days')
);
CREATE INDEX IF NOT EXISTS idx_pending_ops_status ON public.pending_operations(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pending_ops_skill ON public.pending_operations(skill_name);
ALTER TABLE public.pending_operations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage pending ops" ON public.pending_operations;
CREATE POLICY "Admins manage pending ops" ON public.pending_operations FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Auth read own pending ops" ON public.pending_operations;
CREATE POLICY "Auth read own pending ops" ON public.pending_operations FOR SELECT TO authenticated
  USING (created_by_user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));
DROP TRIGGER IF EXISTS trg_pending_ops_updated ON public.pending_operations;
CREATE TRIGGER trg_pending_ops_updated BEFORE UPDATE ON public.pending_operations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS voucher_series text,
  ADD COLUMN IF NOT EXISTS voucher_number bigint,
  ADD COLUMN IF NOT EXISTS voucher_year int;
CREATE UNIQUE INDEX IF NOT EXISTS uq_voucher_series_year_number
  ON public.journal_entries(voucher_series, voucher_year, voucher_number)
  WHERE voucher_series IS NOT NULL AND voucher_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_voucher_lookup
  ON public.journal_entries(voucher_year, voucher_series, voucher_number);

CREATE OR REPLACE FUNCTION public.assign_voucher_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_series text; v_year int; v_next bigint;
BEGIN
  IF NEW.voucher_number IS NOT NULL AND NEW.voucher_series IS NOT NULL THEN RETURN NEW; END IF;
  v_year := EXTRACT(YEAR FROM NEW.entry_date)::int;
  NEW.voucher_year := v_year;
  IF NEW.voucher_series IS NULL THEN
    SELECT COALESCE(j.sequence_prefix, j.code, 'GEN') INTO v_series
      FROM public.journals j WHERE j.id = NEW.journal_id;
    NEW.voucher_series := COALESCE(v_series, 'GEN');
  END IF;
  IF NEW.voucher_number IS NULL THEN
    SELECT COALESCE(MAX(voucher_number), 0) + 1 INTO v_next
      FROM public.journal_entries
      WHERE voucher_series = NEW.voucher_series AND voucher_year = v_year;
    NEW.voucher_number := v_next;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_assign_voucher_number ON public.journal_entries;
CREATE TRIGGER trg_assign_voucher_number BEFORE INSERT ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.assign_voucher_number();

DO $$ DECLARE r record; BEGIN
  FOR r IN
    SELECT je.id, je.entry_date, COALESCE(j.sequence_prefix, j.code, 'GEN') AS series
    FROM public.journal_entries je
    LEFT JOIN public.journals j ON j.id = je.journal_id
    WHERE je.voucher_number IS NULL
    ORDER BY je.entry_date, je.created_at
  LOOP
    UPDATE public.journal_entries
    SET voucher_series = r.series,
        voucher_year = EXTRACT(YEAR FROM r.entry_date)::int,
        voucher_number = (SELECT COALESCE(MAX(voucher_number), 0) + 1
          FROM public.journal_entries
          WHERE voucher_series = r.series AND voucher_year = EXTRACT(YEAR FROM r.entry_date)::int)
    WHERE id = r.id;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.list_voucher_gaps(
  p_year int DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::int,
  p_series text DEFAULT NULL
) RETURNS TABLE(
  series text, fiscal_year int, expected_number bigint, next_existing_number bigint, gap_size bigint, last_seen_date date
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH seq AS (
    SELECT voucher_series, voucher_year, voucher_number, entry_date,
           LEAD(voucher_number) OVER (PARTITION BY voucher_series, voucher_year ORDER BY voucher_number) AS next_num
    FROM public.journal_entries
    WHERE voucher_year = p_year AND voucher_number IS NOT NULL
      AND (p_series IS NULL OR voucher_series = p_series)
  )
  SELECT voucher_series, voucher_year, voucher_number + 1, next_num,
         (next_num - voucher_number - 1), entry_date
  FROM seq
  WHERE next_num IS NOT NULL AND next_num > voucher_number + 1
  ORDER BY voucher_series, voucher_number;
$$;
REVOKE ALL ON FUNCTION public.list_voucher_gaps(int, text) FROM public;
GRANT EXECUTE ON FUNCTION public.list_voucher_gaps(int, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.explain_voucher_gap(p_series text, p_year int, p_voucher_number bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_clues jsonb;
BEGIN
  SELECT jsonb_agg(jsonb_build_object('action', action, 'entity_type', entity_type, 'user_id', user_id, 'metadata', metadata, 'created_at', created_at) ORDER BY created_at DESC)
  INTO v_clues FROM public.audit_logs
  WHERE entity_type IN ('journal_entry','journal_entries','voucher')
    AND (metadata->>'voucher_number' = p_voucher_number::text OR metadata->>'voucher_series' = p_series);
  RETURN jsonb_build_object(
    'series', p_series, 'fiscal_year', p_year, 'voucher_number', p_voucher_number,
    'audit_clues', COALESCE(v_clues, '[]'::jsonb),
    'explanation', CASE WHEN v_clues IS NULL THEN 'No audit trail found — gap likely caused by failed transaction. Investigate before period close.' ELSE 'Audit trail shows related events.' END
  );
END; $$;
REVOKE ALL ON FUNCTION public.explain_voucher_gap(text, int, bigint) FROM public;
GRANT EXECUTE ON FUNCTION public.explain_voucher_gap(text, int, bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.year_end_readiness(p_year int DEFAULT (EXTRACT(YEAR FROM CURRENT_DATE)::int - 1))
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_periods_open int; v_draft_entries int; v_voucher_gaps int; v_unreconciled int; v_unpaid_invoices int; v_open_expenses int; v_checks jsonb;
BEGIN
  SELECT COUNT(*) INTO v_periods_open FROM public.accounting_periods WHERE fiscal_year = p_year AND status <> 'closed';
  SELECT COUNT(*) INTO v_draft_entries FROM public.journal_entries WHERE EXTRACT(YEAR FROM entry_date)::int = p_year AND status = 'draft';
  SELECT COUNT(*) INTO v_voucher_gaps FROM public.list_voucher_gaps(p_year, NULL);
  BEGIN EXECUTE 'SELECT COUNT(*) FROM public.payment_reconciliations WHERE status = ''pending'' AND EXTRACT(YEAR FROM created_at)::int <= $1' INTO v_unreconciled USING p_year;
  EXCEPTION WHEN OTHERS THEN v_unreconciled := NULL; END;
  BEGIN EXECUTE 'SELECT COUNT(*) FROM public.invoices WHERE status IN (''sent'',''overdue'') AND EXTRACT(YEAR FROM issue_date)::int <= $1' INTO v_unpaid_invoices USING p_year;
  EXCEPTION WHEN OTHERS THEN v_unpaid_invoices := NULL; END;
  BEGIN EXECUTE 'SELECT COUNT(*) FROM public.expense_reports WHERE status NOT IN (''paid'',''rejected'') AND EXTRACT(YEAR FROM report_date)::int <= $1' INTO v_open_expenses USING p_year;
  EXCEPTION WHEN OTHERS THEN v_open_expenses := NULL; END;
  v_checks := jsonb_build_array(
    jsonb_build_object('id','periods_closed','label','All 12 periods closed','pass', v_periods_open = 0, 'detail', v_periods_open || ' periods still open'),
    jsonb_build_object('id','no_drafts','label','No draft journal entries','pass', v_draft_entries = 0, 'detail', v_draft_entries || ' draft entries remain'),
    jsonb_build_object('id','voucher_integrity','label','No voucher-number gaps','pass', v_voucher_gaps = 0, 'detail', v_voucher_gaps || ' gaps found'),
    jsonb_build_object('id','reconciliations','label','No pending reconciliations','pass', COALESCE(v_unreconciled,0) = 0, 'detail', COALESCE(v_unreconciled::text,'n/a')),
    jsonb_build_object('id','invoices_settled','label','No unpaid customer invoices','pass', COALESCE(v_unpaid_invoices,0) = 0, 'detail', COALESCE(v_unpaid_invoices::text,'n/a')),
    jsonb_build_object('id','expenses_settled','label','No open expense reports','pass', COALESCE(v_open_expenses,0) = 0, 'detail', COALESCE(v_open_expenses::text,'n/a'))
  );
  RETURN jsonb_build_object('fiscal_year', p_year,
    'ready', NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_checks) c WHERE (c->>'pass')::boolean = false),
    'checks', v_checks, 'generated_at', now());
END; $$;
REVOKE ALL ON FUNCTION public.year_end_readiness(int) FROM public;
GRANT EXECUTE ON FUNCTION public.year_end_readiness(int) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_pending_operation(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_op record;
BEGIN
  SELECT * INTO v_op FROM public.pending_operations WHERE id = p_id;
  IF v_op IS NULL THEN RETURN jsonb_build_object('error', 'pending operation not found'); END IF;
  IF v_op.status <> 'pending' THEN RETURN jsonb_build_object('error', 'operation already ' || v_op.status); END IF;
  UPDATE public.pending_operations SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now() WHERE id = p_id;
  RETURN jsonb_build_object('approved', true, 'id', p_id, 'skill_name', v_op.skill_name,
    'next', 'Re-invoke the skill with the same args plus _approved_operation_id="' || p_id || '" to execute.');
END; $$;
REVOKE ALL ON FUNCTION public.approve_pending_operation(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.approve_pending_operation(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_pending_operation(p_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.pending_operations SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), rejection_reason = p_reason
    WHERE id = p_id AND status = 'pending';
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'operation not pending or not found'); END IF;
  RETURN jsonb_build_object('rejected', true, 'id', p_id, 'reason', p_reason);
END; $$;
REVOKE ALL ON FUNCTION public.reject_pending_operation(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.reject_pending_operation(uuid, text) TO authenticated;

INSERT INTO public.agent_skills (name, description, category, scope, handler, mcp_exposed, enabled, trust_level, tool_definition)
VALUES
  ('list_voucher_gaps',
   'Detect gaps in voucher-number sequences per series and fiscal year. Use when: closing a period, verifying audit integrity. NOT for: listing all entries.',
   'system', 'internal', 'rpc:list_voucher_gaps', true, true, 'auto',
   '{"type":"object","properties":{"p_year":{"type":"integer"},"p_series":{"type":["string","null"]}}}'::jsonb),
  ('explain_voucher_gap',
   'Look up audit_logs for clues about a missing voucher number. Use when: list_voucher_gaps returned a gap and root cause is needed.',
   'system', 'internal', 'rpc:explain_voucher_gap', true, true, 'auto',
   '{"type":"object","required":["p_series","p_year","p_voucher_number"],"properties":{"p_series":{"type":"string"},"p_year":{"type":"integer"},"p_voucher_number":{"type":"integer"}}}'::jsonb),
  ('year_end_readiness',
   'Year-end checklist: periods closed, no drafts, no voucher gaps, reconciliations done, invoices/expenses settled. Use when: preparing annual close.',
   'system', 'internal', 'rpc:year_end_readiness', true, true, 'auto',
   '{"type":"object","properties":{"p_year":{"type":"integer","description":"Defaults to previous calendar year"}}}'::jsonb),
  ('approve_pending_operation',
   'Approve a staged operation so it can be executed. Use when: a previous skill call returned staged=true and the preview is acceptable.',
   'system', 'internal', 'rpc:approve_pending_operation', true, true, 'auto',
   '{"type":"object","required":["p_id"],"properties":{"p_id":{"type":"string","format":"uuid"}}}'::jsonb),
  ('reject_pending_operation',
   'Reject a staged operation with a reason. Use when: preview from a staged skill call is wrong or unsafe.',
   'system', 'internal', 'rpc:reject_pending_operation', true, true, 'auto',
   '{"type":"object","required":["p_id"],"properties":{"p_id":{"type":"string","format":"uuid"},"p_reason":{"type":"string"}}}'::jsonb),
  ('list_pending_operations',
   'List pending staged operations awaiting approval/rejection. Use when: agent or admin needs to see the queue.',
   'system', 'internal', 'db:pending_operations', true, true, 'auto',
   '{"type":"object","properties":{"action":{"type":"string","enum":["list"],"default":"list"},"status":{"type":"string"},"limit":{"type":"integer","default":50}}}'::jsonb)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description, handler = EXCLUDED.handler, tool_definition = EXCLUDED.tool_definition,
  mcp_exposed = true, enabled = true, updated_at = now();

UPDATE public.agent_skills SET requires_staging = true
WHERE name IN ('record_journal_entry','create_journal_entry','book_expense','mark_expense_paid','close_accounting_period','close_pos_session_v2','record_accounting_correction');