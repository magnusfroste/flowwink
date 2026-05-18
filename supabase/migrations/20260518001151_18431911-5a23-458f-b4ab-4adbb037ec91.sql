
CREATE OR REPLACE FUNCTION public.tg_emit_order_events()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.emit_platform_event(
      'order.created',
      jsonb_build_object('id', NEW.id, 'data', to_jsonb(NEW)),
      'orders'
    );
  ELSIF TG_OP = 'UPDATE' THEN
    -- Detect transition into "paid" via the orders.status column (no payment_status column exists).
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'paid' THEN
      PERFORM public.emit_platform_event(
        'order.paid',
        jsonb_build_object('id', NEW.id, 'data', to_jsonb(NEW)),
        'orders'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tr_orders_emit_paid()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Kept for backwards compatibility, but tg_emit_order_events already covers this.
  -- Uses real columns (status, total_cents, customer_email) so it never explodes.
  IF NEW.status = 'paid' AND (OLD.status IS DISTINCT FROM 'paid') THEN
    BEGIN
      PERFORM public.emit_platform_event(
        'order.paid.legacy',
        jsonb_build_object(
          'order_id', NEW.id,
          'total_cents', NEW.total_cents,
          'currency', NEW.currency,
          'customer_email', NEW.customer_email
        ),
        'orders'
      );
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
  RETURN NEW;
END;
$function$;
