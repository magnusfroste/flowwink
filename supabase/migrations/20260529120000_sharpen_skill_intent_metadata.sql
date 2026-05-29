-- Sharpen skill intent metadata so the relevance scorer ranks these skills
-- correctly. This is a FlowPilot Law 2 fix (skills are self-describing): the
-- remedy for a misranked skill is ALWAYS better Use when:/NOT for: markers,
-- never a routing hack.
--
-- Observed misranks (live, ?mode=dispatch search_skills):
--   * "book a meeting on the calendar"  -> content_calendar_view outranked
--     book_appointment (the word "calendar" lived only in the content skill).
--   * "create an invoice for a customer" / "bill a client" -> manage_invoice
--     buried under vendor 3-way-match skills; it never mentioned bill/client.
--
-- Scorer mechanics that shaped the wording (see _shared/skills/intent-scorer.ts):
--   * "Use when:" is parsed only up to the FIRST period -> use ';' separators,
--     a single trailing '.' before "NOT for:".
--   * Every word in "NOT for:" is a -15 penalty when present in the query, so
--     content_calendar_view must NOT list "calendar" there (it would penalise
--     its own legitimate use).
--
-- Idempotent: re-running sets identical values.

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      (
        'book_appointment',
        'Create a booking for a customer. Use when: a customer wants to book a meeting, call, demo or appointment; schedule a slot on the calendar; confirm a service reservation; create a booking from a chat conversation. NOT for: checking availability (check_availability); managing existing bookings (manage_bookings); the editorial content calendar (content_calendar_view).'
      ),
      (
        'content_calendar_view',
        'Lists scheduled and draft content, identifies content gaps. Use when: reviewing the editorial content calendar; checking upcoming posts; finding content gaps. NOT for: creating content (write_blog_post); publishing content (manage_blog_posts); booking a meeting or appointment (book_appointment).'
      ),
      (
        'manage_invoice',
        'Create, update, list, or send invoices. Use when: create an invoice; bill a customer or client; issue a customer invoice; change invoice status (draft to sent to paid); update line items; look up invoice details. NOT for: quotes (manage_quote); accounting entries (manage_journal_entry); timesheets (log_time); 3-way matching vendor invoices (match_po_to_invoice).'
      )
    ) AS t(skill_name, new_desc)
  LOOP
    UPDATE agent_skills
    SET description = rec.new_desc,
        tool_definition = CASE
          WHEN tool_definition ? 'function'
            THEN jsonb_set(tool_definition, '{function,description}', to_jsonb(rec.new_desc))
          ELSE tool_definition
        END
    WHERE name = rec.skill_name;
  END LOOP;
END $$;
