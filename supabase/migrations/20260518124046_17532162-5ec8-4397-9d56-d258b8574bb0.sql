-- Skill schema hygiene: add x-action-required to NOT NULL columns + update 9 descriptions with "Use when:" markers
DO $$
DECLARE
  patch RECORD;
BEGIN
  FOR patch IN
    SELECT * FROM (VALUES
      ('manage_accounting_template'::text, jsonb_build_array('template_name')),
      ('manage_analytic_account', jsonb_build_array('code','name')),
      ('manage_carrier', jsonb_build_array('code','name')),
      ('manage_chart_of_accounts', jsonb_build_array('account_code','account_name','account_type','account_category','normal_balance')),
      ('manage_contract', jsonb_build_array('title','counterparty_name')),
      ('manage_document', jsonb_build_array('title','file_url')),
      ('manage_employee', jsonb_build_array('name')),
      ('manage_job_posting', jsonb_build_array('title')),
      ('manage_journal_entry', jsonb_build_array('description')),
      ('manage_leave', jsonb_build_array('employee_id','start_date','end_date')),
      ('manage_pricelist', jsonb_build_array('name')),
      ('manage_pricelist_item', jsonb_build_array('pricelist_id')),
      ('manage_project', jsonb_build_array('name')),
      ('manage_project_task', jsonb_build_array('project_id','title')),
      ('manage_return_item', jsonb_build_array('return_id')),
      ('manage_saved_views', jsonb_build_array('scope','name')),
      ('manage_shipment', jsonb_build_array('order_id')),
      ('manage_site_settings', jsonb_build_array('key')),
      ('manage_sla_policy', jsonb_build_array('name','entity_type','metric','threshold_minutes')),
      ('manage_tags', jsonb_build_array('name')),
      ('manage_vendor', jsonb_build_array('name')),
      ('onboarding_checklist', jsonb_build_array('employee_id')),
      ('record_accounting_correction', jsonb_build_array('original_account_code','corrected_account_code')),
      ('tag_journal_entry_analytics', jsonb_build_array('analytic_account_id','entry_date','amount_cents'))
    ) AS p(skill_name, cols)
  LOOP
    UPDATE public.agent_skills
       SET tool_definition = jsonb_set(
             tool_definition,
             '{function,parameters,x-action-required}',
             COALESCE(tool_definition #> '{function,parameters,x-action-required}', '{}'::jsonb)
               || jsonb_build_object('create', patch.cols),
             true
           )
     WHERE name = patch.skill_name
       AND tool_definition #> '{function,parameters}' IS NOT NULL;
  END LOOP;
END $$;

UPDATE public.agent_skills SET description =
  'Submits a draft expense report for approval. Locks all included expenses to submitted state. Use when: employee finishes their expense report and wants it sent to manager / "submit my expenses" / "skicka in utlägg". NOT for: creating expenses (use generate_expense_report) or approving (use approve_expense_report).'
  WHERE name = 'submit_expense_report';
UPDATE public.agent_skills SET description =
  'Admin-only. Approves a submitted expense report and marks all included expenses as approved. Use when: manager approves a submitted report / "approve expense report" / "godkänn utlägg". NOT for: booking to ledger (use book_expense_report) or paying out (use mark_expense_report_paid).'
  WHERE name = 'approve_expense_report';
UPDATE public.agent_skills SET description =
  'Publish a draft webinar so it becomes visible and registrable. Emits webinar.published event. Use when: a draft webinar is ready to go live for registration / "publish webinar" / "publicera webinar". NOT for: starting the broadcast (use start_webinar) or creating the webinar (use manage_webinar).'
  WHERE name = 'publish_webinar';
UPDATE public.agent_skills SET description =
  'Manually flip a webinar to live status. Normally automatic via cron when date passes. Use when: host wants to start broadcast early / "start webinar now" / "kör igång webinariet". NOT for: publishing draft (use publish_webinar) or closing after run (use complete_webinar).'
  WHERE name = 'start_webinar';
UPDATE public.agent_skills SET description =
  'Close a webinar after it has run. Optionally attach the recording URL. Emits webinar.completed event. Use when: live session ended and we want to mark it done + share recording / "complete webinar" / "avsluta webinariet". NOT for: cancelling before run (use cancel_webinar).'
  WHERE name = 'complete_webinar';
UPDATE public.agent_skills SET description =
  'Cancel a webinar. Emits webinar.cancelled event so automations can notify registrants. Use when: webinar will not run and registrants must be informed / "cancel webinar" / "ställ in webinariet". NOT for: completing a webinar that did run (use complete_webinar).'
  WHERE name = 'cancel_webinar';
UPDATE public.agent_skills SET description =
  'Flag a registration as attended (or not). Boosts lead score +10 on attended=true. Emits webinar.attended event. Use when: post-webinar bookkeeping of who showed up / "mark attendance" / "registrera närvaro". NOT for: registering new attendees (use webinar registration flow).'
  WHERE name = 'mark_webinar_attendance';
UPDATE public.agent_skills SET description =
  'Reject a pending procurement suggestion with an optional reason. Admin-only. Use when: buyer declines an auto-generated reorder suggestion / "reject procurement" / "avvisa förslag". NOT for: approving (use approve_procurement_suggestion) or creating PO directly (use create_purchase_order).'
  WHERE name = 'reject_procurement_suggestion';
UPDATE public.agent_skills SET description =
  'Close shift and generate Z-report with payments-by-method aggregation. Emits pos.session.closed event for batch journal posting. Use when: cashier ends shift / day-end POS closing / "close pos session" / "stäng kassan". NOT for: voiding sales or opening a new session.'
  WHERE name = 'close_pos_session_v2';