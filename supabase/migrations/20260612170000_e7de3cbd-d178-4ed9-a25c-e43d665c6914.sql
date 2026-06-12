-- Approvals polish + EPIC-02.4 closing checks.
--
-- 1) Approver notification listener (approvals.notifications): an event-triggered
--    automation routes approval.assigned → post_to_cowork_chat, so every new chain
--    request / step advance surfaces in the team workspace (the platform's own
--    notification channel — no email config required; webhooks can subscribe too).
--    Inserted idempotently here so already-bootstrapped instances get it without
--    a re-bootstrap; the module seed covers fresh installs.
-- 2) inventory_gl_reconciliation (EPIC-02.4): read-only check that GL 1460 ties
--    out to Σ remaining valuation layers, with component breakdown + explanation.
-- Idempotent.

-- ── 1) approval.assigned → cowork chat ──────────────────────────────────────
INSERT INTO "public"."agent_automations"
  (name, description, trigger_type, trigger_config, skill_name, skill_arguments, enabled, executor)
SELECT
  'Notify approvers in cowork chat',
  'When a chain approval is created or advances to a new step, post a notice in Cowork Chat so approvers see it (approval.assigned event).',
  'event',
  '{"event": "approval.assigned"}'::jsonb,
  'post_to_cowork_chat',
  '{"p_content": "🔔 Attest väntar: {{event.payload.entity_type}} {{event.payload.entity_id}} — steg {{event.payload.step}}. Godkänn via advance_approval_step eller Approval Inbox.", "p_author_name": "Approvals", "p_metadata": {"source": "approvals", "request_id": "{{event.payload.request_id}}"}}'::jsonb,
  true,
  'platform'
WHERE NOT EXISTS (
  SELECT 1 FROM "public"."agent_automations" WHERE name = 'Notify approvers in cowork chat'
);

-- ── 2) EPIC-02.4 GL ↔ valuation reconciliation ─────────────────────────────
CREATE OR REPLACE FUNCTION "public"."inventory_gl_reconciliation"() RETURNS "jsonb"
LANGUAGE "plpgsql" STABLE SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE
  v_gl bigint;
  v_layers bigint;
  v_unbooked bigint;
  v_diff bigint;
BEGIN
  -- GL 1460 balance from posted journal lines
  SELECT COALESCE(SUM(debit_cents) - SUM(credit_cents), 0) INTO v_gl
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  WHERE jel.account_code = '1460' AND je.status = 'posted';

  -- Inventory value per the valuation layers
  SELECT COALESCE(round(SUM(remaining_qty * unit_cost_cents)), 0) INTO v_layers
  FROM stock_valuation_layers WHERE remaining_qty > 0;

  -- Layers whose receipt never posted to GL (non-PO receipts: manual/adjustment/
  -- mo_production) — the expected, explainable part of any difference.
  SELECT COALESCE(round(SUM(l.remaining_qty * l.unit_cost_cents)), 0) INTO v_unbooked
  FROM stock_valuation_layers l
  LEFT JOIN stock_moves m ON m.id = l.move_id
  WHERE l.remaining_qty > 0
    AND (m.id IS NULL OR m.reference_type IS NULL
         OR m.reference_type NOT IN ('purchase_order','po','goods_receipt'));

  v_diff := v_gl - v_layers;
  RETURN jsonb_build_object(
    'success', true,
    'gl_1460_cents', v_gl,
    'layers_value_cents', v_layers,
    'difference_cents', v_diff,
    'unbooked_receipt_value_cents', v_unbooked,
    'reconciled', (v_diff + v_unbooked) = 0 OR v_diff = 0,
    'explanation', CASE
      WHEN v_diff = 0 THEN 'GL 1460 ties out to the valuation layers exactly.'
      WHEN (v_diff + v_unbooked) = 0 THEN 'Difference fully explained by receipts that post no GL (manual/MO receipts create layers but only purchase receipts post Dt 1460).'
      ELSE 'Unexplained difference — investigate journal entries on 1460 vs stock_valuation_layers (e.g. manual journals, deleted layers, period locks that skipped COGS).'
    END);
END $$;
ALTER FUNCTION "public"."inventory_gl_reconciliation"() OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."inventory_gl_reconciliation"() TO "anon", "authenticated", "service_role";
