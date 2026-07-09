-- 20260709000000: Robustness-review support RPCs
CREATE OR REPLACE FUNCTION public.increment_template_usage(p_template_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  UPDATE public.accounting_templates
  SET usage_count = COALESCE(usage_count, 0) + 1, updated_at = now()
  WHERE id = p_template_id;
$$;

CREATE OR REPLACE FUNCTION public.booked_counterparty_counts()
RETURNS TABLE(counterparty text, cnt bigint)
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT bt.counterparty, count(*)::bigint AS cnt
  FROM public.bank_transactions bt
  WHERE bt.journal_entry_id IS NOT NULL AND bt.counterparty IS NOT NULL
  GROUP BY bt.counterparty;
$$;

-- 20260709001000: B-round agent-admin RPCs
CREATE OR REPLACE FUNCTION public.manage_subscription_plan(
  p_action text, p_plan_id uuid DEFAULT NULL, p_name text DEFAULT NULL,
  p_description text DEFAULT NULL, p_product_name text DEFAULT NULL,
  p_unit_amount_cents integer DEFAULT NULL, p_currency text DEFAULT NULL,
  p_billing_interval text DEFAULT NULL, p_billing_interval_count integer DEFAULT NULL,
  p_trial_days integer DEFAULT NULL, p_commitment_months integer DEFAULT NULL,
  p_features jsonb DEFAULT NULL, p_is_active boolean DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_row subscription_plans; v_id uuid;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admins can manage subscription plans';
  END IF;
  IF p_action = 'list' THEN
    RETURN jsonb_build_object('plans', coalesce((SELECT jsonb_agg(to_jsonb(sp) ORDER BY sp.name) FROM subscription_plans sp), '[]'::jsonb));
  ELSIF p_action = 'get' THEN
    SELECT * INTO v_row FROM subscription_plans WHERE id = p_plan_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Plan % not found', p_plan_id; END IF;
    RETURN to_jsonb(v_row);
  ELSIF p_action = 'create' THEN
    IF p_name IS NULL OR p_unit_amount_cents IS NULL THEN
      RAISE EXCEPTION 'create requires p_name and p_unit_amount_cents';
    END IF;
    INSERT INTO subscription_plans (name, description, product_name, unit_amount_cents, currency, billing_interval, billing_interval_count, trial_days, commitment_months, features, is_active)
    VALUES (p_name, p_description, coalesce(p_product_name, p_name), p_unit_amount_cents, coalesce(p_currency,'SEK'), coalesce(p_billing_interval,'month'), coalesce(p_billing_interval_count,1), coalesce(p_trial_days,0), coalesce(p_commitment_months,0), coalesce(p_features,'[]'::jsonb), coalesce(p_is_active,true))
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('created', true, 'plan_id', v_id);
  ELSIF p_action = 'update' THEN
    UPDATE subscription_plans SET
      name = coalesce(p_name, name), description = coalesce(p_description, description),
      product_name = coalesce(p_product_name, product_name),
      unit_amount_cents = coalesce(p_unit_amount_cents, unit_amount_cents),
      currency = coalesce(p_currency, currency), billing_interval = coalesce(p_billing_interval, billing_interval),
      billing_interval_count = coalesce(p_billing_interval_count, billing_interval_count),
      trial_days = coalesce(p_trial_days, trial_days), commitment_months = coalesce(p_commitment_months, commitment_months),
      features = coalesce(p_features, features), is_active = coalesce(p_is_active, is_active), updated_at = now()
    WHERE id = p_plan_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Plan % not found', p_plan_id; END IF;
    RETURN jsonb_build_object('updated', true, 'plan_id', p_plan_id);
  ELSIF p_action = 'deactivate' THEN
    UPDATE subscription_plans SET is_active = false, updated_at = now() WHERE id = p_plan_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Plan % not found', p_plan_id; END IF;
    RETURN jsonb_build_object('deactivated', true, 'plan_id', p_plan_id);
  END IF;
  RAISE EXCEPTION 'Unknown action %. Use list|get|create|update|deactivate', p_action;
END; $$;

CREATE OR REPLACE FUNCTION public.manage_email_template(
  p_action text, p_template_id uuid DEFAULT NULL, p_name text DEFAULT NULL,
  p_subject text DEFAULT NULL, p_html text DEFAULT NULL, p_text text DEFAULT NULL,
  p_category text DEFAULT NULL, p_variables jsonb DEFAULT NULL, p_active boolean DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admins can manage email templates';
  END IF;
  IF p_action = 'list' THEN
    RETURN jsonb_build_object('templates', coalesce((SELECT jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'subject',t.subject,'category',t.category,'active',t.active) ORDER BY t.name) FROM email_templates t), '[]'::jsonb));
  ELSIF p_action = 'get' THEN
    RETURN (SELECT to_jsonb(t) FROM email_templates t WHERE id = p_template_id);
  ELSIF p_action = 'create' THEN
    IF p_name IS NULL OR p_subject IS NULL THEN RAISE EXCEPTION 'create requires p_name and p_subject'; END IF;
    INSERT INTO email_templates (name, subject, html, text, category, variables, active)
    VALUES (p_name, p_subject, p_html, p_text, coalesce(p_category,'general'), coalesce(p_variables,'[]'::jsonb), coalesce(p_active,true))
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('created', true, 'template_id', v_id);
  ELSIF p_action = 'update' THEN
    UPDATE email_templates SET name=coalesce(p_name,name), subject=coalesce(p_subject,subject),
      html=coalesce(p_html,html), text=coalesce(p_text,text), category=coalesce(p_category,category),
      variables=coalesce(p_variables,variables), active=coalesce(p_active,active), updated_at=now()
    WHERE id = p_template_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Template % not found', p_template_id; END IF;
    RETURN jsonb_build_object('updated', true, 'template_id', p_template_id);
  ELSIF p_action = 'delete' THEN
    DELETE FROM email_templates WHERE id = p_template_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Template % not found', p_template_id; END IF;
    RETURN jsonb_build_object('deleted', true);
  END IF;
  RAISE EXCEPTION 'Unknown action %. Use list|get|create|update|delete', p_action;
END; $$;

CREATE OR REPLACE FUNCTION public.manage_contract_obligation(
  p_action text, p_obligation_id uuid DEFAULT NULL, p_contract_id uuid DEFAULT NULL,
  p_description text DEFAULT NULL, p_due_date date DEFAULT NULL,
  p_status text DEFAULT NULL, p_responsible text DEFAULT NULL, p_notes text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admins can manage contract obligations';
  END IF;
  IF p_action = 'list' THEN
    RETURN jsonb_build_object('obligations', coalesce((SELECT jsonb_agg(to_jsonb(o) ORDER BY o.due_date NULLS LAST) FROM contract_obligations o WHERE (p_contract_id IS NULL OR o.contract_id = p_contract_id)), '[]'::jsonb));
  ELSIF p_action = 'create' THEN
    IF p_contract_id IS NULL OR p_description IS NULL THEN RAISE EXCEPTION 'create requires p_contract_id and p_description'; END IF;
    INSERT INTO contract_obligations (contract_id, description, due_date, status, responsible, notes)
    VALUES (p_contract_id, p_description, p_due_date, coalesce(p_status,'pending'), p_responsible, p_notes)
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('created', true, 'obligation_id', v_id);
  ELSIF p_action = 'update' THEN
    UPDATE contract_obligations SET description=coalesce(p_description,description),
      due_date=coalesce(p_due_date,due_date), status=coalesce(p_status,status),
      responsible=coalesce(p_responsible,responsible), notes=coalesce(p_notes,notes),
      met_at = CASE WHEN p_status = 'met' THEN now() ELSE met_at END, updated_at=now()
    WHERE id = p_obligation_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Obligation % not found', p_obligation_id; END IF;
    RETURN jsonb_build_object('updated', true, 'obligation_id', p_obligation_id);
  ELSIF p_action = 'delete' THEN
    DELETE FROM contract_obligations WHERE id = p_obligation_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Obligation % not found', p_obligation_id; END IF;
    RETURN jsonb_build_object('deleted', true);
  END IF;
  RAISE EXCEPTION 'Unknown action %. Use list|create|update|delete', p_action;
END; $$;

CREATE OR REPLACE FUNCTION public.manage_document_share_link(
  p_action text, p_link_id uuid DEFAULT NULL, p_document_id uuid DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL, p_permissions text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_row document_share_links;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admins can manage document share links';
  END IF;
  IF p_action = 'list' THEN
    RETURN jsonb_build_object('links', coalesce((SELECT jsonb_agg(jsonb_build_object('id',l.id,'document_id',l.document_id,'token',l.token,'expires_at',l.expires_at,'permissions',l.permissions,'revoked_at',l.revoked_at,'access_count',l.access_count) ORDER BY l.created_at DESC) FROM document_share_links l WHERE (p_document_id IS NULL OR l.document_id = p_document_id)), '[]'::jsonb));
  ELSIF p_action = 'create' THEN
    IF p_document_id IS NULL THEN RAISE EXCEPTION 'create requires p_document_id'; END IF;
    IF NOT EXISTS (SELECT 1 FROM documents WHERE id = p_document_id) THEN
      RAISE EXCEPTION 'Document % not found', p_document_id;
    END IF;
    INSERT INTO document_share_links (document_id, expires_at, permissions)
    VALUES (p_document_id, p_expires_at, coalesce(p_permissions,'view'))
    RETURNING * INTO v_row;
    RETURN jsonb_build_object('created', true, 'link_id', v_row.id, 'token', v_row.token, 'expires_at', v_row.expires_at, 'permissions', v_row.permissions);
  ELSIF p_action = 'revoke' THEN
    UPDATE document_share_links SET revoked_at = now() WHERE id = p_link_id AND revoked_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'Link % not found or already revoked', p_link_id; END IF;
    RETURN jsonb_build_object('revoked', true, 'link_id', p_link_id);
  END IF;
  RAISE EXCEPTION 'Unknown action %. Use list|create|revoke', p_action;
END; $$;

CREATE OR REPLACE FUNCTION public.list_quote_revisions(p_quote_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT jsonb_build_object('revisions', coalesce(jsonb_agg(
    jsonb_build_object('id', r.id, 'revision_number', r.revision_number, 'reason', r.reason,
      'prev_total_cents', r.prev_total_cents, 'new_total_cents', r.new_total_cents,
      'amount_delta_cents', r.amount_delta_cents, 'created_at', r.created_at)
    ORDER BY r.revision_number DESC), '[]'::jsonb))
  FROM quote_revisions r WHERE r.quote_id = p_quote_id;
$$;