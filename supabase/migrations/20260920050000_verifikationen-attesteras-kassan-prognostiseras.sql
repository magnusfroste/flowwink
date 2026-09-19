-- Verifikationen attesteras, kassan prognostiseras.
--
-- Paritetsrunda 5, accounting (63 %). Två förmågor saknades:
--
--   1. Attest av manuella verifikationer. Odoo kan kräva godkännande innan en
--      manuell verifikation bokförs. Här fanns attestmotorn (regler + kedjor)
--      men journal_entries var aldrig kopplad till den.
--
--      Regeln bor på tabellerna och lyder för varje skrivare:
--        * en MANUELL verifikation (journal_entry_is_manual — gjord av en
--          människa i UI:t eller av en agent, inte av en bokföringsfunktion)
--          som bokförs när en regel eller kedja för 'journal_entry' träffar
--          beloppet, och som ingen godkänd begäran täcker, blir ett UTKAST med
--          en attestbegäran. Den stoppas inte: den väntar. Huvud och rader
--          skrivs i två anrop av både UI och agent, så beloppet finns först när
--          raderna finns — kontrollen är en uppskjuten constraint-trigger på
--          raderna, som körs vid commit när alla rader är på plats.
--        * utkast → bokförd prövas på nytt: bara med ett godkännande som
--          täcker beloppet.
--      Automatiska bokningar (fakturor, löner, lager, avskrivningar …) har sin
--      attest uppströms och berörs inte.
--
--   2. Likviditetsprognos: veckovis in- och utbetalningar över N veckor, ur
--      öppna kundfakturor, öppna leverantörsfakturor (minus tillämpade
--      krediter) och återkommande prenumerationsfakturor — med ingående
--      bankbalans ur huvudboken. Det som inte räknas säger svaret självt.
--
-- Flottan förkontrollerad läsande 2026-09-19: ingen instans har en attestregel
-- eller kedja för 'journal_entry' — reglerna börjar gälla först när en
-- operatör skapar en.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Attest
-- ─────────────────────────────────────────────────────────────────────────

