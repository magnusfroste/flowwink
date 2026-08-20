-- Two dunnings, one table name — and the loser failed only when it mattered.
--
-- dunning_actions belongs to SUBSCRIPTION dunning: (sequence_id, step_number,
-- action_type ∈ {email_sent, escalated, paused, …}), FK to dunning_sequences.
-- The INVOICE reminder sweep, send_dunning_reminders(), wrote a completely
-- different shape into the same table — (invoice_id, step_name, status,
-- executed_at) — columns that no longer exist there.
--
-- The failure mode is the nasty kind: p_dry_run => true skips the INSERT
-- entirely, so the preview returned a clean, plausible list of overdue invoices
-- and every rehearsal passed. The first real run raised on the missing column,
-- the whole function rolled back, and the sent→overdue status flips it had just
-- made went with it. A reminder run that reports nothing, changes nothing, and
-- looks like it worked in dry-run.
--
-- Name-collision rule: a domain noun already in use is a permanent collision.
-- The subscription table keeps the name it earned; the NEW writer gets the
-- qualified one. invoice_dunning_actions is the invoice flow's own ledger.

CREATE TABLE IF NOT EXISTS public.invoice_dunning_actions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id    uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  step_name     text NOT NULL,
  action_type   text NOT NULL DEFAULT 'email',
  status        text NOT NULL DEFAULT 'sent',
  days_overdue  integer,
  recipient_email text,
  error_message text,
  executed_at   timestamptz NOT NULL DEFAULT now(),
  -- The day the reminder went out, as its own column: timestamptz::date is
  -- STABLE (it depends on TimeZone), so it cannot carry a unique index — and
  -- the once-per-day rule has to be enforced by the database, not by a check
  -- the caller might skip.
  executed_on   date NOT NULL DEFAULT CURRENT_DATE,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.invoice_dunning_actions
  ADD COLUMN IF NOT EXISTS executed_on date NOT NULL DEFAULT CURRENT_DATE;

COMMENT ON TABLE public.invoice_dunning_actions IS
  'Reminder ledger for INVOICE dunning (send_dunning_reminders). Separate from dunning_actions, which belongs to subscription failed-payment sequences — same domain noun, different documents, permanently different shapes.';

CREATE INDEX IF NOT EXISTS idx_invoice_dunning_actions_invoice
  ON public.invoice_dunning_actions (invoice_id, executed_at DESC);

-- The sweep's idempotency key: one action per invoice per step per day.
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_dunning_actions_step_per_day
  ON public.invoice_dunning_actions (invoice_id, step_name, executed_on);

ALTER TABLE public.invoice_dunning_actions ENABLE ROW LEVEL SECURITY;

-- Mirrors dunning_actions' boundary: admin manages, accounting reads,
-- service-role (FlowPilot / cron / edge) is unrestricted.
DROP POLICY IF EXISTS "Admins can manage invoice dunning actions" ON public.invoice_dunning_actions;
CREATE POLICY "Admins can manage invoice dunning actions"
  ON public.invoice_dunning_actions FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Accounting can read invoice dunning actions" ON public.invoice_dunning_actions;
CREATE POLICY "Accounting can read invoice dunning actions"
  ON public.invoice_dunning_actions FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accounting'::app_role));

DROP POLICY IF EXISTS "Service role full access on invoice_dunning_actions" ON public.invoice_dunning_actions;
CREATE POLICY "Service role full access on invoice_dunning_actions"
  ON public.invoice_dunning_actions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_dunning_actions TO authenticated, service_role;

-- Adopt whatever the old code managed to write before the shape diverged, so
-- an instance that once had the compatible columns keeps its reminder history.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'dunning_actions' AND column_name = 'invoice_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'dunning_actions' AND column_name = 'step_name'
  ) THEN
    EXECUTE $mig$
      INSERT INTO public.invoice_dunning_actions (invoice_id, step_name, action_type, status, executed_at, executed_on, metadata)
      SELECT da.invoice_id, da.step_name, COALESCE(da.action_type, 'email'), 'sent',
             COALESCE(da.executed_at, da.created_at, now()),
             COALESCE(da.executed_at, da.created_at, now())::date, COALESCE(da.metadata, '{}'::jsonb)
        FROM public.dunning_actions da
       WHERE da.invoice_id IS NOT NULL
      ON CONFLICT DO NOTHING
    $mig$;
  END IF;
END $$;

-- ── send_dunning_reminders now writes to its own ledger ──────────────────────
CREATE OR REPLACE FUNCTION public.send_dunning_reminders(p_dry_run boolean DEFAULT false)
RETURNS TABLE(invoice_id uuid, invoice_number text, customer_email text, days_overdue integer, dunning_step text, total_cents bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_inv RECORD; v_step TEXT; v_days INTEGER;
BEGIN
  IF NOT (auth.role() = 'service_role'
          OR has_role(auth.uid(), 'admin'::public.app_role)
          OR has_role(auth.uid(), 'approver'::public.app_role)) THEN
    RAISE EXCEPTION 'Only admins/approvers can send dunning reminders';
  END IF;

  FOR v_inv IN
    SELECT i.id, i.invoice_number, i.customer_email, i.due_date, i.total_cents, i.status
    FROM public.invoices i
    WHERE i.status IN ('sent', 'overdue') AND i.due_date < CURRENT_DATE AND i.paid_at IS NULL
    ORDER BY i.due_date ASC
  LOOP
    v_days := (CURRENT_DATE - v_inv.due_date)::INTEGER;
    v_step := CASE
      WHEN v_days >= 30 THEN 'final_notice'
      WHEN v_days >= 14 THEN 'formal_reminder'
      WHEN v_days >= 7  THEN 'friendly_reminder'
      ELSE 'pre_reminder' END;

    IF NOT p_dry_run THEN
      UPDATE public.invoices SET status = 'overdue', updated_at = now()
      WHERE id = v_inv.id AND status = 'sent';

      -- Idempotent per invoice per step per day (unique index backs this up,
      -- so two concurrent runs cannot double-remind either).
      INSERT INTO public.invoice_dunning_actions
        (invoice_id, step_name, action_type, status, days_overdue, recipient_email, executed_at, executed_on, metadata)
      VALUES
        (v_inv.id, v_step, 'email', 'sent', v_days, v_inv.customer_email, now(), CURRENT_DATE,
         jsonb_build_object('days_overdue', v_days, 'auto', true))
      ON CONFLICT DO NOTHING;
    END IF;

    invoice_id := v_inv.id;
    invoice_number := v_inv.invoice_number;
    customer_email := v_inv.customer_email;
    days_overdue := v_days;
    dunning_step := v_step;
    total_cents := v_inv.total_cents;
    RETURN NEXT;
  END LOOP;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.send_dunning_reminders(boolean) TO authenticated, service_role;
