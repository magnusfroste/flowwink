-- Add cancelled_at to manufacturing_orders for clear timeline rendering
ALTER TABLE public.manufacturing_orders
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE;

-- Backfill cancelled_at for existing cancelled MOs (best-effort using updated_at)
UPDATE public.manufacturing_orders
   SET cancelled_at = updated_at
 WHERE status = 'cancelled' AND cancelled_at IS NULL;

-- Update cancel_mo to stamp cancelled_at
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
         cancelled_at = now(),
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

GRANT EXECUTE ON FUNCTION public.cancel_mo(uuid, text) TO authenticated;