-- EN definition av "manuell": gjord av en människa eller en agent. Källorna
-- sätts av UI:t ('manual', 'upload') och agent-execute ('mcp', 'chat',
-- 'flowpilot', 'agent'); en verifikation utan källa räknas som manuell.
CREATE OR REPLACE FUNCTION public.journal_entry_is_manual(p_source text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT p_source IS NULL OR p_source IN ('manual', 'upload', 'mcp', 'chat', 'flowpilot', 'agent');
$function$;

CREATE OR REPLACE FUNCTION public.journal_entry_debit_total(p_entry_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(SUM(debit_cents), 0)::bigint FROM public.journal_entry_lines WHERE journal_entry_id = p_entry_id;
$function$;

-- Kräver beloppet attest? Kedja före regel, precis som för offerter.
CREATE OR REPLACE FUNCTION public.journal_entry_approval_applies(p_amount_cents bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.approval_chains c JOIN public.approval_steps s ON s.chain_id = c.id
                  WHERE c.entity_type = 'journal_entry' AND c.is_active)
      OR EXISTS (SELECT 1 FROM public.evaluate_approval_required('journal_entry', p_amount_cents, public.platform_default_currency()));
$function$;

CREATE OR REPLACE FUNCTION public.journal_entry_approval_covered(p_entry_id uuid, p_amount_cents bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.approval_requests r
     WHERE r.entity_type = 'journal_entry' AND r.entity_id = p_entry_id::text AND r.status::text = 'approved'
       AND (r.amount_cents IS NULL OR r.amount_cents >= p_amount_cents)
       AND (NOT EXISTS (SELECT 1 FROM public.approval_chains c JOIN public.approval_steps s ON s.chain_id = c.id
                         WHERE c.entity_type = 'journal_entry' AND c.is_active)
            OR r.chain_id IS NOT NULL));
$function$;

-- Dörren: begär attest för ett utkast. Kedja när en finns, annars regeln.
CREATE OR REPLACE FUNCTION public.request_journal_entry_approval(p_entry_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_je public.journal_entries;
  v_amount bigint;
  v_chain jsonb;
  v_request uuid;
  v_rule_id uuid;
  v_rule_role app_role;
  v_steps integer;
  v_reason text;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'accounting')) THEN
    RAISE EXCEPTION 'Requires the accounting module — an admin can grant it under Users → Role Permissions' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_je FROM public.journal_entries WHERE id = p_entry_id FOR UPDATE;
  IF v_je.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Journal entry not found');
  END IF;
  IF v_je.status <> 'draft' THEN
    RETURN jsonb_build_object('success', false, 'error',
      format('Journal entry is %s — approval is requested on a draft, before it is posted.', v_je.status));
  END IF;
  v_amount := public.journal_entry_debit_total(v_je.id);

  -- Samma begäran två gånger är samma begäran, så länge den täcker beloppet.
  SELECT id INTO v_request FROM public.approval_requests
   WHERE entity_type = 'journal_entry' AND entity_id = v_je.id::text
     AND (status::text = 'pending' OR (status::text = 'approved' AND (amount_cents IS NULL OR amount_cents >= v_amount)))
   ORDER BY created_at DESC LIMIT 1;
  IF v_request IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'existing', true, 'journal_entry_id', v_je.id, 'approval_request_id', v_request,
      'approval_status', (SELECT status::text FROM public.approval_requests WHERE id = v_request));
  END IF;

  v_reason := COALESCE(NULLIF(btrim(p_reason), ''),
                       format('Journal entry %s%s: %s', COALESCE(v_je.voucher_series || '-', ''), COALESCE(v_je.voucher_number::text, ''), COALESCE(v_je.description, '')));
  v_chain := public.request_entity_approval('journal_entry', v_je.id::text, v_amount, v_reason);
  IF COALESCE((v_chain->>'chain_required')::boolean, false) THEN
    v_request := (v_chain->>'request_id')::uuid;
    SELECT count(*) INTO v_steps FROM public.approval_steps s
      JOIN public.approval_requests r ON r.chain_id = s.chain_id WHERE r.id = v_request;
  ELSE
    SELECT e.rule_id, e.required_role INTO v_rule_id, v_rule_role
      FROM public.evaluate_approval_required('journal_entry', v_amount, public.platform_default_currency()) e;
    INSERT INTO public.approval_requests (rule_id, entity_type, entity_id, amount_cents, currency, reason, required_role, requested_by, context)
    VALUES (v_rule_id, 'journal_entry', v_je.id::text, v_amount, public.platform_default_currency(), v_reason,
            COALESCE(v_rule_role, 'admin'::app_role), auth.uid(),
            jsonb_build_object('voucher', COALESCE(v_je.voucher_series || '-', '') || COALESCE(v_je.voucher_number::text, ''),
                               'entry_date', v_je.entry_date, 'rule_matched', v_rule_id IS NOT NULL))
    RETURNING id INTO v_request;
  END IF;

  RETURN jsonb_build_object('success', true, 'journal_entry_id', v_je.id, 'amount_cents', v_amount,
    'approval_request_id', v_request, 'chain', v_steps IS NOT NULL, 'chain_steps', v_steps,
    'next', CASE WHEN v_steps IS NOT NULL
                 THEN format('A chain of %s step(s) decides (advance_approval_step). Then post it with post_journal_entry(%s).', v_steps, v_je.id)
                 ELSE format('An approver decides at /admin/approvals?request=%s. Then post it with post_journal_entry(%s).', v_request, v_je.id) END);
END;
$function$;

-- Bokför ett utkast. Tabellens regel avgör om det får.
CREATE OR REPLACE FUNCTION public.post_journal_entry(p_entry_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_je public.journal_entries;
  v_debit bigint;
  v_credit bigint;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'accounting')) THEN
    RAISE EXCEPTION 'Requires the accounting module — an admin can grant it under Users → Role Permissions' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_je FROM public.journal_entries WHERE id = p_entry_id FOR UPDATE;
  IF v_je.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Journal entry not found');
  END IF;
  IF v_je.status = 'posted' THEN
    RETURN jsonb_build_object('success', true, 'already_posted', true, 'journal_entry_id', v_je.id);
  END IF;
  IF v_je.status <> 'draft' THEN
    RETURN jsonb_build_object('success', false, 'error', format('Journal entry is %s — only a draft can be posted.', v_je.status));
  END IF;
  SELECT COALESCE(SUM(debit_cents), 0), COALESCE(SUM(credit_cents), 0) INTO v_debit, v_credit
    FROM public.journal_entry_lines WHERE journal_entry_id = v_je.id;
  IF v_debit = 0 OR v_debit <> v_credit THEN
    RETURN jsonb_build_object('success', false, 'error',
      format('The entry does not balance (debit %s, credit %s) — a draft is posted only when it balances.', v_debit, v_credit));
  END IF;
  UPDATE public.journal_entries SET status = 'posted', updated_at = now() WHERE id = v_je.id;
  RETURN jsonb_build_object('success', true, 'journal_entry_id', v_je.id, 'status', 'posted', 'amount_cents', v_debit);
