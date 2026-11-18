-- ============================================================================
-- The customer hears about their case (2026-11-18).
--
-- Found by doing support-to-resolution by hand in the admin: a case created
-- for a customer told the customer nothing, and the staff's reply was written
-- to ticket_comments "for the portal" — which a customer who wrote in through
-- a form, or was entered by hand, has no account in. The only reply that
-- reached anyone was the one sent through a connected Gmail on a case that
-- came in by mail. The step happened; the customer was never told.
--
-- Two facts, so each mail goes once:
--   tickets.ack_sent_at          the "we have received it" mail
--   ticket_comments.emailed_at   the reply that was mailed (the Gmail reply
--                                stamps it itself: it was already sent)
-- and one event, ticket.replied, for a public reply by staff written NOW.
-- A back-dated comment is an import and tells nobody.
--
-- The mails are sent by the skill send_ticket_update, run by two automations
-- (tickets module): on ticket.created and on ticket.replied.
-- ============================================================================

ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS ack_sent_at timestamptz;
ALTER TABLE public.ticket_comments ADD COLUMN IF NOT EXISTS emailed_at timestamptz;

COMMENT ON COLUMN public.tickets.ack_sent_at IS 'When the customer was mailed that the case was received (send_ticket_update). NULL = not told.';
COMMENT ON COLUMN public.ticket_comments.emailed_at IS 'When this public reply was mailed to the customer. Set at insert by a writer that mailed it itself (the Gmail reply).';

CREATE OR REPLACE FUNCTION public.emit_ticket_replied()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- A reply the customer may read, written by staff, now, and not already mailed.
  IF NEW.is_internal IS NOT TRUE
     AND NEW.author_type = 'agent'
     AND NEW.emailed_at IS NULL
     AND NEW.created_at > now() - interval '10 minutes' THEN
    PERFORM public.emit_platform_event(
      'ticket.replied',
      jsonb_build_object('id', NEW.id, 'data', jsonb_build_object('ticket_id', NEW.ticket_id, 'comment_id', NEW.id)),
      'ticket_comments'
    );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.emit_ticket_replied() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.emit_ticket_replied() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_emit_ticket_replied ON public.ticket_comments;
CREATE TRIGGER trg_emit_ticket_replied
  AFTER INSERT ON public.ticket_comments
  FOR EACH ROW EXECUTE FUNCTION public.emit_ticket_replied();
