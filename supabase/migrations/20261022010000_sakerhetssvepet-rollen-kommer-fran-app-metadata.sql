-- Security sweep 2026-10-22 — the database half.
--
-- Verified live on sandbox before this migration (an authorised probe, the
-- accounts deleted afterwards):
--   * POST /auth/v1/signup with `data: { signup_type: 'admin' }` returned a
--     session whose user_roles row was ADMIN, and read 18 leads and the whole
--     site_settings table. 20260726190000 made the default fail closed, but it
--     still read raw_user_meta_data — the caller's own JSON. The only field a
--     visitor cannot write is raw_app_meta_data (service role only).
--   * A plain self-registered customer read `employees` (personal numbers,
--     salaries) and every `profiles` row: a hundred SELECT policies say
--     `TO authenticated USING (true)`, written when "authenticated" meant staff.
--     The customer portal made it mean the public.
--   * anon could execute register_visitor_intent_trigger(url, token): rewires a
--     SECURITY DEFINER trigger on leads to POST every new lead to a chosen host.
--   * anon could read every quote_items row (the "via token" policy compared no
--     token) and insert quote_signatures for any sent quote.
--   * Any logged-in user could run assign_lead / assign_company /
--     crm_followup_report / _resolve_profile — CRM writes meant for the agent.
--   * cms-images / river-media: any logged-in customer could upload, replace or
--     delete the site's images. documents: upload into anyone's folder.
--   * audit_logs: any logged-in user could forge audit rows.
--   * get_order_status(id) returned a customer's name and email with no email.
--   * beta_test_* (agent QA transcripts) readable by anon.
--
-- Everything here is idempotent. Policies are replaced by name; functions by
-- CREATE OR REPLACE; grants restated.

-- ── 1. The role request comes from app_metadata ─────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  signup_type text;
  v_admin_count integer;
BEGIN
  -- Fail CLOSED. The role request lives in app_metadata: GoTrue lets only the
  -- service role write it (admin createUser `app_metadata`), while
  -- user_metadata is whatever the client sends to the public signup endpoint.
  signup_type := COALESCE(NEW.raw_app_meta_data ->> 'signup_type', 'customer');

  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email)
  )
  ON CONFLICT (id) DO NOTHING;

  -- Serialise the virgin-instance check so a race can't mint two admins.
  PERFORM pg_advisory_xact_lock(hashtext('handle_new_user:first_admin'));
  SELECT count(*) INTO v_admin_count FROM public.user_roles WHERE role = 'admin';

  IF v_admin_count = 0 THEN
    -- Virgin instance: the first account is the operator. Claim admin, and the
    -- window closes here.
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSIF signup_type = 'admin' THEN
    -- Reached only when a provisioning path (service role) asks for it by name.
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSIF signup_type = 'employee' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'writer')
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    -- 'customer', anything unrecognised, and anything absent.
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'customer')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

-- ── 2. The visitor-intent trigger installer is an operator's tool ───────────
REVOKE ALL ON FUNCTION public.register_visitor_intent_trigger(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_visitor_intent_trigger(text, text) TO service_role;

-- ── 3. Agent-only CRM functions: the service role calls them, nobody else ────
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.assign_lead(text, text)',
    'public.assign_company(text, text)',
    'public.crm_followup_report(integer)',
    'public._resolve_profile(text)'
  ] LOOP
    IF to_regprocedure(f) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
    END IF;
  END LOOP;
END $$;

-- ── 4. Quotes: the token is the key, on the server ──────────────────────────
DROP POLICY IF EXISTS "Public can view items via quote token" ON public.quote_items;
REVOKE SELECT ON public.quote_items FROM anon;
DROP POLICY IF EXISTS "Public can insert signature via token" ON public.quote_signatures;
REVOKE INSERT ON public.quote_signatures FROM anon;

-- The public page still records "viewed", through the token it holds.
CREATE OR REPLACE FUNCTION public.mark_quote_viewed_by_token(p_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) < 16 THEN RETURN false; END IF;
  SELECT id INTO v_id FROM public.quotes
   WHERE accept_token = trim(p_token) AND status::text = 'sent';
  IF v_id IS NULL THEN RETURN false; END IF;
  INSERT INTO public.quote_signatures (quote_id, action, user_agent)
  VALUES (v_id, 'view', left(coalesce(current_setting('request.headers', true)::json ->> 'user-agent', ''), 400));
  UPDATE public.quotes SET status = 'viewed', viewed_at = now() WHERE id = v_id AND status::text = 'sent';
  RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION public.mark_quote_viewed_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_quote_viewed_by_token(text) TO anon, authenticated, service_role;

