-- Rollsvep 5: den parallella ratten.
--
-- Matrisen (role_module_access) är enda ratten — det var rollsvep #102 och 4.
-- Men 150 policies på live-schemat räknade fortfarande upp roller för
-- hand: has_role(…, 'sales') OR has_role(…, 'support') … En
-- andra ratt som matrisen aldrig når: operatören ger sales analytics, navet
-- öppnas, datan förblir stängd, ingen felrad (analytics 2026-09-02, #433).
--
-- Det här svepet tar de 49 policies som namnger FUNKTIONELLA roller
-- (accounting, hr, support, sales, warehouse, marketing, purchasing) och byter
-- rollistan mot can_access_module(auth.uid(), '<modul>'). Två regler håller
-- åtkomsten oförändrad medan ratten byts:
--
--   1. Varje (roll, modul)-par som en handrullad policy gav blir en matrisrad
--      — i defaults (för nya instanser) och i den levande tabellen WHERE NOT
--      EXISTS (för befintliga). Ingen roll förlorar något; operatören kan nu
--      i stället TA BORT det via matrisen, vilket hen aldrig kunde förut.
--   2. Policynamnen behålls (DROP IF EXISTS + CREATE) och admin-policierna
--      står kvar; can_access_module innehåller admin ändå.
--
-- Utanför svepet, med avsikt: policies som bara namnger legacy-rollerna
-- writer/approver (behandlas som admin — annan klass), policies för
-- basrollen employee (bredare än en modul), och villkor som blandar roll
-- med radägarskap. Vakten no-new-hand-rolled-role-policies hindrar nya.

-- ── 1. Matrisen får de par som policierna gav för hand ────────────────────
INSERT INTO public.role_module_access_defaults (role, module_id) VALUES
  ('accounting', 'accounting'),
  ('accounting', 'expenses'),
  ('accounting', 'invoicing'),
  ('accounting', 'purchasing'),
  ('accounting', 'reconciliation'),
  ('accounting', 'subscriptions'),
  ('accounting', 'timesheets'),
  ('hr', 'hr'),
  ('hr', 'payroll'),
  ('hr', 'recruitment'),
  ('marketing', 'email'),
  ('purchasing', 'accounting'),
  ('purchasing', 'purchasing'),
  ('purchasing', 'returns'),
  ('sales', 'email'),
  ('sales', 'fieldService'),
  ('sales', 'pricelists'),
  ('sales', 'shipping'),
  ('support', 'email'),
  ('support', 'fieldService'),
  ('support', 'returns'),
  ('warehouse', 'inventory'),
  ('warehouse', 'returns'),
  ('warehouse', 'shipping')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_module_access (role, module_id)
SELECT d.role, d.module_id FROM (VALUES
  ('accounting'::app_role, 'accounting'),
  ('accounting'::app_role, 'expenses'),
  ('accounting'::app_role, 'invoicing'),
  ('accounting'::app_role, 'purchasing'),
  ('accounting'::app_role, 'reconciliation'),
  ('accounting'::app_role, 'subscriptions'),
  ('accounting'::app_role, 'timesheets'),
  ('hr'::app_role, 'hr'),
  ('hr'::app_role, 'payroll'),
  ('hr'::app_role, 'recruitment'),
  ('marketing'::app_role, 'email'),
  ('purchasing'::app_role, 'accounting'),
  ('purchasing'::app_role, 'purchasing'),
  ('purchasing'::app_role, 'returns'),
  ('sales'::app_role, 'email'),
  ('sales'::app_role, 'fieldService'),
  ('sales'::app_role, 'pricelists'),
  ('sales'::app_role, 'shipping'),
  ('support'::app_role, 'email'),
  ('support'::app_role, 'fieldService'),
  ('support'::app_role, 'returns'),
  ('warehouse'::app_role, 'inventory'),
  ('warehouse'::app_role, 'returns'),
  ('warehouse'::app_role, 'shipping')
) AS d(role, module_id)
WHERE NOT EXISTS (
  SELECT 1 FROM public.role_module_access r WHERE r.role = d.role AND r.module_id = d.module_id
);

-- ── 2. Policierna läser matrisen ──────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.accounting_corrections') IS NOT NULL THEN
    EXECUTE $q$DROP POLICY IF EXISTS "Accounting can read accounting_corrections" ON public.accounting_corrections$q$;
    EXECUTE $q$CREATE POLICY "Accounting can read accounting_corrections" ON public.accounting_corrections FOR SELECT TO authenticated USING (public.can_access_module(auth.uid(), 'accounting'))$q$;
  END IF;
  IF to_regclass('public.application_stages') IS NOT NULL THEN
    EXECUTE $q$DROP POLICY IF EXISTS "HR can read application_stages" ON public.application_stages$q$;
    EXECUTE $q$CREATE POLICY "HR can read application_stages" ON public.application_stages FOR SELECT TO authenticated USING (public.can_access_module(auth.uid(), 'recruitment'))$q$;
  END IF;
  IF to_regclass('public.applications') IS NOT NULL THEN
    EXECUTE $q$DROP POLICY IF EXISTS "HR can read applications" ON public.applications$q$;
    EXECUTE $q$CREATE POLICY "HR can read applications" ON public.applications FOR SELECT TO authenticated USING (public.can_access_module(auth.uid(), 'recruitment'))$q$;
  END IF;
  IF to_regclass('public.bank_accounts') IS NOT NULL THEN
    EXECUTE $q$DROP POLICY IF EXISTS "Accounting can read bank_accounts" ON public.bank_accounts$q$;
    EXECUTE $q$CREATE POLICY "Accounting can read bank_accounts" ON public.bank_accounts FOR SELECT TO authenticated USING (public.can_access_module(auth.uid(), 'reconciliation'))$q$;
  END IF;
  IF to_regclass('public.bank_feed_connections') IS NOT NULL THEN
    EXECUTE $q$DROP POLICY IF EXISTS "Accounting can read bank_feed_connections" ON public.bank_feed_connections$q$;
    EXECUTE $q$CREATE POLICY "Accounting can read bank_feed_connections" ON public.bank_feed_connections FOR SELECT TO authenticated USING (public.can_access_module(auth.uid(), 'reconciliation'))$q$;
  END IF;
  IF to_regclass('public.bank_import_batches') IS NOT NULL THEN
    EXECUTE $q$DROP POLICY IF EXISTS "Accounting can read bank_import_batches" ON public.bank_import_batches$q$;
    EXECUTE $q$CREATE POLICY "Accounting can read bank_import_batches" ON public.bank_import_batches FOR SELECT TO authenticated USING (public.can_access_module(auth.uid(), 'reconciliation'))$q$;
  END IF;
  IF to_regclass('public.bank_transactions') IS NOT NULL THEN
    EXECUTE $q$DROP POLICY IF EXISTS "Accounting can read bank_transactions" ON public.bank_transactions$q$;
    EXECUTE $q$CREATE POLICY "Accounting can read bank_transactions" ON public.bank_transactions FOR SELECT TO authenticated USING (public.can_access_module(auth.uid(), 'reconciliation'))$q$;
  END IF;
  IF to_regclass('public.benefit_plans') IS NOT NULL THEN
    EXECUTE $q$DROP POLICY IF EXISTS "HR can read benefit_plans" ON public.benefit_plans$q$;
    EXECUTE $q$CREATE POLICY "HR can read benefit_plans" ON public.benefit_plans FOR SELECT TO authenticated USING (public.can_access_module(auth.uid(), 'hr'))$q$;
  END IF;
  IF to_regclass('public.budgets') IS NOT NULL THEN
    EXECUTE $q$DROP POLICY IF EXISTS "Accounting can read budgets" ON public.budgets$q$;
    EXECUTE $q$CREATE POLICY "Accounting can read budgets" ON public.budgets FOR SELECT TO authenticated USING (public.can_access_module(auth.uid(), 'accounting'))$q$;
  END IF;
  IF to_regclass('public.candidate_assessments') IS NOT NULL THEN
    EXECUTE $q$DROP POLICY IF EXISTS "HR can read candidate_assessments" ON public.candidate_assessments$q$;
    EXECUTE $q$CREATE POLICY "HR can read candidate_assessments" ON public.candidate_assessments FOR SELECT TO authenticated USING (public.can_access_module(auth.uid(), 'recruitment'))$q$;
  END IF;
  IF to_regclass('public.candidate_notes') IS NOT NULL THEN
    EXECUTE $q$DROP POLICY IF EXISTS "HR can read candidate_notes" ON public.candidate_notes$q$;
    EXECUTE $q$CREATE POLICY "HR can read candidate_notes" ON public.candidate_notes FOR SELECT TO authenticated USING (public.can_access_module(auth.uid(), 'recruitment'))$q$;
  END IF;
  IF to_regclass('public.carriers') IS NOT NULL THEN
    EXECUTE $q$DROP POLICY IF EXISTS "Admins manage carriers" ON public.carriers$q$;
    EXECUTE $q$CREATE POLICY "Admins manage carriers" ON public.carriers FOR ALL TO authenticated USING (public.can_access_module(auth.uid(), 'shipping')) WITH CHECK (public.can_access_module(auth.uid(), 'shipping'))$q$;
  END IF;
  IF to_regclass('public.disciplinary_actions') IS NOT NULL THEN
    EXECUTE $q$DROP POLICY IF EXISTS "HR can read disciplinary_actions" ON public.disciplinary_actions$q$;
    EXECUTE $q$CREATE POLICY "HR can read disciplinary_actions" ON public.disciplinary_actions FOR SELECT TO authenticated USING (public.can_access_module(auth.uid(), 'hr'))$q$;
  END IF;
  IF to_regclass('public.dunning_actions') IS NOT NULL THEN
    EXECUTE $q$DROP POLICY IF EXISTS "Accounting can read dunning_actions" ON public.dunning_actions$q$;
    EXECUTE $q$CREATE POLICY "Accounting can read dunning_actions" ON public.dunning_actions FOR SELECT TO authenticated USING (public.can_access_module(auth.uid(), 'invoicing'))$q$;
  END IF;
  IF to_regclass('public.dunning_sequences') IS NOT NULL THEN
    EXECUTE $q$DROP POLICY IF EXISTS "Accounting can read dunning_sequences" ON public.dunning_sequences$q$;
    EXECUTE $q$CREATE POLICY "Accounting can read dunning_sequences" ON public.dunning_sequences FOR SELECT TO authenticated USING (public.can_access_module(auth.uid(), 'invoicing'))$q$;
  END IF;
  IF to_regclass('public.email_events') IS NOT NULL THEN
    EXECUTE $q$DROP POLICY IF EXISTS "email_events staff read" ON public.email_events$q$;
    EXECUTE $q$CREATE POLICY "email_events staff read" ON public.email_events FOR SELECT TO authenticated USING (public.can_access_module(auth.uid(), 'email'))$q$;
  END IF;
  IF to_regclass('public.email_suppressions') IS NOT NULL THEN
    EXECUTE $q$DROP POLICY IF EXISTS "email_suppressions staff" ON public.email_suppressions$q$;
    EXECUTE $q$CREATE POLICY "email_suppressions staff" ON public.email_suppressions FOR ALL TO authenticated USING (public.can_access_module(auth.uid(), 'email')) WITH CHECK (public.can_access_module(auth.uid(), 'email'))$q$;
  END IF;
  IF to_regclass('public.email_templates') IS NOT NULL THEN
    EXECUTE $q$DROP POLICY IF EXISTS "email_templates staff" ON public.email_templates$q$;
    EXECUTE $q$CREATE POLICY "email_templates staff" ON public.email_templates FOR ALL TO authenticated USING (public.can_access_module(auth.uid(), 'email')) WITH CHECK (public.can_access_module(auth.uid(), 'email'))$q$;
  END IF;
  IF to_regclass('public.email_threads') IS NOT NULL THEN
    EXECUTE $q$DROP POLICY IF EXISTS "email_threads staff" ON public.email_threads$q$;
    EXECUTE $q$CREATE POLICY "email_threads staff" ON public.email_threads FOR ALL TO authenticated USING (public.can_access_module(auth.uid(), 'email')) WITH CHECK (public.can_access_module(auth.uid(), 'email'))$q$;
  END IF;
  IF to_regclass('public.expense_policies') IS NOT NULL THEN
    EXECUTE $q$DROP POLICY IF EXISTS "Accounting can read expense_policies" ON public.expense_policies$q$;
    EXECUTE $q$CREATE POLICY "Accounting can read expense_policies" ON public.expense_policies FOR SELECT TO authenticated USING (public.can_access_module(auth.uid(), 'expenses'))$q$;
  END IF;
  IF to_regclass('public.interviews') IS NOT NULL THEN
    EXECUTE $q$DROP POLICY IF EXISTS "HR can read interviews" ON public.interviews$q$;
    EXECUTE $q$CREATE POLICY "HR can read interviews" ON public.interviews FOR SELECT TO authenticated USING (public.can_access_module(auth.uid(), 'recruitment'))$q$;
  END IF;
  IF to_regclass('public.inventory_receipt_lines') IS NOT NULL THEN
    EXECUTE $q$DROP POLICY IF EXISTS "Writers manage receipt lines" ON public.inventory_receipt_lines$q$;
    EXECUTE $q$CREATE POLICY "Writers manage receipt lines" ON public.inventory_receipt_lines FOR ALL TO authenticated USING (public.can_access_module(auth.uid(), 'inventory')) WITH CHECK (public.can_access_module(auth.uid(), 'inventory'))$q$;
  END IF;
  IF to_regclass('public.inventory_receipts') IS NOT NULL THEN
    EXECUTE $q$DROP POLICY IF EXISTS "Writers manage receipts" ON public.inventory_receipts$q$;
    EXECUTE $q$CREATE POLICY "Writers manage receipts" ON public.inventory_receipts FOR ALL TO authenticated USING (public.can_access_module(auth.uid(), 'inventory')) WITH CHECK (public.can_access_module(auth.uid(), 'inventory'))$q$;
  END IF;
  IF to_regclass('public.inventory_transfer_lines') IS NOT NULL THEN
    EXECUTE $q$DROP POLICY IF EXISTS "Writers manage transfer lines" ON public.inventory_transfer_lines$q$;
    EXECUTE $q$CREATE POLICY "Writers manage transfer lines" ON public.inventory_transfer_lines FOR ALL TO authenticated USING (public.can_access_module(auth.uid(), 'inventory')) WITH CHECK (public.can_access_module(auth.uid(), 'inventory'))$q$;
  END IF;
  IF to_regclass('public.inventory_transfers') IS NOT NULL THEN
    EXECUTE $q$DROP POLICY IF EXISTS "Writers manage transfers" ON public.inventory_transfers$q$;
    EXECUTE $q$CREATE POLICY "Writers manage transfers" ON public.inventory_transfers FOR ALL TO authenticated USING (public.can_access_module(auth.uid(), 'inventory')) WITH CHECK (public.can_access_module(auth.uid(), 'inventory'))$q$;
  END IF;
  IF to_regclass('public.invoice_dunning_actions') IS NOT NULL THEN
    EXECUTE $q$DROP POLICY IF EXISTS "Accounting can read invoice dunning actions" ON public.invoice_dunning_actions$q$;
    EXECUTE $q$CREATE POLICY "Accounting can read invoice dunning actions" ON public.invoice_dunning_actions FOR SELECT TO authenticated USING (public.can_access_module(auth.uid(), 'invoicing'))$q$;
  END IF;
  IF to_regclass('public.job_offers') IS NOT NULL THEN
    EXECUTE $q$DROP POLICY IF EXISTS "HR can read job_offers" ON public.job_offers$q$;
    EXECUTE $q$CREATE POLICY "HR can read job_offers" ON public.job_offers FOR SELECT TO authenticated USING (public.can_access_module(auth.uid(), 'recruitment'))$q$;
  END IF;
  IF to_regclass('public.petty_cash_counts') IS NOT NULL THEN
    EXECUTE $q$DROP POLICY IF EXISTS "Accounting can read petty_cash_counts" ON public.petty_cash_counts$q$;
    EXECUTE $q$CREATE POLICY "Accounting can read petty_cash_counts" ON public.petty_cash_counts FOR SELECT TO authenticated USING (public.can_access_module(auth.uid(), 'accounting'))$q$;
  END IF;
  IF to_regclass('public.pricelist_items') IS NOT NULL THEN
    EXECUTE $q$DROP POLICY IF EXISTS "Admins manage pricelist_items" ON public.pricelist_items$q$;
    EXECUTE $q$CREATE POLICY "Admins manage pricelist_items" ON public.pricelist_items FOR ALL TO authenticated USING (public.can_access_module(auth.uid(), 'pricelists')) WITH CHECK (public.can_access_module(auth.uid(), 'pricelists'))$q$;
  END IF;
  IF to_regclass('public.pricelists') IS NOT NULL THEN
    EXECUTE $q$DROP POLICY IF EXISTS "Admins manage pricelists" ON public.pricelists$q$;
    EXECUTE $q$CREATE POLICY "Admins manage pricelists" ON public.pricelists FOR ALL TO authenticated USING (public.can_access_module(auth.uid(), 'pricelists')) WITH CHECK (public.can_access_module(auth.uid(), 'pricelists'))$q$;
  END IF;
  IF to_regclass('public.reconciliation_matches') IS NOT NULL THEN
    EXECUTE $q$DROP POLICY IF EXISTS "Accounting can read reconciliation_matches" ON public.reconciliation_matches$q$;
    EXECUTE $q$CREATE POLICY "Accounting can read reconciliation_matches" ON public.reconciliation_matches FOR SELECT TO authenticated USING (public.can_access_module(auth.uid(), 'reconciliation'))$q$;
  END IF;
  IF to_regclass('public.reconciliation_rules') IS NOT NULL THEN
    EXECUTE $q$DROP POLICY IF EXISTS "Accounting can read reconciliation_rules" ON public.reconciliation_rules$q$;
    EXECUTE $q$CREATE POLICY "Accounting can read reconciliation_rules" ON public.reconciliation_rules FOR SELECT TO authenticated USING (public.can_access_module(auth.uid(), 'reconciliation'))$q$;
  END IF;
  IF to_regclass('public.reconciliation_signoffs') IS NOT NULL THEN
    EXECUTE $q$DROP POLICY IF EXISTS "Accounting can read reconciliation_signoffs" ON public.reconciliation_signoffs$q$;
    EXECUTE $q$CREATE POLICY "Accounting can read reconciliation_signoffs" ON public.reconciliation_signoffs FOR SELECT TO authenticated USING (public.can_access_module(auth.uid(), 'reconciliation'))$q$;
  END IF;
  IF to_regclass('public.reference_checks') IS NOT NULL THEN
    EXECUTE $q$DROP POLICY IF EXISTS "HR can read reference_checks" ON public.reference_checks$q$;
    EXECUTE $q$CREATE POLICY "HR can read reference_checks" ON public.reference_checks FOR SELECT TO authenticated USING (public.can_access_module(auth.uid(), 'recruitment'))$q$;
  END IF;
  IF to_regclass('public.return_pickups') IS NOT NULL THEN
    EXECUTE $q$DROP POLICY IF EXISTS "pickup staff manage" ON public.return_pickups$q$;
    EXECUTE $q$CREATE POLICY "pickup staff manage" ON public.return_pickups FOR ALL TO authenticated USING (public.can_access_module(auth.uid(), 'returns')) WITH CHECK (public.can_access_module(auth.uid(), 'returns'))$q$;
  END IF;
  IF to_regclass('public.return_to_vendor') IS NOT NULL THEN
    EXECUTE $q$DROP POLICY IF EXISTS "rtv staff manage" ON public.return_to_vendor$q$;
    EXECUTE $q$CREATE POLICY "rtv staff manage" ON public.return_to_vendor FOR ALL TO authenticated USING (public.can_access_module(auth.uid(), 'returns')) WITH CHECK (public.can_access_module(auth.uid(), 'returns'))$q$;
  END IF;
  IF to_regclass('public.salary_advances') IS NOT NULL THEN
    EXECUTE $q$DROP POLICY IF EXISTS "HR can read salary_advances" ON public.salary_advances$q$;
    EXECUTE $q$CREATE POLICY "HR can read salary_advances" ON public.salary_advances FOR SELECT TO authenticated USING (public.can_access_module(auth.uid(), 'payroll'))$q$;
  END IF;
  IF to_regclass('public.salary_grades') IS NOT NULL THEN
    EXECUTE $q$DROP POLICY IF EXISTS "HR can read salary_grades" ON public.salary_grades$q$;
    EXECUTE $q$CREATE POLICY "HR can read salary_grades" ON public.salary_grades FOR SELECT TO authenticated USING (public.can_access_module(auth.uid(), 'hr'))$q$;
  END IF;
  IF to_regclass('public.salary_structure_components') IS NOT NULL THEN
    EXECUTE $q$DROP POLICY IF EXISTS "HR can read salary_structure_components" ON public.salary_structure_components$q$;
    EXECUTE $q$CREATE POLICY "HR can read salary_structure_components" ON public.salary_structure_components FOR SELECT TO authenticated USING (public.can_access_module(auth.uid(), 'payroll'))$q$;
  END IF;
  IF to_regclass('public.salary_structures') IS NOT NULL THEN
    EXECUTE $q$DROP POLICY IF EXISTS "HR can read salary_structures" ON public.salary_structures$q$;
    EXECUTE $q$CREATE POLICY "HR can read salary_structures" ON public.salary_structures FOR SELECT TO authenticated USING (public.can_access_module(auth.uid(), 'payroll'))$q$;
  END IF;
  IF to_regclass('public.service_order_lines') IS NOT NULL THEN
    EXECUTE $q$DROP POLICY IF EXISTS "service_order_lines_admin_all" ON public.service_order_lines$q$;
    EXECUTE $q$CREATE POLICY "service_order_lines_admin_all" ON public.service_order_lines FOR ALL TO authenticated USING (public.can_access_module(auth.uid(), 'fieldService')) WITH CHECK (public.can_access_module(auth.uid(), 'fieldService'))$q$;
  END IF;
  IF to_regclass('public.service_orders') IS NOT NULL THEN
    EXECUTE $q$DROP POLICY IF EXISTS "service_orders_admin_all" ON public.service_orders$q$;
    EXECUTE $q$CREATE POLICY "service_orders_admin_all" ON public.service_orders FOR ALL TO authenticated USING (public.can_access_module(auth.uid(), 'fieldService')) WITH CHECK (public.can_access_module(auth.uid(), 'fieldService'))$q$;
  END IF;
  IF to_regclass('public.service_visits') IS NOT NULL THEN
    EXECUTE $q$DROP POLICY IF EXISTS "service_visits_admin_all" ON public.service_visits$q$;
    EXECUTE $q$CREATE POLICY "service_visits_admin_all" ON public.service_visits FOR ALL TO authenticated USING (public.can_access_module(auth.uid(), 'fieldService')) WITH CHECK (public.can_access_module(auth.uid(), 'fieldService'))$q$;
  END IF;
  IF to_regclass('public.shipments') IS NOT NULL THEN
    EXECUTE $q$DROP POLICY IF EXISTS "Staff manage shipments" ON public.shipments$q$;
    EXECUTE $q$CREATE POLICY "Staff manage shipments" ON public.shipments FOR ALL TO authenticated USING (public.can_access_module(auth.uid(), 'shipping')) WITH CHECK (public.can_access_module(auth.uid(), 'shipping'))$q$;
  END IF;
  IF to_regclass('public.subscription_churn_reasons') IS NOT NULL THEN
    EXECUTE $q$DROP POLICY IF EXISTS "Accounting can read subscription_churn_reasons" ON public.subscription_churn_reasons$q$;
    EXECUTE $q$CREATE POLICY "Accounting can read subscription_churn_reasons" ON public.subscription_churn_reasons FOR SELECT TO authenticated USING (public.can_access_module(auth.uid(), 'subscriptions'))$q$;
  END IF;
  IF to_regclass('public.subscription_winback_campaigns') IS NOT NULL THEN
    EXECUTE $q$DROP POLICY IF EXISTS "Accounting can read subscription_winback_campaigns" ON public.subscription_winback_campaigns$q$;
    EXECUTE $q$CREATE POLICY "Accounting can read subscription_winback_campaigns" ON public.subscription_winback_campaigns FOR SELECT TO authenticated USING (public.can_access_module(auth.uid(), 'subscriptions'))$q$;
  END IF;
  IF to_regclass('public.subscription_winback_sends') IS NOT NULL THEN
    EXECUTE $q$DROP POLICY IF EXISTS "Accounting can read subscription_winback_sends" ON public.subscription_winback_sends$q$;
    EXECUTE $q$CREATE POLICY "Accounting can read subscription_winback_sends" ON public.subscription_winback_sends FOR SELECT TO authenticated USING (public.can_access_module(auth.uid(), 'subscriptions'))$q$;
  END IF;
  IF to_regclass('public.timesheet_period_locks') IS NOT NULL THEN
    EXECUTE $q$DROP POLICY IF EXISTS "Accounting can read timesheet_period_locks" ON public.timesheet_period_locks$q$;
    EXECUTE $q$CREATE POLICY "Accounting can read timesheet_period_locks" ON public.timesheet_period_locks FOR SELECT TO authenticated USING (public.can_access_module(auth.uid(), 'timesheets'))$q$;
  END IF;
  IF to_regclass('public.tolerance_policies') IS NOT NULL THEN
    EXECUTE $q$DROP POLICY IF EXISTS "Admins manage tolerance" ON public.tolerance_policies$q$;
    EXECUTE $q$CREATE POLICY "Admins manage tolerance" ON public.tolerance_policies FOR ALL TO authenticated USING (public.can_access_module(auth.uid(), 'accounting') OR public.can_access_module(auth.uid(), 'purchasing')) WITH CHECK (public.can_access_module(auth.uid(), 'accounting') OR public.can_access_module(auth.uid(), 'purchasing'))$q$;
  END IF;
END $$;

-- ── Bevisas där den körs ───────────────────────────────────────────────────
DO $$
DECLARE t text; n int;
BEGIN
  FOREACH t IN ARRAY ARRAY['accounting_corrections', 'application_stages', 'applications', 'bank_accounts', 'bank_feed_connections', 'bank_import_batches', 'bank_transactions', 'benefit_plans', 'budgets', 'candidate_assessments', 'candidate_notes', 'carriers', 'disciplinary_actions', 'dunning_actions', 'dunning_sequences', 'email_events', 'email_suppressions', 'email_templates', 'email_threads', 'expense_policies', 'interviews', 'inventory_receipt_lines', 'inventory_receipts', 'inventory_transfer_lines', 'inventory_transfers', 'invoice_dunning_actions', 'job_offers', 'petty_cash_counts', 'pricelist_items', 'pricelists', 'reconciliation_matches', 'reconciliation_rules', 'reconciliation_signoffs', 'reference_checks', 'return_pickups', 'return_to_vendor', 'salary_advances', 'salary_grades', 'salary_structure_components', 'salary_structures', 'service_order_lines', 'service_orders', 'service_visits', 'shipments', 'subscription_churn_reasons', 'subscription_winback_campaigns', 'subscription_winback_sends', 'timesheet_period_locks', 'tolerance_policies'] LOOP
    CONTINUE WHEN to_regclass('public.' || t) IS NULL;
    SELECT count(*) INTO n FROM pg_policies
     WHERE schemaname = 'public' AND tablename = t
       AND (coalesce(qual,'') || coalesce(with_check,'')) ~ 'has_role\(auth\.uid\(\), ''(?!admin'')(?!writer'')(?!approver'')(?!employee'')';
    IF n > 0 THEN
      RAISE EXCEPTION 'rollsvep 5: % still names a functional role by hand in % policy(ies)', t, n;
    END IF;
    SELECT count(*) INTO n FROM pg_policies
     WHERE schemaname = 'public' AND tablename = t AND qual LIKE '%can_access_module%';
    IF n = 0 THEN
      RAISE EXCEPTION 'rollsvep 5: % has no matrix policy after the sweep', t;
    END IF;
  END LOOP;
  -- Ingen roll förlorade något: varje par som gavs för hand finns i matrisen.
  IF EXISTS (
    SELECT 1 FROM (VALUES
      ('accounting'::app_role, 'accounting'),
      ('accounting'::app_role, 'expenses'),
      ('accounting'::app_role, 'invoicing'),
      ('accounting'::app_role, 'purchasing'),
      ('accounting'::app_role, 'reconciliation'),
      ('accounting'::app_role, 'subscriptions'),
      ('accounting'::app_role, 'timesheets'),
      ('hr'::app_role, 'hr'),
      ('hr'::app_role, 'payroll'),
      ('hr'::app_role, 'recruitment'),
      ('marketing'::app_role, 'email'),
      ('purchasing'::app_role, 'accounting'),
      ('purchasing'::app_role, 'purchasing'),
      ('purchasing'::app_role, 'returns'),
      ('sales'::app_role, 'email'),
      ('sales'::app_role, 'fieldService'),
      ('sales'::app_role, 'pricelists'),
      ('sales'::app_role, 'shipping'),
      ('support'::app_role, 'email'),
      ('support'::app_role, 'fieldService'),
      ('support'::app_role, 'returns'),
      ('warehouse'::app_role, 'inventory'),
      ('warehouse'::app_role, 'returns'),
      ('warehouse'::app_role, 'shipping')
    ) AS d(role, module_id)
    WHERE NOT EXISTS (SELECT 1 FROM public.role_module_access r WHERE r.role = d.role AND r.module_id = d.module_id)
  ) THEN
    RAISE EXCEPTION 'rollsvep 5: a hand-granted (role, module) pair is missing from the matrix';
  END IF;
  RAISE NOTICE 'rollsvep 5: % policies follow the matrix, % pairs preserved', 49, 24;
END $$;
