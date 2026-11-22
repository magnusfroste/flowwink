-- The survey goes out when it happens (2026-11-22).
--
-- A survey campaign can be set to go out "when an order is delivered", "when a
-- ticket is closed", "after a completed booking", "when a contract renews" or
-- "when a deal is won" — and nothing sent it: five of the six triggers were
-- events the platform never raised, and nothing listened for the sixth. The
-- CSAT sweep asked for a trigger ('ticket_resolved') the table refuses.
--
-- Three parts:
--   1. the events are raised where the state already changes: booking.completed,
--      order.delivered / order.cancelled / order.refunded, ticket.closed,
--      invoice.sent, contract.renewed;
--   2. queue_event_surveys(event, entity) finds the active campaigns on that
--      event, the customer behind the record, and queues one send each —
--      send_after = now() + the campaign's delay, never twice for the same
--      campaign and record;
--   3. work_probe_due_surveys() tells the sweep (send_due_surveys) when a
--      queued send is due.
-- Idempotent.

-- 1a. Orders: delivered, cancelled, refunded beside created and paid.
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
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'paid' THEN
      PERFORM public.emit_platform_event(
        'order.paid',
        jsonb_build_object('id', NEW.id, 'order_id', NEW.id, 'data', to_jsonb(NEW)),
        'orders'
      );
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('cancelled', 'refunded') THEN
      PERFORM public.emit_platform_event(
        'order.' || NEW.status,
        jsonb_build_object('id', NEW.id, 'order_id', NEW.id, 'data', to_jsonb(NEW)),
        'orders'
      );
    END IF;
    IF NEW.fulfillment_status IS DISTINCT FROM OLD.fulfillment_status AND NEW.fulfillment_status = 'delivered' THEN
      PERFORM public.emit_platform_event(
        'order.delivered',
        jsonb_build_object('id', NEW.id, 'order_id', NEW.id, 'data', to_jsonb(NEW)),
        'orders'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- 1b. Bookings: completed beside confirmed and cancelled.
CREATE OR REPLACE FUNCTION public.tg_emit_booking_status_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tz text;
  v_offered integer := 0;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;

  IF NEW.status = 'confirmed' THEN
    PERFORM public.emit_platform_event('booking.confirmed', jsonb_build_object('id', NEW.id, 'data', to_jsonb(NEW)), 'bookings');
  ELSIF NEW.status = 'completed' THEN
    PERFORM public.emit_platform_event('booking.completed', jsonb_build_object('id', NEW.id, 'data', to_jsonb(NEW)), 'bookings');
  ELSIF NEW.status = 'cancelled' THEN
    PERFORM public.emit_platform_event('booking.cancelled', jsonb_build_object('id', NEW.id, 'data', to_jsonb(NEW)), 'bookings');

    IF NEW.start_time > now() THEN
      v_tz := public.platform_timezone();
      UPDATE booking_waitlist w SET status = 'offered', offered_at = now()
       WHERE w.status = 'waiting'
         AND w.service_id IS NOT DISTINCT FROM NEW.service_id
         AND w.desired_date = (NEW.start_time AT TIME ZONE v_tz)::date;
      GET DIAGNOSTICS v_offered = ROW_COUNT;
      IF v_offered > 0 THEN
        PERFORM public.emit_platform_event('booking.waitlist_slot_opened', jsonb_build_object(
          'service_id', NEW.service_id, 'date', (NEW.start_time AT TIME ZONE v_tz)::date,
          'opened_start_time', NEW.start_time, 'offered_count', v_offered), 'bookings');
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- 1c. Tickets: closed (resolved has its own trigger).
CREATE OR REPLACE FUNCTION public.tg_emit_ticket_closed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'closed' AND OLD.status IS DISTINCT FROM 'closed' THEN
    PERFORM public.emit_platform_event(
      'ticket.closed',
      jsonb_build_object('id', NEW.id, 'ticket_id', NEW.id, 'contact_email', NEW.contact_email, 'lead_id', NEW.lead_id),
      'tickets'
    );
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_emit_ticket_closed ON public.tickets;
CREATE TRIGGER trg_emit_ticket_closed AFTER UPDATE OF status ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.tg_emit_ticket_closed();

-- 1d. Invoices: sent, the moment a draft is issued.
CREATE OR REPLACE FUNCTION public.tg_emit_invoice_sent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.status = 'draft' AND NEW.status = 'sent' THEN
    PERFORM public.emit_platform_event(
      'invoice.sent',
      jsonb_build_object('id', NEW.id, 'invoice_id', NEW.id, 'invoice_number', NEW.invoice_number),
      'invoices'
    );
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_emit_invoice_sent ON public.invoices;
CREATE TRIGGER trg_emit_invoice_sent AFTER UPDATE OF status ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.tg_emit_invoice_sent();

-- 1e. Contracts: renewed, when the renewal is decided.
CREATE OR REPLACE FUNCTION public.tg_emit_contract_renewed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.renewal_decision = 'renew' AND OLD.renewal_decision IS DISTINCT FROM 'renew' THEN
    PERFORM public.emit_platform_event(
      'contract.renewed',
      jsonb_build_object('id', NEW.id, 'contract_id', NEW.id, 'title', NEW.title),
      'contracts'
    );
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_emit_contract_renewed ON public.contracts;
CREATE TRIGGER trg_emit_contract_renewed AFTER UPDATE OF renewal_decision ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.tg_emit_contract_renewed();

REVOKE ALL ON FUNCTION public.tg_emit_ticket_closed() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_emit_invoice_sent() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_emit_contract_renewed() FROM PUBLIC, anon, authenticated;

-- 2. The campaign may also go out on a resolved ticket (most cases are
--    resolved, few are closed).
DO $$
BEGIN
  ALTER TABLE public.survey_campaigns DROP CONSTRAINT IF EXISTS survey_campaigns_trigger_check;
  ALTER TABLE public.survey_campaigns ADD CONSTRAINT survey_campaigns_trigger_check
    CHECK (trigger = ANY (ARRAY['manual', 'order.delivered', 'order.paid', 'ticket.closed', 'ticket.resolved',
                                'contract.renewed', 'booking.completed', 'deal.won']));
END $$;

ALTER TABLE public.survey_sends ADD COLUMN IF NOT EXISTS send_after timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS survey_sends_once_per_record
  ON public.survey_sends (campaign_id, related_entity_type, related_entity_id)
  WHERE related_entity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS survey_sends_due
  ON public.survey_sends (send_after) WHERE sent_at IS NULL AND send_after IS NOT NULL;

-- 2b. Queue the surveys an event asks for.
CREATE OR REPLACE FUNCTION public.queue_event_surveys(p_event text, p_entity_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_type text := split_part(p_event, '.', 1);
  v_email text;
  v_name text;
  v_lead uuid;
  v_campaign record;
  v_queued integer := 0;
  v_skipped integer := 0;
BEGIN
  IF p_event IS NULL OR p_entity_id IS NULL THEN
    RETURN jsonb_build_object('queued', 0, 'note', 'event and entity are required');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM survey_campaigns WHERE trigger = p_event AND is_active) THEN
    RETURN jsonb_build_object('queued', 0, 'note', 'no active campaign on ' || p_event);
  END IF;

  -- The customer behind the record.
  IF v_type = 'order' THEN
    SELECT customer_email, customer_name INTO v_email, v_name FROM orders WHERE id = p_entity_id;
  ELSIF v_type = 'booking' THEN
    SELECT customer_email, customer_name INTO v_email, v_name FROM bookings WHERE id = p_entity_id;
  ELSIF v_type = 'ticket' THEN
    SELECT contact_email, contact_name, lead_id INTO v_email, v_name, v_lead FROM tickets WHERE id = p_entity_id;
  ELSIF v_type = 'contract' THEN
    SELECT COALESCE(signer_email, counterparty_email), COALESCE(signer_name, counterparty_name)
      INTO v_email, v_name FROM contracts WHERE id = p_entity_id;
  ELSIF v_type = 'deal' THEN
    SELECT l.email, l.name, l.id INTO v_email, v_name, v_lead
      FROM deals d JOIN leads l ON l.id = d.lead_id WHERE d.id = p_entity_id;
  END IF;

  IF v_email IS NULL OR btrim(v_email) = '' THEN
    RETURN jsonb_build_object('queued', 0, 'note', 'the ' || v_type || ' has no e-mail address to survey');
  END IF;

  FOR v_campaign IN SELECT id, delay_hours FROM survey_campaigns WHERE trigger = p_event AND is_active LOOP
    INSERT INTO survey_sends (campaign_id, recipient_email, recipient_name, related_entity_type, related_entity_id, lead_id, send_after)
    VALUES (v_campaign.id, lower(btrim(v_email)), v_name, v_type, p_entity_id, v_lead,
            now() + make_interval(hours => COALESCE(v_campaign.delay_hours, 0)::int))
    ON CONFLICT (campaign_id, related_entity_type, related_entity_id) WHERE related_entity_id IS NOT NULL DO NOTHING;
    IF FOUND THEN v_queued := v_queued + 1; ELSE v_skipped := v_skipped + 1; END IF;
  END LOOP;

  RETURN jsonb_build_object('queued', v_queued, 'already_queued', v_skipped, 'recipient', lower(btrim(v_email)));
END;
$function$;
REVOKE ALL ON FUNCTION public.queue_event_surveys(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_event_surveys(text, uuid) TO service_role;

-- 3. Is a queued survey due?
CREATE OR REPLACE FUNCTION public.work_probe_due_surveys()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.survey_sends WHERE sent_at IS NULL AND send_after IS NOT NULL AND send_after <= now())
$$;
REVOKE ALL ON FUNCTION public.work_probe_due_surveys() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.work_probe_due_surveys() TO service_role;