END;
$function$;

-- Regel 1: utkast → bokförd kräver ett godkännande som täcker beloppet.
CREATE OR REPLACE FUNCTION public.journal_entry_post_needs_its_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_amount bigint;
BEGIN
  IF NOT (OLD.status = 'draft' AND NEW.status = 'posted') OR NOT public.journal_entry_is_manual(NEW.source) THEN
    RETURN NEW;
  END IF;
  v_amount := public.journal_entry_debit_total(NEW.id);
  IF public.journal_entry_approval_applies(v_amount) AND NOT public.journal_entry_approval_covered(NEW.id, v_amount) THEN
    RAISE EXCEPTION 'Journal entry %: % needs approval before it is posted — an approval rule or chain applies and no approved request covers it. Request it with request_journal_entry_approval.',
      COALESCE(NEW.voucher_series || '-' || NEW.voucher_number, NEW.id::text), round(v_amount / 100.0, 2)
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS journal_entry_post_needs_its_approval ON public.journal_entries;
CREATE TRIGGER journal_entry_post_needs_its_approval
  BEFORE UPDATE OF status ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.journal_entry_post_needs_its_approval();

-- Regel 2: en manuell verifikation som föds bokförd, över tröskeln och utan
-- täckande godkännande, blir ett utkast med en attestbegäran. Körs vid commit,
-- när alla rader finns. Ingen verifikation går förlorad och ingen skrivare
-- behöver känna till regeln — men ingen passerar den heller.
CREATE OR REPLACE FUNCTION public.journal_entry_manual_waits_for_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_je record;
  v_amount bigint;
BEGIN
  SELECT id, status, source INTO v_je FROM public.journal_entries WHERE id = NEW.journal_entry_id;
  IF v_je.id IS NULL OR v_je.status <> 'posted' OR NOT public.journal_entry_is_manual(v_je.source) THEN
    RETURN NULL;
  END IF;
  v_amount := public.journal_entry_debit_total(v_je.id);
  IF NOT public.journal_entry_approval_applies(v_amount) OR public.journal_entry_approval_covered(v_je.id, v_amount) THEN
    RETURN NULL;
  END IF;
  UPDATE public.journal_entries SET status = 'draft', updated_at = now() WHERE id = v_je.id AND status = 'posted';
  IF FOUND THEN
    PERFORM public.request_journal_entry_approval_internal(v_je.id);
  END IF;
  RETURN NULL;
END;
$function$;

