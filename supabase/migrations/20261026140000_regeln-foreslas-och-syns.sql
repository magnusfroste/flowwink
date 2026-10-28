-- ─────────────────────────────────────────────────────────────────────────────
-- Regeln föreslås och syns — a bookkeeping rule is a template, offered after a
-- decision and listed where the decisions are made
-- ─────────────────────────────────────────────────────────────────────────────
-- Until now the queue learned silently: every booking from "Events to book"
-- wrote the counterparty's template onto a vendor row ("Auto-learned …"), the
-- next proposal rode that ramp, and nobody was asked — a one-off booking
-- taught a rule just as surely as a monthly one, the rule lived in the
-- purchasing module's vendor list, and there was no place to see or undo it.
-- Accounted asks: "book <counterparty> like this next time? Ja / Inte nu",
-- and keeps "Era regler" one click away.
--
-- The rule model is the one the reconciliation module already has
-- (reconciliation_rules: match a field, suggest an account) — it now also
-- names the TEMPLATE to book with, which is what a bookkeeping decision is.
-- A rule with a template wins the proposal outright (routing rule #0); the
-- vendor default and the keyword scorer follow as before.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.reconciliation_rules
  ADD COLUMN IF NOT EXISTS suggested_template_id uuid REFERENCES public.accounting_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS times_applied integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_applied_at timestamptz;

DO $$ BEGIN
  ALTER TABLE public.reconciliation_rules
    ADD CONSTRAINT reconciliation_rules_source_check CHECK (source IN ('manual', 'learned', 'agent'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN public.reconciliation_rules.suggested_template_id IS
  'The accounting template a matching bank event is booked with. A rule with a template is a bookkeeping decision and wins the proposal (propose_bookkeeping routing rule #0); a rule without one only tags the suggested account.';
COMMENT ON COLUMN public.reconciliation_rules.source IS
  'manual = written in the rules panel; learned = accepted from the "book like this next time?" prompt after a booking; agent = created by an operator skill.';

-- The RPC gains the template and the source. The old overload must go first:
-- two signatures that both accept the named arguments PostgREST sends would
-- make every call ambiguous.
DROP FUNCTION IF EXISTS public.manage_reconciliation_rule(text, uuid, text, text, text, text, text, text, integer);

CREATE OR REPLACE FUNCTION public.manage_reconciliation_rule(
  p_action text,
  p_rule_id uuid DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_match_field text DEFAULT NULL,
  p_match_type text DEFAULT NULL,
  p_pattern text DEFAULT NULL,
  p_suggested_account_code text DEFAULT NULL,
  p_suggested_category text DEFAULT NULL,
  p_priority integer DEFAULT NULL,
  p_suggested_template_id uuid DEFAULT NULL,
  p_source text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_writer boolean := (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'reconciliation') OR can_access_module(auth.uid(), 'accounting'));
  v_id uuid;
  v_source text;
BEGIN
  IF p_action <> 'list' AND NOT v_writer THEN
    RAISE EXCEPTION 'Requires the reconciliation or accounting module — an admin can grant it under Users → Role Permissions' USING ERRCODE = '42501';
  END IF;
  IF p_source IS NOT NULL AND p_source NOT IN ('manual', 'learned', 'agent') THEN
    RAISE EXCEPTION 'source must be manual, learned or agent (got %)', p_source;
  END IF;
  IF p_match_field IS NOT NULL AND p_match_field NOT IN ('counterparty', 'reference', 'description') THEN
    RAISE EXCEPTION 'match_field must be counterparty, reference or description (got %)', p_match_field;
  END IF;
  IF p_match_type IS NOT NULL AND p_match_type NOT IN ('contains', 'equals', 'regex') THEN
    RAISE EXCEPTION 'match_type must be contains, equals or regex (got %)', p_match_type;
  END IF;
  IF p_suggested_template_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.accounting_templates WHERE id = p_suggested_template_id) THEN
    RAISE EXCEPTION 'Accounting template % not found', p_suggested_template_id;
  END IF;

  IF p_action = 'list' THEN
    RETURN jsonb_build_object('success', true, 'rules',
      (SELECT COALESCE(jsonb_agg(
         to_jsonb(r) || jsonb_build_object('suggested_template_name', t.template_name)
         ORDER BY r.priority, r.created_at), '[]'::jsonb)
       FROM public.reconciliation_rules r
       LEFT JOIN public.accounting_templates t ON t.id = r.suggested_template_id));
  ELSIF p_action = 'create' THEN
    IF p_name IS NULL OR p_match_field IS NULL OR p_match_type IS NULL OR p_pattern IS NULL THEN
      RAISE EXCEPTION 'name, match_field, match_type, pattern required';
    END IF;
    IF p_suggested_account_code IS NULL AND p_suggested_template_id IS NULL THEN
      RAISE EXCEPTION 'A rule needs something to do: suggested_template_id (book with this template) or suggested_account_code (tag the account)';
    END IF;
    v_source := COALESCE(p_source, CASE WHEN auth.role() = 'service_role' THEN 'agent' ELSE 'manual' END);
    -- The same counterparty rule twice is one rule: the later decision updates it.
    SELECT id INTO v_id FROM public.reconciliation_rules
     WHERE match_field = p_match_field AND match_type = p_match_type AND lower(pattern) = lower(p_pattern)
     LIMIT 1;
    IF v_id IS NOT NULL THEN
      UPDATE public.reconciliation_rules SET
        name = p_name,
        suggested_account_code = COALESCE(p_suggested_account_code, suggested_account_code),
        suggested_category = COALESCE(p_suggested_category, suggested_category),
        suggested_template_id = COALESCE(p_suggested_template_id, suggested_template_id),
        priority = COALESCE(p_priority, priority),
        source = v_source,
        is_active = true,
        updated_at = now()
      WHERE id = v_id;
      RETURN jsonb_build_object('success', true, 'rule_id', v_id, 'updated_existing', true);
    END IF;
    INSERT INTO public.reconciliation_rules (name, match_field, match_type, pattern, suggested_account_code, suggested_category, priority, suggested_template_id, source)
    VALUES (p_name, p_match_field, p_match_type, p_pattern, p_suggested_account_code, p_suggested_category, COALESCE(p_priority, 100), p_suggested_template_id, v_source)
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('success', true, 'rule_id', v_id);
  ELSIF p_action = 'update' THEN
    IF p_rule_id IS NULL THEN RAISE EXCEPTION 'rule_id is required for update'; END IF;
    UPDATE public.reconciliation_rules SET
      name = COALESCE(p_name, name), match_field = COALESCE(p_match_field, match_field),
      match_type = COALESCE(p_match_type, match_type), pattern = COALESCE(p_pattern, pattern),
      suggested_account_code = COALESCE(p_suggested_account_code, suggested_account_code),
      suggested_category = COALESCE(p_suggested_category, suggested_category),
      suggested_template_id = COALESCE(p_suggested_template_id, suggested_template_id),
      priority = COALESCE(p_priority, priority),
      source = COALESCE(p_source, source),
      updated_at = now()
    WHERE id = p_rule_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Rule % not found', p_rule_id; END IF;
    RETURN jsonb_build_object('success', true, 'rule_id', p_rule_id);
  ELSIF p_action = 'delete' THEN
    IF p_rule_id IS NULL THEN RAISE EXCEPTION 'rule_id is required for delete'; END IF;
    DELETE FROM public.reconciliation_rules WHERE id = p_rule_id;
    RETURN jsonb_build_object('success', true, 'deleted', p_rule_id);
  ELSE
    RAISE EXCEPTION 'Unknown action: % (list | create | update | delete)', p_action;
  END IF;
END; $function$;
GRANT EXECUTE ON FUNCTION public.manage_reconciliation_rule(text, uuid, text, text, text, text, text, text, integer, uuid, text) TO authenticated, service_role;

-- A rule that booked something says so: the count is what the rules panel
-- shows as "applied N times" and what makes a stale rule visible.
CREATE OR REPLACE FUNCTION public.note_reconciliation_rule_applied(p_rule_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  UPDATE public.reconciliation_rules
     SET times_applied = times_applied + 1, last_applied_at = now()
   WHERE id = p_rule_id
     AND (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'accounting') OR public.can_access_module(auth.uid(), 'reconciliation'));
$fn$;
GRANT EXECUTE ON FUNCTION public.note_reconciliation_rule_applied(uuid) TO authenticated, service_role;

-- ── Bevisas där den körs ───────────────────────────────────────────────────
DO $$
DECLARE v_tpl uuid; v_out jsonb; v_rule uuid; v_rows jsonb;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    INSERT INTO public.accounting_templates (template_name, description, category, template_lines)
      VALUES ('proof: tele', 'proof', 'expense', '[{"account_code":"6212","account_name":"Telefon","debit_pct":80},{"account_code":"2640","account_name":"Ingående moms","debit_pct":20},{"account_code":"1930","account_name":"Bank","credit_pct":100}]'::jsonb)
      RETURNING id INTO v_tpl;
    -- A learned rule: counterparty equals, with a template.
    v_out := public.manage_reconciliation_rule('create', NULL, 'TELIA → proof: tele', 'counterparty', 'equals', 'TELIA', NULL, NULL, NULL, v_tpl, 'learned');
    v_rule := (v_out ->> 'rule_id')::uuid;
    IF v_rule IS NULL THEN RAISE EXCEPTION 'proof: create gave %', v_out; END IF;
    -- The same decision again updates, never duplicates.
    v_out := public.manage_reconciliation_rule('create', NULL, 'TELIA → proof: tele (again)', 'counterparty', 'equals', 'telia', NULL, NULL, NULL, v_tpl, 'learned');
    IF (v_out ->> 'rule_id')::uuid <> v_rule OR (v_out ->> 'updated_existing')::boolean IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'proof: a second identical rule should update the first, got %', v_out;
    END IF;
    -- A rule with neither template nor account is refused.
    BEGIN
      PERFORM public.manage_reconciliation_rule('create', NULL, 'empty', 'counterparty', 'equals', 'X', NULL, NULL, NULL, NULL, NULL);
      RAISE EXCEPTION 'proof: an empty rule was accepted';
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM NOT LIKE 'A rule needs something to do%' THEN RAISE; END IF;
    END;
    -- The list names the template; applying bumps the count.
    PERFORM public.note_reconciliation_rule_applied(v_rule);
    v_rows := public.manage_reconciliation_rule('list') -> 'rules';
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_rows) r
                    WHERE (r ->> 'id')::uuid = v_rule AND r ->> 'suggested_template_name' = 'proof: tele'
                      AND (r ->> 'times_applied')::int = 1 AND r ->> 'source' = 'learned') THEN
      RAISE EXCEPTION 'proof: list lacks template name / count / source: %', v_rows;
    END IF;
    RAISE NOTICE 'rule loop proof ok';
    RAISE EXCEPTION '__rule_proof_ok__';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM <> '__rule_proof_ok__' THEN RAISE; END IF;
  END;
END $$;