-- ── 4b. Consultants: the public site matches through consultant-match (server
-- side); nothing on the public side reads the table, so an anon visitor has no
-- business with email, phone and hourly_rate.
DROP POLICY IF EXISTS "Public can view active profiles" ON public.consultant_profiles;
REVOKE SELECT ON public.consultant_profiles FROM anon;

-- ── 5. Agent QA transcripts are internal ────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['beta_test_sessions', 'beta_test_findings', 'beta_test_exchanges'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Allow anon select on ' || t, t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Allow authenticated read on ' || t, t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Staff read ' || t, t);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_staff(auth.uid()))', 'Staff read ' || t, t);
      EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    END IF;
  END LOOP;
END $$;

-- ── 6. "Authenticated" is not "staff": internal tables read by staff only ───
-- Each row: table, the open policy's name. The replacement keeps the name so a
-- later migration that drops it by name still finds it.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('employees',                    'Authenticated users can view employees'),
    ('employee_documents',           'Authenticated users can view employee documents'),
    ('leave_requests',               'Authenticated users can view leave requests'),
    ('onboarding_checklists',        'Authenticated users can view onboarding checklists'),
    ('onboarding_templates',         'Authenticated can view onboarding templates'),
    ('employment_contract_templates','Authenticated view contract templates'),
    ('vacation_policies',            'Authenticated read vacation policies'),
    ('expense_rate_tables',          'Authenticated view expense_rate_tables'),
    ('journal_entry_lines',          'Authenticated users can read journal entry lines'),
    ('journal_entry_line_taxes',     'jelt_read_auth'),
    ('journal_entry_documents',      'staff read journal_entry_documents'),
    ('journals',                     'Authenticated can read journals'),
    ('opening_balances',             'Authenticated users can read opening balances'),
    ('payment_reconciliations',      'payrec_read_auth'),
    ('accounting_periods',           'Authenticated can read accounting periods'),
    ('accounting_templates',         'Authenticated users can read accounting templates'),
    ('account_roles',                'Authenticated users can read account roles'),
    ('account_statement_sections',   'Authenticated users can read statement sections'),
    ('account_tax_boxes',            'staff read account_tax_boxes'),
    ('chart_of_accounts',            'Authenticated users can read chart of accounts'),
    ('analytic_accounts',            'Authenticated read analytic_accounts'),
    ('analytic_lines',               'Authenticated read analytic_lines'),
    ('agent_memory',                 'Authenticated can view agent memory'),
    ('agent_automations',            'Authenticated can view automations'),
    ('agent_objectives',             'Authenticated can view objectives'),
    ('autonomy_test_runs',           'Authenticated users can read test runs'),
    ('approval_requests',            'Authenticated read approval requests'),
    ('approval_decisions',           'Authenticated read decisions'),
    ('approval_rules',               'Authenticated read approval rules'),
    ('activities',                   'Authenticated read activities'),
    ('crm_tasks',                    'Authenticated users can view tasks'),
    ('deal_history',                 'deal_history read'),
    ('deal_team_members',            'deal_team_members read'),
    ('deal_teams',                   'deal_teams read'),
    ('deal_templates',               'deal_templates read'),
    ('content_proposals',            'Authenticated users can view content proposals'),
    ('content_research',             'Users can view all research'),
    ('inbound_email_accounts',       'Authenticated users can read inbound email accounts'),
    ('voicemail_messages',           'voicemail_admin_read'),
    ('ad_campaigns',                 'Authenticated can view ad campaigns'),
    ('ad_creatives',                 'Authenticated can view ad creatives'),
    ('bom_headers',                  'Authenticated can view BOM headers'),
    ('bom_lines',                    'Authenticated can view BOM lines'),
    ('manufacturing_orders',         'Authenticated can view MOs'),
    ('mo_components',                'Authenticated can view MO components'),
    ('inventory_receipts',           'Authenticated view receipts'),
    ('inventory_receipt_lines',      'Authenticated view receipt lines'),
    ('inventory_transfers',          'Authenticated view transfers'),
    ('inventory_transfer_lines',     'Authenticated view transfer lines'),
    ('stock_lots',                   'Authenticated can view lots'),
    ('stock_moves',                  'Authenticated users can view stock moves'),
    ('stock_quants',                 'Authenticated can view quants'),
    ('stock_reservations',           'Authenticated can view reservations'),
    ('product_stock',                'Authenticated users can view stock'),
    ('procurement_suggestions',      'Authenticated can view suggestions'),
    ('purchase_order_revisions',     'Authenticated read PO revisions'),
    ('reorder_rules',                'Authenticated can view reorder rules'),
    ('pos_registers',                'auth_read_pos_registers'),
    ('pages',                        'All authenticated users can view pages'),
    ('page_versions',                'All authenticated can view versions'),
    ('global_blocks',                'Authenticated can view all global blocks'),
    ('blog_posts',                   'Authenticated can view all posts'),
    ('handbook_chapters',            'Authenticated users can read handbook chapters'),
    ('river_posts',                  'river_posts read authed'),
    ('river_reactions',              'river_reactions read authed'),
    ('ownership_delegations',        'Coverage is visible to colleagues'),
    ('entity_followers',             'followers read auth'),
    ('entity_tags',                  'entity_tags_authenticated_read'),
    ('tags',                         'tags_authenticated_read'),
    ('document_number_counters',     'read counters'),
    ('skills_catalog',               'skills_catalog read'),
    ('trash_sources',                'trash_sources readable')
  ) AS v(tbl, pol) LOOP
    IF to_regclass('public.' || r.tbl) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.pol, r.tbl);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_staff(auth.uid()))', r.pol, r.tbl);
    END IF;
  END LOOP;