-- Begäran från regeln själv: samma som dörren, utan behörighetskontroll (den
-- som fick skriva verifikationen har redan passerat radernas egen RLS).
CREATE OR REPLACE FUNCTION public.request_journal_entry_approval_internal(p_entry_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_amount bigint := public.journal_entry_debit_total(p_entry_id);
  v_chain jsonb;
  v_request uuid;
  v_rule_id uuid;
  v_rule_role app_role;
  v_je public.journal_entries;
BEGIN
  SELECT * INTO v_je FROM public.journal_entries WHERE id = p_entry_id;
  v_chain := public.request_entity_approval('journal_entry', p_entry_id::text, v_amount,
               format('Manual journal entry %s awaits approval: %s', COALESCE(v_je.voucher_series || '-' || v_je.voucher_number, p_entry_id::text), COALESCE(v_je.description, '')));
  IF COALESCE((v_chain->>'chain_required')::boolean, false) THEN
    RETURN (v_chain->>'request_id')::uuid;
  END IF;
  SELECT e.rule_id, e.required_role INTO v_rule_id, v_rule_role
    FROM public.evaluate_approval_required('journal_entry', v_amount, public.platform_default_currency()) e;
  INSERT INTO public.approval_requests (rule_id, entity_type, entity_id, amount_cents, currency, reason, required_role, context)
  VALUES (v_rule_id, 'journal_entry', p_entry_id::text, v_amount, public.platform_default_currency(),
          format('Manual journal entry %s awaits approval: %s', COALESCE(v_je.voucher_series || '-' || v_je.voucher_number, p_entry_id::text), COALESCE(v_je.description, '')),
          COALESCE(v_rule_role, 'admin'::app_role),
          jsonb_build_object('voucher', COALESCE(v_je.voucher_series || '-' || v_je.voucher_number, ''), 'entry_date', v_je.entry_date,
                             'held_automatically', true))
  RETURNING id INTO v_request;
  RETURN v_request;
END;
$function$;

DROP TRIGGER IF EXISTS journal_entry_manual_waits_for_approval ON public.journal_entry_lines;
CREATE CONSTRAINT TRIGGER journal_entry_manual_waits_for_approval
  AFTER INSERT ON public.journal_entry_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.journal_entry_manual_waits_for_approval();

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Likviditetsprognosen
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cash_flow_forecast(p_weeks integer DEFAULT 13, p_include_subscriptions boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_weeks integer := GREATEST(1, LEAST(COALESCE(p_weeks, 13), 52));
  v_start date := date_trunc('week', CURRENT_DATE)::date;
  v_end date;
  v_base text := public.platform_default_currency();
  v_vat numeric := COALESCE(public.order_line_vat_rate(NULL), 0) / 100.0;
  v_opening bigint;
  v_items jsonb := '[]'::jsonb;
  v_weeks_out jsonb := '[]'::jsonb;
  v_running bigint;
  v_low bigint;
  v_low_week date;
  v_not_converted jsonb;
  v_sub record;
  v_date date;
  v_amount bigint;
  v_due integer;
  k integer;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'accounting')) THEN
    RAISE EXCEPTION 'Requires the accounting module — an admin can grant it under Users → Role Permissions' USING ERRCODE = '42501';
  END IF;
  v_end := v_start + v_weeks * 7;

  -- Ingående likvida medel: huvudbokens saldo på bank- och kassakonton i dag.
  SELECT COALESCE(SUM(l.debit_cents - l.credit_cents), 0) INTO v_opening
    FROM public.journal_entry_lines l JOIN public.journal_entries e ON e.id = l.journal_entry_id
   WHERE e.status = 'posted' AND e.entry_date <= CURRENT_DATE
     AND l.account_code IN (SELECT account_code FROM public.account_roles WHERE role IN ('bank', 'cash_register'));

  CREATE TEMP TABLE IF NOT EXISTS pg_temp.cff_items (kind text, ref text, label text, due date, amount bigint, overdue boolean) ON COMMIT DROP;
  TRUNCATE pg_temp.cff_items;

  -- Kundfakturor: det som återstår att få betalt. Förfallna landar i vecka 0.
  INSERT INTO pg_temp.cff_items
  SELECT 'receivable', i.invoice_number, COALESCE(i.customer_name, i.customer_email),
         GREATEST(i.due_date, v_start), round((i.total_cents - COALESCE(i.paid_amount_cents, 0)) * COALESCE(i.exchange_rate, 1))::bigint,
         i.due_date < CURRENT_DATE
    FROM public.invoices i
   WHERE i.status::text IN ('sent', 'overdue', 'partially_paid') AND i.due_date IS NOT NULL AND i.due_date < v_end
     AND i.total_cents - COALESCE(i.paid_amount_cents, 0) > 0
     AND (upper(i.currency) = upper(v_base) OR i.exchange_rate IS NOT NULL);

  -- Leverantörsfakturor: totalen minus tillämpade krediter.
  INSERT INTO pg_temp.cff_items
  SELECT 'payable', vi.invoice_number, v.name,
         GREATEST(COALESCE(vi.due_date, vi.invoice_date + 30), v_start),
         -(vi.total_cents - COALESCE((SELECT SUM(m.amount_cents) FROM public.vendor_credit_memos m
                                       WHERE m.vendor_invoice_id = vi.id AND m.status = 'applied'), 0)),
         COALESCE(vi.due_date, vi.invoice_date + 30) < CURRENT_DATE
    FROM public.vendor_invoices vi LEFT JOIN public.vendors v ON v.id = vi.vendor_id
   WHERE vi.paid_at IS NULL AND vi.status NOT IN ('paid', 'rejected')
     AND COALESCE(vi.due_date, vi.invoice_date + 30) < v_end
     AND upper(COALESCE(vi.currency, v_base)) = upper(v_base);

  -- Återkommande prenumerationer: varje kommande faktura, betald på förfallodagen.
  IF COALESCE(p_include_subscriptions, true) THEN
    FOR v_sub IN
      SELECT s.id, s.customer_name, s.customer_email, s.unit_amount_cents, s.quantity, s.currency, s.payment_terms,
             s.next_invoice_date, s.billing_interval, s.billing_interval_count
        FROM public.subscriptions s
       WHERE s.provider = 'manual' AND s.status::text = 'active' AND s.next_invoice_date IS NOT NULL
         AND upper(s.currency) = upper(v_base)
    LOOP
      v_due := CASE v_sub.payment_terms WHEN 'invoice_30' THEN 30 WHEN 'invoice_14' THEN 14 WHEN 'invoice_7' THEN 7 ELSE 30 END;
      v_amount := round(v_sub.unit_amount_cents * COALESCE(v_sub.quantity, 1) * (1 + v_vat))::bigint;
      v_date := v_sub.next_invoice_date;
      FOR k IN 1..60 LOOP
        EXIT WHEN v_date + v_due >= v_end;
        IF v_date + v_due >= v_start THEN
          INSERT INTO pg_temp.cff_items VALUES ('subscription', v_sub.id::text, COALESCE(v_sub.customer_name, v_sub.customer_email), v_date + v_due, v_amount, false);
        END IF;
        v_date := public.advance_billing_date(v_date, v_sub.billing_interval, COALESCE(v_sub.billing_interval_count, 1));
      END LOOP;
    END LOOP;
  END IF;

  v_running := v_opening;
  v_low := v_opening;
  v_low_week := v_start;
  FOR k IN 0..v_weeks - 1 LOOP
    DECLARE
      w_start date := v_start + k * 7;
      w_in_inv bigint; w_in_sub bigint; w_out bigint;
    BEGIN
      SELECT COALESCE(SUM(amount) FILTER (WHERE kind = 'receivable'), 0),
             COALESCE(SUM(amount) FILTER (WHERE kind = 'subscription'), 0),
             COALESCE(-SUM(amount) FILTER (WHERE kind = 'payable'), 0)
        INTO w_in_inv, w_in_sub, w_out
        FROM pg_temp.cff_items WHERE due >= w_start AND due < w_start + 7;
      v_running := v_running + w_in_inv + w_in_sub - w_out;
      IF v_running < v_low THEN v_low := v_running; v_low_week := w_start; END IF;
      v_weeks_out := v_weeks_out || jsonb_build_object(
        'week_start', w_start, 'receivables_cents', w_in_inv, 'subscriptions_cents', w_in_sub,
        'payables_cents', w_out, 'net_cents', w_in_inv + w_in_sub - w_out, 'closing_cents', v_running);
    END;
  END LOOP;

  SELECT COALESCE(jsonb_agg(DISTINCT upper(c)), '[]'::jsonb) INTO v_not_converted FROM (
    SELECT i.currency AS c FROM public.invoices i
     WHERE i.status::text IN ('sent', 'overdue', 'partially_paid') AND upper(i.currency) <> upper(v_base) AND i.exchange_rate IS NULL
    UNION SELECT vi.currency FROM public.vendor_invoices vi
     WHERE vi.paid_at IS NULL AND vi.status NOT IN ('paid', 'rejected') AND upper(COALESCE(vi.currency, v_base)) <> upper(v_base)
    UNION SELECT s.currency FROM public.subscriptions s
     WHERE s.provider = 'manual' AND s.status::text = 'active' AND upper(s.currency) <> upper(v_base)) x;

  RETURN jsonb_build_object('success', true, 'currency', v_base, 'from', v_start, 'weeks', v_weeks,
    'opening_cents', v_opening,
    'closing_cents', v_running,
    'lowest', jsonb_build_object('week_start', v_low_week, 'closing_cents', v_low),
    'overdue_receivables_cents', (SELECT COALESCE(SUM(amount), 0) FROM pg_temp.cff_items WHERE kind = 'receivable' AND overdue),
    'overdue_payables_cents', (SELECT COALESCE(-SUM(amount), 0) FROM pg_temp.cff_items WHERE kind = 'payable' AND overdue),
    'by_week', v_weeks_out,
    'largest_items', COALESCE((SELECT jsonb_agg(jsonb_build_object('kind', kind, 'ref', ref, 'counterparty', label, 'due', due, 'amount_cents', amount, 'overdue', overdue) ORDER BY abs(amount) DESC)
                                 FROM (SELECT * FROM pg_temp.cff_items ORDER BY abs(amount) DESC LIMIT 10) t), '[]'::jsonb),
    'not_converted_currencies', v_not_converted,
    'not_included', jsonb_build_array('payroll and employer taxes', 'VAT and tax payments', 'orders not yet invoiced', 'card subscriptions (Stripe pays out on its own schedule)'),
    'note', 'Overdue receivables and payables are placed in the first week. The opening balance is the posted balance on the bank and cash accounts today.');
