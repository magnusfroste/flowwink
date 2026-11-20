-- The business's own notices speak the site's language (2026-11-20).
--
-- The three booking automations carried their mail in the arguments: an
-- English subject, a raw UTC timestamp ("2026-12-10T17:00:00+00:00") and a
-- relative "/admin/bookings" link no mail client can open. email_admins now
-- writes the notice itself (`notice` + `booking_id`): the site's language, the
-- business's clock, an absolute link.
--
-- Automations are seeded by name and never updated, so the rows on a live
-- instance keep the old arguments. This moves a row only while it still carries
-- the text the platform seeded — a subject someone rewrote is theirs and stays.

UPDATE public.agent_automations
SET skill_arguments = jsonb_build_object(
      'notice', 'booking.created',
      'booking_id', '{{event.payload.id}}',
      'source', 'booking.created')
WHERE skill_name = 'email_admins'
  AND skill_arguments->>'subject' = 'New booking: {{event.payload.data.customer_name}} — {{event.payload.data.start_time}}';

UPDATE public.agent_automations
SET skill_arguments = jsonb_build_object(
      'notice', 'booking.rescheduled',
      'booking_id', '{{event.payload.id}}',
      'previous_start_time', '{{event.payload.data.previous_start_time}}',
      'source', 'booking.rescheduled')
WHERE skill_name = 'email_admins'
  AND skill_arguments->>'subject' = 'Booking moved: {{event.payload.data.customer_name}} — {{event.payload.data.start_time}}';

UPDATE public.agent_automations
SET skill_arguments = jsonb_build_object(
      'notice', 'booking.cancelled_by_customer',
      'booking_id', '{{event.payload.id}}',
      'reason', '{{event.payload.data.reason}}',
      'source', 'booking.cancelled_by_customer')
WHERE skill_name = 'email_admins'
  AND skill_arguments->>'subject' = 'Booking cancelled by the customer: {{event.payload.data.customer_name}} — {{event.payload.data.start_time}}';
