
CREATE OR REPLACE FUNCTION public.seed_demo_tickets(p_run_id uuid, p_scenario text DEFAULT 'default')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tickets int := 0;
  v_comments int := 0;
  v_id uuid;
  r RECORD;
  v_lead RECORD;
  v_sla interval;
  v_resolved_at timestamptz;
  v_closed_at timestamptz;
  v_lead_id uuid;
  v_company_id uuid;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('Login problem on mobile app',     'I cannot log in from my iPhone since this morning. Tried reinstalling, same issue.',         'new',         'high',   'bug',     'Maria Andersson','maria@example.com', 'Have you tried clearing app cache? Could you share iOS version?', true),
    ('Question about invoicing',        'How do I get a copy of last month''s invoice? I need it for accounting.',                    'open',        'medium', 'billing', 'Per Svensson','per.s@example.com', 'You can download invoices under Settings → Billing. Let me know if you need help.', false),
    ('Feature request: dark mode',      'Would love a dark mode for the dashboard. Eye strain in evenings.',                          'open',        'low',    'feature', 'Lisa Berg','lisa@example.com', 'Adding to roadmap — likely Q2.', false),
    ('Sync error with Google Calendar', 'My bookings aren''t syncing to Google Calendar anymore since the update last week.',          'in_progress', 'high',   'bug',     'Tom Karlsson','tom@example.com', 'Reproduced. Engineering investigating OAuth token refresh issue.', true),
    ('How do I export contacts?',       'Looking for a CSV export option in the CRM.',                                                'resolved',    'low',    'question','Eva Holm','eva.h@example.com', 'CRM → Leads → "..." menu → Export CSV. Resolved.', false),
    ('Refund request order #1042',      'Wrong size delivered, would like a refund. Order placed 2025-12-01.',                        'new',         'urgent', 'other',   'Nils Olsson','nils@example.com', 'Refund process initiated. Return label sent to email.', false)
  ) AS t(subject, desc_, status, prio, cat, cname, cemail, reply_, is_internal) LOOP

    v_sla := CASE r.prio
      WHEN 'urgent' THEN interval '4 hours'
      WHEN 'high' THEN interval '1 day'
      WHEN 'medium' THEN interval '3 days'
      ELSE interval '7 days'
    END;

    v_resolved_at := CASE WHEN r.status IN ('resolved','closed') THEN now() - interval '1 day' ELSE NULL END;
    v_closed_at := CASE WHEN r.status = 'closed' THEN now() - interval '6 hours' ELSE NULL END;

    -- Try to link to an existing lead (preferred)
    SELECT id, company_id INTO v_lead_id, v_company_id
    FROM leads WHERE email IS NOT NULL ORDER BY random() LIMIT 1;

    INSERT INTO tickets (
      subject, description, status, priority, category,
      contact_name, contact_email, source,
      lead_id, company_id,
      sla_deadline, resolved_at, closed_at
    ) VALUES (
      r.subject, r.desc_,
      r.status::ticket_status, r.prio::ticket_priority, r.cat::ticket_category,
      r.cname, r.cemail, 'manual',
      v_lead_id, v_company_id,
      now() + v_sla, v_resolved_at, v_closed_at
    )
    RETURNING id INTO v_id;
    PERFORM _demo_register_row(p_run_id, 'tickets', v_id);
    v_tickets := v_tickets + 1;

    -- Customer message thread starter
    INSERT INTO ticket_comments (ticket_id, content, is_internal, author_type, author_name)
    VALUES (v_id, r.desc_, false, 'customer', r.cname);
    v_comments := v_comments + 1;

    -- Agent reply
    INSERT INTO ticket_comments (ticket_id, content, is_internal, author_type, author_name)
    VALUES (v_id, r.reply_, r.is_internal, CASE WHEN r.is_internal THEN 'agent' ELSE 'agent' END, 'Support Team');
    v_comments := v_comments + 1;
  END LOOP;

  RETURN jsonb_build_object('tickets', v_tickets, 'comments', v_comments);
END;
$$;