END;
$function$;

-- STABLE-funktionen skriver till en temporär tabell; den markeras VOLATILE.
ALTER FUNCTION public.cash_flow_forecast(integer, boolean) VOLATILE;

-- Attestläget för en verifikation — läses av utkastpanelen. Redovisningens egen
-- läsning; attestmodulens tabell läses inte direkt från redovisningens UI.
CREATE OR REPLACE FUNCTION public.journal_entry_approval_status(p_entry_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_r record;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'accounting')) THEN
    RAISE EXCEPTION 'Requires the accounting module — an admin can grant it under Users → Role Permissions' USING ERRCODE = '42501';
  END IF;
  SELECT r.id, r.status::text AS status, r.amount_cents, r.chain_id, r.current_step INTO v_r
    FROM public.approval_requests r
   WHERE r.entity_type = 'journal_entry' AND r.entity_id = p_entry_id::text
   ORDER BY r.created_at DESC LIMIT 1;
  RETURN jsonb_build_object('success', true, 'journal_entry_id', p_entry_id,
    'amount_cents', public.journal_entry_debit_total(p_entry_id),
    'approval_required', public.journal_entry_approval_applies(public.journal_entry_debit_total(p_entry_id)),
    'approval_request_id', v_r.id, 'approval_status', v_r.status, 'approved_amount_cents', v_r.amount_cents,
    'chain', v_r.chain_id IS NOT NULL, 'current_step', v_r.current_step);
