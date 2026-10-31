-- ============================================================
-- Migration: an escalation rule's "notify" tells someone
-- Date: 2026-10-31
-- Safe to re-run: Yes (CREATE OR REPLACE)
-- ============================================================
--
-- run_ticket_escalations' notify step inserted into support_escalations
-- (ticket_id, reason, escalated_at, resolved) — a table of chat and form
-- escalations that has none of those columns but reason. The insert sat in
-- EXCEPTION WHEN OTHERS THEN NULL, so every rule with action_notify = true
-- has notified nobody, silently, since it was written (found 2026-10-31 by
-- comparing live function bodies with the live schema on Nordbrygg).
--
-- Now a notification is what notify means elsewhere on the platform
-- (20261030100000): an agent_activity row with log_type 'notify' that stays
-- in the cockpit's "acted on its own" card and the bell until an admin
-- acknowledges it — one open per ticket and rule — plus a ticket.escalated
-- platform event for automations. Everything else in the body is unchanged.

CREATE OR REPLACE FUNCTION public.run_ticket_escalations()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rule record;
  v_ticket record;
  v_applied integer := 0;
  v_rules_evaluated integer := 0;
  v_results jsonb := '[]'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
  -- Regelns textfält, lyfta in i enumdomänen EN gång per regel.
  v_match_status public.ticket_status;
  v_match_priority public.ticket_priority;
  v_raise_priority public.ticket_priority;
  v_age_field text;
  v_age_hours integer;
  v_unassigned boolean;
  v_kind text;
  v_label text;
  v_bad text;