END $$;

-- profiles: your own row, or staff see colleagues. Public author columns stay
-- on profiles_public.
DROP POLICY IF EXISTS "Authenticated users can view all profiles" ON public.profiles;
CREATE POLICY "Authenticated users can view all profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_staff(auth.uid()));

-- ── 7. Audit rows are written by staff and the platform, not forged ─────────
DROP POLICY IF EXISTS "Authenticated can create audit logs" ON public.audit_logs;
CREATE POLICY "Authenticated can create audit logs" ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

-- ── 8. Storage: the site's images and media are staff's to change ───────────
-- Not here: storage.* DDL outside the fresh-install finalizer races the storage
-- service's own migrator at project birth (SQLSTATE 40P01), so the five write
-- policies (cms-images insert/update/delete, river-media upload, documents
-- upload into your own folder) are tightened IN the finalizer for fresh
-- installs, and applied to every live instance by hand — the SQL is in
-- docs/security/scan-2026-10-22.md.

-- ── 9. Order status needs the customer's email ──────────────────────────────
CREATE OR REPLACE FUNCTION public.get_order_status(p_id uuid, p_email text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_items jsonb;
  v_is_sandbox boolean;
BEGIN
  -- Guest lookup: the email is the second factor. An id alone (a receipt URL,
  -- a log line) must not return a customer's name and address.
  IF p_email IS NULL OR trim(p_email) = '' THEN
    RETURN jsonb_build_object('error', 'Order not found');
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_id;
  IF NOT FOUND OR lower(coalesce(v_order.customer_email, '')) <> lower(trim(p_email)) THEN
    RETURN jsonb_build_object('error', 'Order not found');
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', oi.id, 'product_name', oi.product_name, 'quantity', oi.quantity, 'price_cents', oi.price_cents
  )), '[]'::jsonb) INTO v_items
  FROM public.order_items oi WHERE oi.order_id = p_id;

  v_is_sandbox := coalesce((v_order.metadata->>'sandbox')::boolean, false);

  RETURN jsonb_build_object(
    'order', jsonb_build_object(
      'id', v_order.id, 'status', v_order.status, 'total_cents', v_order.total_cents, 'currency', v_order.currency,
      'customer_name', v_order.customer_name, 'customer_email', v_order.customer_email,
      'created_at', v_order.created_at, 'updated_at', v_order.updated_at, 'sandbox', v_is_sandbox
    ),
    'items', v_items
  );
END;
$function$;

-- Same audience as before: the public order-status lookup, now with the email as key.
REVOKE ALL ON FUNCTION public.get_order_status(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_order_status(uuid, text) TO anon, authenticated, service_role;

-- ── 10. A visitor writes into their OWN chat conversation ───────────────────
DROP POLICY IF EXISTS "Users can create messages in own conversations" ON public.chat_messages;
CREATE POLICY "Users can create messages in own conversations" ON public.chat_messages
  FOR INSERT TO public
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.chat_conversations c
    WHERE c.id = chat_messages.conversation_id
      AND (
        (c.user_id IS NOT NULL AND c.user_id = auth.uid())
        OR (c.session_id IS NOT NULL
            AND c.session_id = NULLIF(((current_setting('request.headers', true))::json ->> 'x-chat-session'), ''))
      )
  ));