END;
$function$;

-- Konsolideringen får en admin-yta i redovisningen, och följer därför
-- rollmatrisen i stället för en hårdkodad adminroll. Kroppen är i övrigt den från
-- 20260708060000 — identisk på alla sju instanser (md5 d7e9d990… 2026-09-19).
CREATE OR REPLACE FUNCTION public.consolidation_report(p_presentation_currency text DEFAULT NULL::text, p_as_of date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pres text;
  v_base text;
  v_entities jsonb := '[]'::jsonb;
  v_entity jsonb;
  v_sub record;
  v_rate numeric;
  v_accounts jsonb;
  v_local bigint;
  v_translated bigint;
  v_total bigint := 0;
  v_missing text[] := '{}';
BEGIN
  -- matrix 20260920050000 — the report has an admin surface in Accounting and follows the role matrix.
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'accounting')) THEN
    RAISE EXCEPTION 'Requires the accounting module — an admin can grant it under Users → Role Permissions' USING ERRCODE = '42501';
  END IF;
  SELECT code INTO v_base FROM public.currencies WHERE is_base LIMIT 1;
  v_base := COALESCE(v_base, 'SEK');
  v_pres := upper(COALESCE(p_presentation_currency, v_base));

  FOR v_sub IN
    SELECT s.id, s.code, s.name, s.currency FROM public.subsidiaries s WHERE s.is_active
    UNION ALL
    SELECT NULL::uuid, 'HQ', 'Headquarters (base ledger)', v_base
    ORDER BY 2
  LOOP
    v_rate := public.fx_rate_at(v_sub.currency, v_pres, p_as_of);
    IF v_rate IS NULL THEN
      v_missing := array_append(v_missing, v_sub.currency || '->' || v_pres);
    END IF;

    SELECT COALESCE(jsonb_agg(a ORDER BY a.account_code), '[]'::jsonb),
           COALESCE(SUM(a.net_local_cents), 0),
           COALESCE(SUM(a.net_translated_cents), 0)
    INTO v_accounts, v_local, v_translated
    FROM (
      SELECT l.account_code,
             MAX(l.account_name) AS account_name,
             SUM(l.debit_cents - l.credit_cents) AS net_local_cents,
             CASE WHEN v_rate IS NULL THEN NULL
                  ELSE ROUND(SUM(l.debit_cents - l.credit_cents) * v_rate)::bigint END AS net_translated_cents
      FROM public.journal_entry_lines l
      JOIN public.journal_entries e ON e.id = l.journal_entry_id
      WHERE e.status = 'posted'
        AND e.entry_date <= p_as_of
        AND (e.subsidiary_id = v_sub.id OR (v_sub.id IS NULL AND e.subsidiary_id IS NULL))
      GROUP BY l.account_code
    ) a;

    v_entity := jsonb_build_object(
      'code', v_sub.code, 'name', v_sub.name, 'currency', v_sub.currency,
      'closing_rate', v_rate,
      'net_local_cents', v_local,
      'net_translated_cents', v_translated,
      'accounts', v_accounts);
    v_entities := v_entities || jsonb_build_array(v_entity);
    v_total := v_total + COALESCE(v_translated, 0);
  END LOOP;

  RETURN jsonb_build_object('success', true,
    'as_of', p_as_of,
    'presentation_currency', v_pres,
    'method', 'closing-rate translation of net per account (trial-balance level)',
    'entities', v_entities,
    'consolidated_net_cents', v_total,
    'missing_rates', to_jsonb(v_missing));
