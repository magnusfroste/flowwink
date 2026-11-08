-- ============================================================================
-- order.paid carries order_id — the key its seeded automation maps.
--
-- 'Auto-allocate picking on order paid' (inventory module) runs
-- allocate_picking with p_order_id = '{{event.payload.order_id}}', but
-- tg_emit_order_events emitted order.paid as { id, data }. event-dispatcher
-- passes an unresolved template through as literal text, so every paid order
-- sent the string "{{event.payload.order_id}}" to a uuid parameter
-- (seen live 2026-11-02: invalid input syntax for type uuid), and the
-- automation's last_error stayed empty because the dispatcher runs it async.
--
-- The fix is the emitter, not the seed: automation seeds are inserted by name
-- and never updated, so a corrected seed would leave every live row broken.
-- With order_id in the payload the existing rows resolve as they stand.
-- order.created gets the same key, so both order events answer one shape.
-- `id` and `data` stay: other automations and receipts read them.
--
-- Guard: src/lib/__tests__/event-automation-templates-resolve.guardrails.test.ts
-- (every seeded {{event.payload.X}} must be a key its event's emitters carry).
-- ============================================================================

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
      jsonb_build_object('id', NEW.id, 'order_id', NEW.id, 'data', to_jsonb(NEW)),
      'orders'
    );
  ELSIF TG_OP = 'UPDATE' THEN
    -- Transition into "paid" via orders.status (there is no payment_status column).
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'paid' THEN
      PERFORM public.emit_platform_event(
        'order.paid',
        jsonb_build_object('id', NEW.id, 'order_id', NEW.id, 'data', to_jsonb(NEW)),
        'orders'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- ── LACKMUS ────────────────────────────────────────────────────────────────
--   BEGIN;
--   UPDATE orders SET status = 'paid' WHERE id = '<unpaid-order-uuid>';
--   SELECT payload->>'order_id' = payload->>'id' AS same, payload ? 'data' AS has_data
--     FROM agent_events WHERE event_name = 'order.paid'
--    ORDER BY created_at DESC LIMIT 1;
--   --  t | t
--   ROLLBACK;
