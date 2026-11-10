-- CRM follow-through: assignment and the overdue report.
--
-- The columns existed all along — leads.assigned_to and companies.account_owner
-- are uuid columns nothing agent-facing could write, because manage_leads never
-- declared the parameter and account_owner expects a uuid no agent has. So on a
-- shared-agent instance ("one OpenClaw, several colleagues") there was no way
-- to say "anna@example.com is the seller on this one", and no way to ask "what
-- has slipped through the cracks" — a lead untouched for three weeks looked
-- identical to one from yesterday.
--
-- Three SECURITY DEFINER functions close it, rpc:-handled so no edge redeploy
-- is needed anywhere. People are addressed by EMAIL and resolved to uuids here,
-- because email is what a human tells a shared agent; uuids are what columns
-- want. Grants exclude anon — assignment and pipeline overviews are internal.

-- ─── Resolve a person: email or uuid → profile ──────────────────────────────
CREATE OR REPLACE FUNCTION public._resolve_profile(p_who text)
RETURNS TABLE (user_id uuid, user_email text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, email FROM public.profiles
  WHERE (p_who ~* '^[0-9a-f]{8}-' AND id = p_who::uuid)
     OR lower(email) = lower(trim(p_who))
  LIMIT 1;
$$;

-- ─── assign_lead ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assign_lead(p_lead text, p_assignee text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lead public.leads%ROWTYPE;
  v_uid uuid; v_email text;
BEGIN
  SELECT * INTO v_lead FROM public.leads
  WHERE (p_lead ~* '^[0-9a-f]{8}-' AND id = p_lead::uuid)
     OR lower(email) = lower(trim(p_lead))
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Lead not found: '||p_lead||'. Pass the lead''s email or id.');
  END IF;

  SELECT user_id, user_email INTO v_uid, v_email FROM public._resolve_profile(p_assignee);
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'No user with email or id '||p_assignee||'. The assignee must be a platform user (Settings → Users).');
  END IF;

  UPDATE public.leads SET assigned_to = v_uid, updated_at = now() WHERE id = v_lead.id;
  -- Read back — the envelope must describe the row, not the intention.
  RETURN (SELECT jsonb_build_object(
    'lead_id', id, 'lead_email', email, 'lead_name', name,
    'assigned_to', assigned_to, 'assignee_email', v_email)
  FROM public.leads WHERE id = v_lead.id);
END; $$;

-- ─── assign_company ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assign_company(p_company text, p_owner text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid; v_name text; v_uid uuid; v_email text;
BEGIN
  SELECT id, name INTO v_id, v_name FROM public.companies
  WHERE (p_company ~* '^[0-9a-f]{8}-' AND id = p_company::uuid)
     OR lower(name) = lower(trim(p_company))
  LIMIT 1;
  IF v_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Company not found: '||p_company||'. Pass the exact name or id.');
  END IF;

  SELECT user_id, user_email INTO v_uid, v_email FROM public._resolve_profile(p_owner);
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'No user with email or id '||p_owner||'.');
  END IF;

  UPDATE public.companies SET account_owner = v_uid, updated_at = now() WHERE id = v_id;
  RETURN jsonb_build_object('company_id', v_id, 'company_name', v_name,
                            'account_owner', v_uid, 'owner_email', v_email);
END; $$;

-- ─── crm_followup_report ────────────────────────────────────────────────────
-- "What has slipped through the cracks": stale leads and overdue project tasks
-- in one call, with assignee emails so a shared agent can say WHO should act.
CREATE OR REPLACE FUNCTION public.crm_followup_report(p_stale_days integer DEFAULT 14)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'stale_days_threshold', p_stale_days,
    'stale_leads', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', l.id, 'email', l.email, 'name', l.name, 'status', l.status,
        'score', l.score,
        'days_since_activity', (now()::date - l.updated_at::date),
        'assigned_to_email', p.email)
        ORDER BY l.updated_at)
      FROM public.leads l
      LEFT JOIN public.profiles p ON p.id = l.assigned_to
      WHERE l.status = 'lead'
        AND l.updated_at < now() - make_interval(days => p_stale_days)
    ), '[]'::jsonb),
    'unassigned_leads', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', id, 'email', email, 'name', name)
        ORDER BY created_at DESC)
      FROM public.leads WHERE status = 'lead' AND assigned_to IS NULL
    ), '[]'::jsonb),
    'overdue_tasks', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', t.id, 'title', t.title, 'project_id', t.project_id,
        'due_date', t.due_date, 'days_overdue', (now()::date - t.due_date),
        'status', t.status, 'assigned_to_email', p.email)
        ORDER BY t.due_date)
      FROM public.project_tasks t
      LEFT JOIN public.profiles p ON p.id = t.assigned_to
      WHERE t.completed_at IS NULL AND t.status <> 'done'
        AND t.due_date IS NOT NULL AND t.due_date < now()::date
    ), '[]'::jsonb),
    'tasks_without_due_date', COALESCE((
      SELECT count(*) FROM public.project_tasks
      WHERE completed_at IS NULL AND status <> 'done' AND due_date IS NULL
    ), 0)
  );
$$;

-- Internal surfaces only — never the anonymous visitor.
REVOKE ALL ON FUNCTION public._resolve_profile(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assign_lead(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assign_company(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.crm_followup_report(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_lead(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assign_company(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crm_followup_report(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._resolve_profile(text) TO service_role;