BEGIN
  -- Only admins (via the module matrix) or service_role (edge functions / MCP
  -- gateway, where auth.uid() is NULL) may run the sweep.
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'tickets')) THEN
    RAISE EXCEPTION 'Requires the tickets module — an admin can grant it under Users → Role Permissions';
  END IF;

  FOR v_rule IN
    SELECT * FROM public.ticket_escalation_rules WHERE is_active = true ORDER BY created_at
  LOOP
    v_rules_evaluated := v_rules_evaluated + 1;
    v_match_status   := NULL;
    v_match_priority := NULL;
    v_raise_priority := NULL;
    v_bad            := NULL;

    -- match_status: text → ticket_status (blank = inget filter, okänd label = skip)
    v_label := NULLIF(btrim(COALESCE(v_rule.match_status, '')), '');
    IF v_label IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM pg_enum
                  WHERE enumtypid = 'public.ticket_status'::regtype AND enumlabel = v_label) THEN
        v_match_status := v_label::public.ticket_status;
      ELSE
        v_bad := format('match_status=%L is not a ticket_status label', v_label);
      END IF;
    END IF;

    -- match_priority: text → ticket_priority
    IF v_bad IS NULL THEN
      v_label := NULLIF(btrim(COALESCE(v_rule.match_priority, '')), '');
      IF v_label IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM pg_enum
                    WHERE enumtypid = 'public.ticket_priority'::regtype AND enumlabel = v_label) THEN
          v_match_priority := v_label::public.ticket_priority;
        ELSE
          v_bad := format('match_priority=%L is not a ticket_priority label', v_label);
        END IF;
      END IF;
    END IF;

    -- action_raise_priority: text → ticket_priority
    IF v_bad IS NULL THEN
      v_label := NULLIF(btrim(COALESCE(v_rule.action_raise_priority, '')), '');
      IF v_label IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM pg_enum
                    WHERE enumtypid = 'public.ticket_priority'::regtype AND enumlabel = v_label) THEN
          v_raise_priority := v_label::public.ticket_priority;
        ELSE
          v_bad := format('action_raise_priority=%L is not a ticket_priority label', v_label);
        END IF;
      END IF;
    END IF;

    -- En trasig regel tar inte ner svepet — den rapporteras och hoppas över.
    IF v_bad IS NOT NULL THEN
      v_skipped := v_skipped || jsonb_build_object(
        'rule_id', v_rule.id, 'rule_name', v_rule.name, 'reason', v_bad);
      CONTINUE;
    END IF;

    -- age_field är en KOLUMN, inte ett värde: håll den i den mängd UI:t erbjuder
    -- (created_at | updated_at) i stället för att interpolera en identifierare.
    v_age_field  := CASE WHEN lower(btrim(COALESCE(v_rule.age_field, 'created_at'))) = 'updated_at'
                         THEN 'updated_at' ELSE 'created_at' END;
    v_age_hours  := GREATEST(COALESCE(v_rule.age_hours, 24), 0);
    v_unassigned := COALESCE(v_rule.match_unassigned, false);

    FOR v_ticket IN
      SELECT t.id, t.subject, t.priority, t.assigned_to, t.team_id, t.status
        FROM public.tickets t
       WHERE t.status NOT IN ('resolved'::public.ticket_status, 'closed'::public.ticket_status)
         AND (v_match_status IS NULL OR t.status = v_match_status)
         AND (v_match_priority IS NULL OR t.priority = v_match_priority)
         AND (NOT v_unassigned OR t.assigned_to IS NULL)
         AND (CASE WHEN v_age_field = 'updated_at' THEN t.updated_at ELSE t.created_at END)
             < now() - make_interval(hours => v_age_hours)
    LOOP
      -- Raise priority (enum vs enum — aldrig enum vs text)
      IF v_raise_priority IS NOT NULL AND v_ticket.priority IS DISTINCT FROM v_raise_priority THEN
        UPDATE public.tickets
          SET priority = v_raise_priority,
              updated_at = now()
          WHERE id = v_ticket.id;
      END IF;

      -- Reassign
      v_kind := lower(btrim(COALESCE(v_rule.action_reassign_kind, '')));
      IF v_rule.action_reassign_to IS NOT NULL AND v_kind = 'user' THEN
        UPDATE public.tickets
          SET assigned_to = v_rule.action_reassign_to, updated_at = now()
          WHERE id = v_ticket.id;
      ELSIF v_rule.action_reassign_to IS NOT NULL AND v_kind = 'team' THEN
        UPDATE public.tickets
          SET team_id = v_rule.action_reassign_to, updated_at = now()
          WHERE id = v_ticket.id;
      END IF;

      -- Notify: a person is told. The notify-level queue (agent_activity
      -- log_type 'notify', the cockpit card and the bell) holds it until an
      -- admin acknowledges it, and ticket.escalated reaches automations.
      -- One open notification per ticket and rule — a sweep that runs again
      -- before anyone looked does not say it twice.
      IF v_rule.action_notify AND NOT EXISTS (
        SELECT 1 FROM public.agent_activity a
         WHERE a.skill_name = 'run_ticket_escalations'
           AND a.log_type = 'notify'
           AND a.acknowledged_at IS NULL
           AND a.input->>'ticket_id' = v_ticket.id::text
           AND a.input->>'rule_id' = v_rule.id::text
      ) THEN
        INSERT INTO public.agent_activity (agent, skill_name, input, output, status, log_type, log_message)
        VALUES ('system', 'run_ticket_escalations',
                jsonb_build_object('ticket_id', v_ticket.id, 'rule_id', v_rule.id),
                jsonb_build_object('ticket_id', v_ticket.id, 'subject', v_ticket.subject,
                                   'rule_name', v_rule.name, 'priority', COALESCE(v_raise_priority, v_ticket.priority)),
                'success', 'notify',
                format('Ticket "%s" escalated by rule "%s"', COALESCE(v_ticket.subject, v_ticket.id::text), v_rule.name));
        PERFORM public.emit_platform_event('ticket.escalated',
          jsonb_build_object('ticket_id', v_ticket.id, 'rule_id', v_rule.id, 'rule_name', v_rule.name),
          'run_ticket_escalations');
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
    'rules_skipped', jsonb_array_length(v_skipped),
    'tickets_escalated', v_applied,
    'details', v_results,
    'skipped_rules', v_skipped
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.run_ticket_escalations() TO authenticated, service_role;