END;
$function$;

REVOKE ALL ON FUNCTION public.journal_entry_debit_total(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.journal_entry_debit_total(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.journal_entry_approval_applies(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.journal_entry_approval_applies(bigint) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.journal_entry_approval_covered(uuid, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.journal_entry_approval_covered(uuid, bigint) TO authenticated, service_role;

DO $grants$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.journal_entry_debit_total(uuid)',
    'public.journal_entry_approval_applies(bigint)',
    'public.journal_entry_approval_covered(uuid, bigint)',
    'public.request_journal_entry_approval(uuid, text)',
    'public.post_journal_entry(uuid)',
    'public.journal_entry_post_needs_its_approval()',
    'public.journal_entry_manual_waits_for_approval()',
    'public.cash_flow_forecast(integer, boolean)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
  EXECUTE 'REVOKE ALL ON FUNCTION public.journal_entry_approval_status(uuid) FROM PUBLIC, anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.journal_entry_approval_status(uuid) TO authenticated, service_role';
  -- Regelns egen begäran anropas bara av triggern.
  REVOKE ALL ON FUNCTION public.request_journal_entry_approval_internal(uuid) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.request_journal_entry_approval_internal(uuid) TO service_role;
END
$grants$;

-- ─────────────────────────────────────────────────────────────────────────
-- Beviset
-- ─────────────────────────────────────────────────────────────────────────
DO $proof$
DECLARE
  v_rule uuid; v_small uuid; v_big uuid; v_auto uuid; v_req uuid; v_r jsonb; v_status text; v_bank text; v_other text;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  BEGIN
    v_bank := public.account_for('bank');
    v_other := public.account_for('expense_default');
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'proof skipped: no accounting locale is active on this instance (%).', SQLERRM;
    RETURN;
  END;
  IF v_bank IS NULL OR v_other IS NULL THEN
    RAISE NOTICE 'proof skipped: bank / expense_default roles are not mapped.';
    RETURN;
  END IF;

  BEGIN
    UPDATE public.approval_rules SET is_active = false WHERE entity_type = 'journal_entry';
    UPDATE public.approval_chains SET is_active = false WHERE entity_type = 'journal_entry';
    INSERT INTO public.approval_rules (name, entity_type, amount_threshold_cents, currency, required_role)
    VALUES ('Proof: manual entries ≥ 10 000', 'journal_entry', 1000000, public.platform_default_currency(), 'admin')
    RETURNING id INTO v_rule;

    -- Under tröskeln: bokförs som vanligt.
    INSERT INTO public.journal_entries (entry_date, description, status, source) VALUES (CURRENT_DATE, 'Proof small', 'posted', 'manual') RETURNING id INTO v_small;
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents) VALUES (v_small, v_other, 50000, 0), (v_small, v_bank, 0, 50000);
    -- Över tröskeln, manuell: blir ett utkast med en begäran när raderna är på plats.
    INSERT INTO public.journal_entries (entry_date, description, status, source) VALUES (CURRENT_DATE, 'Proof big', 'posted', 'mcp') RETURNING id INTO v_big;
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents) VALUES (v_big, v_other, 2000000, 0), (v_big, v_bank, 0, 2000000);
    -- Över tröskeln, automatisk: berörs inte.
    INSERT INTO public.journal_entries (entry_date, description, status, source) VALUES (CURRENT_DATE, 'Proof automatic', 'posted', 'vendor_invoice') RETURNING id INTO v_auto;
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents) VALUES (v_auto, v_other, 2000000, 0), (v_auto, v_bank, 0, 2000000);

    SET CONSTRAINTS public.journal_entry_manual_waits_for_approval IMMEDIATE;

    IF (SELECT status FROM public.journal_entries WHERE id = v_small) <> 'posted' THEN RAISE EXCEPTION 'proof failed: a small manual entry was held'; END IF;
    IF (SELECT status FROM public.journal_entries WHERE id = v_auto) <> 'posted' THEN RAISE EXCEPTION 'proof failed: an automatic booking was held'; END IF;
    IF (SELECT status FROM public.journal_entries WHERE id = v_big) <> 'draft' THEN RAISE EXCEPTION 'proof failed: a big manual entry was posted without approval'; END IF;
    SELECT id INTO v_req FROM public.approval_requests WHERE entity_type = 'journal_entry' AND entity_id = v_big::text AND status::text = 'pending';
    IF v_req IS NULL THEN RAISE EXCEPTION 'proof failed: the held entry has no approval request'; END IF;

    v_r := public.post_journal_entry(v_big);
    RAISE EXCEPTION 'proof failed: an unapproved entry was posted → %', v_r;
  EXCEPTION WHEN sqlstate 'P0001' THEN
    IF SQLERRM LIKE 'proof failed%' THEN RAISE; END IF;
    -- fortsätt i ett eget block: den vägrade bokningen rullade tillbaka sitt delblock
  END;
  RAISE NOTICE 'proof (part 1) passed: small posts, automatic untouched, big manual held as draft with a request, unapproved post refused.';

  BEGIN
    INSERT INTO public.approval_rules (name, entity_type, amount_threshold_cents, currency, required_role)
    VALUES ('Proof 2', 'journal_entry', 1000000, public.platform_default_currency(), 'admin');
    INSERT INTO public.journal_entries (entry_date, description, status, source) VALUES (CURRENT_DATE, 'Proof draft', 'draft', 'manual') RETURNING id INTO v_big;
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents) VALUES (v_big, v_other, 2000000, 0), (v_big, v_bank, 0, 2000000);
    v_r := public.request_journal_entry_approval(v_big, 'proof');
    PERFORM public.resolve_approval((v_r->>'approval_request_id')::uuid, 'approve', 'proof');
    v_r := public.post_journal_entry(v_big);
    IF NOT (v_r->>'success')::boolean THEN RAISE EXCEPTION 'proof failed: an approved entry could not be posted → %', v_r; END IF;

    v_r := public.cash_flow_forecast(4);
    IF NOT (v_r->>'success')::boolean OR jsonb_array_length(v_r->'by_week') <> 4 THEN
      RAISE EXCEPTION 'proof failed: forecast → %', v_r;
    END IF;
    RAISE EXCEPTION 'proof-rollback';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'proof-rollback' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'proof passed: an approved draft posts; the forecast answers four weeks.';
END
$proof$;
