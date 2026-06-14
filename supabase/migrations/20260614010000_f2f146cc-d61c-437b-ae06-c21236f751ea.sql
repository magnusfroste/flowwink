-- Field Service: parts inventory deduction
-- (docs/parity/capabilities/field-service.json#parts_inventory_deduction).
-- When a service order is completed, its MATERIAL lines should draw stock down —
-- today they don't. Extend the existing emit_service_order_event trigger so that,
-- on completion, every material line with a product_id emits a stock.movement event
-- (negative quantity), the same channel POS uses. The stock module's listener does
-- the actual quant decrement. All prior behavior (created/completed/scheduled
-- events) is preserved. Idempotent CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION "public"."emit_service_order_event"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_line RECORD;
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
      -- Deduct consumed parts: one stock.movement per material line with a product.
      -- Only on the unfulfilled→completed transition (status changed to completed),
      -- so re-saving a completed order does not double-deduct.
      FOR v_line IN
        SELECT product_id, quantity, description
        FROM public.service_order_lines
        WHERE service_order_id = NEW.id AND kind = 'material' AND product_id IS NOT NULL
      LOOP
        PERFORM public.emit_platform_event(
          'stock.movement',
          jsonb_build_object(
            'product_id', v_line.product_id,
            'quantity', -(v_line.quantity),
            'reason', 'field_service',
            'reference_type', 'service_order',
            'reference_id', NEW.id,
            'description', v_line.description
          ),
          'service_orders');
      END LOOP;
    ELSIF NEW.status = 'scheduled' THEN
      PERFORM public.emit_platform_event('service_order.scheduled',
        jsonb_build_object('id', NEW.id, 'order_number', NEW.order_number, 'scheduled_start', NEW.scheduled_start),
        'service_orders');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."emit_service_order_event"() OWNER TO "postgres";
