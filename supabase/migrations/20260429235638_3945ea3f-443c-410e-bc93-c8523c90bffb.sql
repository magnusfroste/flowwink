CREATE OR REPLACE FUNCTION public.log_mo_cancellation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'cancelled' AND (OLD.status IS DISTINCT FROM 'cancelled') THEN
    INSERT INTO public.audit_logs (action, entity_type, entity_id, user_id, metadata)
    VALUES (
      'mo.cancelled',
      'manufacturing_order',
      NEW.id,
      auth.uid(),
      jsonb_build_object(
        'mo_number', NEW.mo_number,
        'product_id', NEW.product_id,
        'previous_status', OLD.status,
        'cancelled_at', COALESCE(NEW.cancelled_at, now()),
        'quantity', NEW.quantity,
        'notes_tail', RIGHT(COALESCE(NEW.notes, ''), 500)
      )
    );
  ELSIF NEW.status = 'done' AND (OLD.status IS DISTINCT FROM 'done') THEN
    INSERT INTO public.audit_logs (action, entity_type, entity_id, user_id, metadata)
    VALUES (
      'mo.completed',
      'manufacturing_order',
      NEW.id,
      auth.uid(),
      jsonb_build_object(
        'mo_number', NEW.mo_number,
        'product_id', NEW.product_id,
        'previous_status', OLD.status,
        'completed_at', COALESCE(NEW.completed_at, now()),
        'quantity', NEW.quantity
      )
    );
  END IF;
  RETURN NEW;
END;
$$;