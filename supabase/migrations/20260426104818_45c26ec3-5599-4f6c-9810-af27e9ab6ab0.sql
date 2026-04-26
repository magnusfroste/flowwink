-- =============================================================================
-- Phase 3: Platform Event Bus
-- =============================================================================

-- 1. Event log table
CREATE TABLE IF NOT EXISTS public.agent_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_name TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  source TEXT NOT NULL DEFAULT 'platform',
  processed_at TIMESTAMPTZ,
  processed_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_events_unprocessed
  ON public.agent_events (created_at)
  WHERE processed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_agent_events_name
  ON public.agent_events (event_name, created_at DESC);

ALTER TABLE public.agent_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view all agent events" ON public.agent_events;
CREATE POLICY "Admins can view all agent events"
  ON public.agent_events
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- 2. Helper function to emit events from anywhere (edge functions, triggers)
CREATE OR REPLACE FUNCTION public.emit_platform_event(
  _event_name TEXT,
  _payload JSONB DEFAULT '{}'::jsonb,
  _source TEXT DEFAULT 'platform'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id UUID;
BEGIN
  INSERT INTO public.agent_events (event_name, payload, source)
  VALUES (_event_name, COALESCE(_payload, '{}'::jsonb), COALESCE(_source, 'platform'))
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

-- 3. Generic trigger functions for canonical events
CREATE OR REPLACE FUNCTION public.tg_emit_lead_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.emit_platform_event(
    'lead.created',
    jsonb_build_object('id', NEW.id, 'data', to_jsonb(NEW)),
    'leads'
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_emit_order_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.emit_platform_event(
      'order.created',
      jsonb_build_object('id', NEW.id, 'data', to_jsonb(NEW)),
      'orders'
    );
  ELSIF TG_OP = 'UPDATE' THEN
    -- Detect payment transition to "paid"
    IF NEW.payment_status IS DISTINCT FROM OLD.payment_status
       AND NEW.payment_status = 'paid' THEN
      PERFORM public.emit_platform_event(
        'order.paid',
        jsonb_build_object('id', NEW.id, 'data', to_jsonb(NEW)),
        'orders'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_emit_deal_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.stage IS DISTINCT FROM OLD.stage AND NEW.stage = 'won' THEN
    PERFORM public.emit_platform_event(
      'deal.won',
      jsonb_build_object('id', NEW.id, 'data', to_jsonb(NEW)),
      'deals'
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_emit_ticket_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.emit_platform_event(
    'ticket.created',
    jsonb_build_object('id', NEW.id, 'data', to_jsonb(NEW)),
    'tickets'
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_emit_booking_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.emit_platform_event(
    'booking.created',
    jsonb_build_object('id', NEW.id, 'data', to_jsonb(NEW)),
    'bookings'
  );
  RETURN NEW;
END;
$$;

-- 4. Attach triggers (idempotent)
DROP TRIGGER IF EXISTS trg_emit_lead_created ON public.leads;
CREATE TRIGGER trg_emit_lead_created
  AFTER INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.tg_emit_lead_created();

DROP TRIGGER IF EXISTS trg_emit_order_events ON public.orders;
CREATE TRIGGER trg_emit_order_events
  AFTER INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_emit_order_events();

DROP TRIGGER IF EXISTS trg_emit_deal_events ON public.deals;
CREATE TRIGGER trg_emit_deal_events
  AFTER UPDATE ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.tg_emit_deal_events();

DROP TRIGGER IF EXISTS trg_emit_ticket_created ON public.tickets;
CREATE TRIGGER trg_emit_ticket_created
  AFTER INSERT ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.tg_emit_ticket_created();

DROP TRIGGER IF EXISTS trg_emit_booking_created ON public.bookings;
CREATE TRIGGER trg_emit_booking_created
  AFTER INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.tg_emit_booking_created();