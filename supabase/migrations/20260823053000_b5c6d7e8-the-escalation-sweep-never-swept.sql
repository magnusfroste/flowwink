-- ============================================================================
-- run_ticket_escalations: eskaleringsmotorn har aldrig eskalerat en enda biljett
-- ============================================================================
--
-- ROTORSAK
-- --------
-- `ticket_escalation_rules.action_raise_priority` är `text`. `tickets.priority`
-- är enumen `ticket_priority`. Kroppen jämförde dem direkt:
--
--     IF v_rule.action_raise_priority IS NOT NULL
--        AND v_ticket.priority IS DISTINCT FROM v_rule.action_raise_priority THEN
--
-- Det finns ingen operator `ticket_priority = text`, så satsen smäller med
--
--     operator does not exist: ticket_priority = text
--
-- Den smäller ÄVEN när `action_raise_priority IS NULL` — och just DET är poängen:
-- PL/pgSQL kortsluter inte IF-villkoret gren för gren. Hela villkoret skickas som
-- ETT SQL-uttryck (`SELECT <a> AND <b>`) till planeraren, och planeraren måste
-- lösa operatorn i `<b>` innan någon rad evalueras. Ett NULL i vänsterledet
-- räddar alltså ingenting: felet är ett PLAN-fel, inte ett kör-fel. Följden är
-- att hela svepet dör på FÖRSTA matchande biljetten för VARJE aktiv regel —
-- oavsett vilka åtgärder regeln bär. Ticket-eskaleringen har alltså aldrig
-- flyttat en enda biljett sedan den skrevs (2026-07-08).
--
-- Samma klass fanns latent i den dynamiska EXECUTE-frågan: `match_status` och
-- `match_priority` är också `text` och lästes in i SQL:en som nakna literaler.
-- Ett tomt fält ('') eller en label som inte finns i enumen ger då
-- "invalid input value for enum ticket_status: ..." och dödar hela svepet i
-- stället för att hoppa över den trasiga regeln.
--
-- FIXEN
-- -----
-- 1. Jämför i ENUMDOMÄNEN, inte över typgränsen. Regelns textfält valideras mot
--    `pg_enum` (samma mönster som `move_application_stage`) och castas EN gång
--    till `ticket_status` / `ticket_priority`-lokalvariabler. Därefter möter enum
--    alltid enum.
-- 2. En regel med en okänd label SKIPPAS och rapporteras i `skipped_rules` —
--    en trasig regel får inte ta ner svepet för de andra (Law 4: fail forward).
--    Blanka strängar normaliseras till NULL = "inget filter".
-- 3. Den dynamiska `EXECUTE format(...)` är borta. Villkoren är nu statisk SQL
--    med typade variabler; `age_field` löses med ett CASE över de två kolumner
--    UI:t erbjuder i stället för `%I`. Det stänger hela klassen: en textliteral
--    kan inte längre smyga in i en enum-jämförelse via strängbygget.
--
-- Behållet oförändrat: matris-vakten med service_role-undantaget (agent-anropbar
-- via MCP-gatewayen, där auth.uid() är NULL), returnyckarna `rules_evaluated`,
-- `tickets_escalated` och `details` (UI:t i TicketEscalationRulesTab läser de två
-- första), samt den svalda INSERTen i support_escalations.
--
-- REPRODUKTION (bevis före/efter — kör i en transaktion och ROLLBACKa)
-- -------------------------------------------------------------------
--   BEGIN;
--   SET LOCAL request.jwt.claims = '{"role":"service_role"}';
--   INSERT INTO public.tickets (subject, status, priority, created_at, updated_at)
--   VALUES ('REPRO', 'open', 'low', now() - interval '72 hours', now() - interval '72 hours');
--   INSERT INTO public.ticket_escalation_rules
--     (name, is_active, match_status, match_priority, match_unassigned,
--      age_hours, age_field, action_raise_priority, action_notify)
--   VALUES ('REPRO notify-only', true, NULL, NULL, false, 1, 'created_at', NULL, false);
--   SELECT public.run_ticket_escalations();
--   ROLLBACK;
--
--   FÖRE fixen: ERROR: operator does not exist: ticket_priority = text
--               CONTEXT: PL/pgSQL function run_ticket_escalations() line 35 at IF
--   EFTER fixen: {"rules_evaluated": 1, "tickets_escalated": 1, ...}
--
-- Idempotent (CREATE OR REPLACE). Framåtdaterad: managed-instanser hoppar tyst
-- över migrationer vars tidsstämpel ligger under ledgerns HEAD.
-- ============================================================================

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
      SELECT t.id, t.priority, t.assigned_to, t.team_id, t.status
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
    'rules_skipped', jsonb_array_length(v_skipped),
    'tickets_escalated', v_applied,
    'details', v_results,
    'skipped_rules', v_skipped
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.run_ticket_escalations() TO authenticated, service_role;

COMMENT ON FUNCTION public.run_ticket_escalations() IS
  'Ticket escalation sweep. Rule text fields (match_status, match_priority, action_raise_priority) are validated against pg_enum and cast into ticket_status/ticket_priority before any comparison — comparing an enum column against a text variable makes PL/pgSQL fail at PLAN time (operator does not exist: ticket_priority = text), even on branches a NULL check would logically skip. Rules carrying an unknown label are skipped and reported in skipped_rules instead of aborting the sweep.';
