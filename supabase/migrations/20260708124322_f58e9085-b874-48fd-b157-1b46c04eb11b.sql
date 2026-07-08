
-- ============================================================================
-- Tickets parity r7: queues/teams + escalation rules + time tracking
-- ============================================================================

-- 1) TICKET TEAMS ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ticket_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_teams TO authenticated;
GRANT ALL ON public.ticket_teams TO service_role;
ALTER TABLE public.ticket_teams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ticket_teams_all_auth" ON public.ticket_teams;
CREATE POLICY "ticket_teams_all_auth" ON public.ticket_teams
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.ticket_team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.ticket_teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  is_lead boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_team_members TO authenticated;
GRANT ALL ON public.ticket_team_members TO service_role;
ALTER TABLE public.ticket_team_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ticket_team_members_all_auth" ON public.ticket_team_members;
CREATE POLICY "ticket_team_members_all_auth" ON public.ticket_team_members
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Add team_id on tickets
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.ticket_teams(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_team_id ON public.tickets(team_id);

-- 2) ESCALATION RULES --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ticket_escalation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  -- Condition: match tickets by status + age (hours since created/updated)
  match_status text, -- optional status filter (e.g. 'new', 'open')
  match_priority text, -- optional current priority filter
  match_unassigned boolean NOT NULL DEFAULT false, -- if true, only tickets w/o assignee
  age_hours integer NOT NULL DEFAULT 24, -- trigger when age exceeds this
  age_field text NOT NULL DEFAULT 'created_at', -- 'created_at' or 'updated_at'
  -- Actions
  action_raise_priority text, -- e.g. 'high' or 'urgent'
  action_reassign_to uuid, -- user_id or team_id (see action_reassign_kind)
  action_reassign_kind text, -- 'user' | 'team' | null
  action_notify boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_escalation_rules TO authenticated;
GRANT ALL ON public.ticket_escalation_rules TO service_role;
ALTER TABLE public.ticket_escalation_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ticket_escalation_rules_all_auth" ON public.ticket_escalation_rules;
CREATE POLICY "ticket_escalation_rules_all_auth" ON public.ticket_escalation_rules
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3) TIME ENTRIES ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ticket_time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  user_id uuid,
  user_name text,
  minutes integer NOT NULL CHECK (minutes > 0),
  note text,
  billable boolean NOT NULL DEFAULT true,
  started_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_time_entries TO authenticated;
GRANT ALL ON public.ticket_time_entries TO service_role;
ALTER TABLE public.ticket_time_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ticket_time_entries_all_auth" ON public.ticket_time_entries;
CREATE POLICY "ticket_time_entries_all_auth" ON public.ticket_time_entries
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_ticket_time_entries_ticket ON public.ticket_time_entries(ticket_id);

-- 4) ESCALATION SWEEP FUNCTION ----------------------------------------------
-- Agent-callable: uses service_role escape so both admins and MCP gateway can invoke.
CREATE OR REPLACE FUNCTION public.run_ticket_escalations()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rule record;
  v_ticket record;
  v_applied integer := 0;
  v_rules_evaluated integer := 0;
  v_results jsonb := '[]'::jsonb;
BEGIN
  -- Only admins or service_role (edge functions / MCP gateway) may run the sweep.
  IF NOT (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'permission denied: admin or service_role required';
  END IF;

  FOR v_rule IN
    SELECT * FROM public.ticket_escalation_rules WHERE is_active = true
  LOOP
    v_rules_evaluated := v_rules_evaluated + 1;

    FOR v_ticket IN
      EXECUTE format(
        'SELECT id, priority, assigned_to, team_id, status FROM public.tickets
          WHERE status NOT IN (''resolved'',''closed'')
            AND (%L IS NULL OR status = %L)
            AND (%L IS NULL OR priority = %L)
            AND (NOT %L OR assigned_to IS NULL)
            AND %I < now() - (%L || '' hours'')::interval',
        v_rule.match_status, v_rule.match_status,
        v_rule.match_priority, v_rule.match_priority,
        v_rule.match_unassigned,
        v_rule.age_field,
        v_rule.age_hours::text
      )
    LOOP
      -- Raise priority
      IF v_rule.action_raise_priority IS NOT NULL
         AND v_ticket.priority IS DISTINCT FROM v_rule.action_raise_priority THEN
        UPDATE public.tickets
          SET priority = v_rule.action_raise_priority,
              updated_at = now()
          WHERE id = v_ticket.id;
      END IF;

      -- Reassign
      IF v_rule.action_reassign_to IS NOT NULL AND v_rule.action_reassign_kind = 'user' THEN
        UPDATE public.tickets
          SET assigned_to = v_rule.action_reassign_to, updated_at = now()
          WHERE id = v_ticket.id;
      ELSIF v_rule.action_reassign_to IS NOT NULL AND v_rule.action_reassign_kind = 'team' THEN
        UPDATE public.tickets
          SET team_id = v_rule.action_reassign_to, updated_at = now()
          WHERE id = v_ticket.id;
      END IF;

      -- Notify (create support_escalations row if that table exists)
      IF v_rule.action_notify THEN
        BEGIN
          INSERT INTO public.support_escalations (ticket_id, reason, escalated_at, resolved)
          VALUES (v_ticket.id,
                  format('Auto-escalation rule: %s', v_rule.name),
                  now(),
                  false);
        EXCEPTION WHEN OTHERS THEN
          -- swallow (table may have different columns on some instances)
          NULL;
        END;
      END IF;

      v_applied := v_applied + 1;
      v_results := v_results || jsonb_build_object(
        'ticket_id', v_ticket.id,
        'rule_id', v_rule.id,
        'rule_name', v_rule.name
      );
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'rules_evaluated', v_rules_evaluated,
    'tickets_escalated', v_applied,
    'details', v_results
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.run_ticket_escalations() TO authenticated, service_role;

-- 5) Timestamp trigger reuse
DROP TRIGGER IF EXISTS trg_ticket_teams_updated_at ON public.ticket_teams;
CREATE TRIGGER trg_ticket_teams_updated_at BEFORE UPDATE ON public.ticket_teams
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_ticket_escalation_rules_updated_at ON public.ticket_escalation_rules;
CREATE TRIGGER trg_ticket_escalation_rules_updated_at BEFORE UPDATE ON public.ticket_escalation_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
