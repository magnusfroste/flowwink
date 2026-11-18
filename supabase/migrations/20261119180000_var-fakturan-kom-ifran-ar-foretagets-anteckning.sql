-- ============================================================================
-- Where an invoice came from is the business's note, not the customer's
-- (2026-11-19).
--
-- Found on the customer's invoice page: "Notes — Generated from contract
-- 3f2a…-uuid". Four functions that make an invoice by themselves (from an
-- agreement, a subscription period, a till receipt, a project's timesheets)
-- wrote where it came from into invoices.notes — the field the invoice page
-- and the PDF print for the customer. An internal id is nothing a customer can
-- use, and "Auto-generated" is not what an invoice should say about itself.
--
--   invoices.origin_note   where the invoice came from, for the business
--   aa_invoices_origin_is_internal
--                          on insert, a line that says "Generated from …" /
--                          "Auto-generated from …" moves there; what the
--                          customer can use (a PO number, the period billed)
--                          stays in notes. One rule for every writer, the four
--                          today and the next one.
--
-- Drafts get the same treatment now. An ISSUED invoice is final and is left as
-- it was sent.
--
-- And the timesheet invoice asks the one number series: it read "highest so
-- far plus one" itself, which two callers at once answer alike.
-- ============================================================================

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS origin_note text;
COMMENT ON COLUMN public.invoices.origin_note IS 'Where the invoice came from (an agreement, a subscription period, timesheets …) — for the business. Never printed for the customer; invoices.notes is.';

CREATE OR REPLACE FUNCTION public.invoice_split_origin_note(p_notes text)
RETURNS TABLE(customer_notes text, origin text)
LANGUAGE sql
IMMUTABLE
AS $$
  -- Line by line: provenance to the business, the rest to the customer.
  SELECT nullif(btrim(string_agg(l, E'\n' ORDER BY n) FILTER (WHERE l !~* '^\s*(auto-)?generated (from|by|for) '), E' \n\t'), ''),
         nullif(btrim(string_agg(l, E'\n' ORDER BY n) FILTER (WHERE l ~* '^\s*(auto-)?generated (from|by|for) '), E' \n\t'), '')
    FROM unnest(string_to_array(coalesce(p_notes, ''), E'\n')) WITH ORDINALITY AS t(l, n)
$$;

CREATE OR REPLACE FUNCTION public.invoices_origin_is_internal()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v record;
BEGIN
  IF NEW.notes IS NULL OR NEW.notes !~* '(^|\n)\s*(auto-)?generated (from|by|for) ' THEN
    RETURN NEW;
  END IF;
  SELECT * INTO v FROM public.invoice_split_origin_note(NEW.notes);
  NEW.origin_note := concat_ws(E'\n', nullif(NEW.origin_note, ''), v.origin);
  NEW.notes := v.customer_notes;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS aa_invoices_origin_is_internal ON public.invoices;
CREATE TRIGGER aa_invoices_origin_is_internal
  BEFORE INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.invoices_origin_is_internal();

-- Drafts: nothing has been sent, so nothing a customer was shown changes.
UPDATE public.invoices i
   SET origin_note = concat_ws(E'\n', nullif(i.origin_note, ''), s.origin),
       notes = s.customer_notes
  FROM (SELECT d.id, x.customer_notes, x.origin
          FROM public.invoices d, LATERAL public.invoice_split_origin_note(d.notes) x
         WHERE d.status = 'draft' AND d.notes ~* '(^|\n)\s*(auto-)?generated (from|by|for) ') s
 WHERE i.id = s.id;

CREATE OR REPLACE FUNCTION public.bulk_invoice_from_timesheets(p_project_id uuid, p_start_date date, p_end_date date, p_group_by text DEFAULT 'entry'::text, p_due_days integer DEFAULT 30, p_tax_rate numeric DEFAULT NULL::numeric)
 RETURNS TABLE(invoice_id uuid, invoice_number text, line_count integer, total_cents bigint, hours_billed numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_project public.projects; v_invoice_id UUID; v_invoice_num TEXT; v_line_items JSONB := '[]'::jsonb;
  v_subtotal BIGINT := 0; v_tax_rate NUMERIC; v_tax_cents BIGINT; v_total_hours NUMERIC := 0;
  v_line_count INTEGER := 0; v_entry RECORD; v_entry_ids UUID[] := '{}';
  v_yr INT := EXTRACT(YEAR FROM public.platform_today())::int; v_last TEXT; v_nextnum INT := 1;
  v_partner_id uuid; v_partner_name text; v_partner_email text;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'invoicing')) THEN RAISE EXCEPTION 'Invoicing timesheets requires the invoicing module' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  IF v_project.id IS NULL THEN RAISE EXCEPTION 'Project not found'; END IF;
  IF NOT v_project.is_billable THEN RAISE EXCEPTION 'Project is not billable'; END IF;
  IF COALESCE(v_project.hourly_rate_cents, 0) <= 0 THEN RAISE EXCEPTION 'Project has no hourly rate set'; END IF;

  -- Momssatsen: den begärda (bråk 0.06 ELLER procent 6 — båda formerna förekommer
  -- i skillkontrakten), annars instansens standard. Aldrig ett tal i koden.
  v_tax_rate := CASE
    WHEN p_tax_rate IS NULL THEN public.order_line_vat_rate(NULL) / 100.0
    WHEN p_tax_rate > 1 THEN p_tax_rate / 100.0
    ELSE p_tax_rate END;
  IF v_tax_rate < 0 OR v_tax_rate > 1 THEN RAISE EXCEPTION 'p_tax_rate % is not a VAT rate (pass 0.25 or 25)', p_tax_rate; END IF;

  -- Kunden: projektets part. Utan den är fakturan ett belopp utan mottagare.
  IF v_project.partner_id IS NOT NULL THEN
    SELECT pa.id, pa.name, pa.email INTO v_partner_id, v_partner_name, v_partner_email FROM public.partners pa WHERE pa.id = v_project.partner_id;
  END IF;

  IF p_group_by = 'user' THEN
    FOR v_entry IN SELECT te.user_id, COALESCE(e.name, 'User') AS user_name, SUM(te.hours) AS total_hours, ARRAY_AGG(te.id) AS ids
      FROM public.time_entries te LEFT JOIN public.employees e ON e.user_id = te.user_id
      WHERE te.project_id = p_project_id AND te.entry_date BETWEEN p_start_date AND p_end_date AND te.is_billable = true AND te.is_invoiced = false GROUP BY te.user_id, e.name LOOP
      v_line_items := v_line_items || jsonb_build_object('description', v_entry.user_name || ' — hours ' || to_char(p_start_date,'YYYY-MM-DD') || ' to ' || to_char(p_end_date,'YYYY-MM-DD'), 'qty', v_entry.total_hours, 'unit_price_cents', v_project.hourly_rate_cents);
      v_subtotal := v_subtotal + ROUND(v_entry.total_hours * v_project.hourly_rate_cents); v_total_hours := v_total_hours + v_entry.total_hours; v_line_count := v_line_count + 1; v_entry_ids := v_entry_ids || v_entry.ids;
    END LOOP;
  ELSIF p_group_by = 'week' THEN
    FOR v_entry IN SELECT date_trunc('week', te.entry_date)::date AS week_start, SUM(te.hours) AS total_hours, ARRAY_AGG(te.id) AS ids
      FROM public.time_entries te WHERE te.project_id = p_project_id AND te.entry_date BETWEEN p_start_date AND p_end_date AND te.is_billable = true AND te.is_invoiced = false GROUP BY date_trunc('week', te.entry_date) ORDER BY week_start LOOP
      v_line_items := v_line_items || jsonb_build_object('description', 'Week of ' || to_char(v_entry.week_start, 'YYYY-MM-DD'), 'qty', v_entry.total_hours, 'unit_price_cents', v_project.hourly_rate_cents);
      v_subtotal := v_subtotal + ROUND(v_entry.total_hours * v_project.hourly_rate_cents); v_total_hours := v_total_hours + v_entry.total_hours; v_line_count := v_line_count + 1; v_entry_ids := v_entry_ids || v_entry.ids;
    END LOOP;
  ELSE
    FOR v_entry IN SELECT te.id, te.entry_date, te.hours, te.description FROM public.time_entries te WHERE te.project_id = p_project_id AND te.entry_date BETWEEN p_start_date AND p_end_date AND te.is_billable = true AND te.is_invoiced = false ORDER BY te.entry_date LOOP
      v_line_items := v_line_items || jsonb_build_object('description', to_char(v_entry.entry_date,'YYYY-MM-DD') || ' — ' || COALESCE(v_entry.description, 'Hours'), 'qty', v_entry.hours, 'unit_price_cents', v_project.hourly_rate_cents);
      v_subtotal := v_subtotal + ROUND(v_entry.hours * v_project.hourly_rate_cents); v_total_hours := v_total_hours + v_entry.hours; v_line_count := v_line_count + 1; v_entry_ids := v_entry_ids || v_entry.id;
    END LOOP;
  END IF;
  IF v_line_count = 0 THEN RAISE EXCEPTION 'No billable, uninvoiced hours found for project in given period'; END IF;
  v_tax_cents := ROUND(v_subtotal * v_tax_rate);
  -- The one invoice series (next_document_number): reading "highest so far
  -- plus one" here let two callers answer the same number.
  v_invoice_num := public.next_document_number('invoice', 'INV');
  INSERT INTO public.invoices (invoice_number, customer_name, customer_email, partner_id, project_id, line_items, subtotal_cents, tax_rate, tax_cents, total_cents, currency, issue_date, due_date, status, created_by, notes)
  VALUES (v_invoice_num, COALESCE(v_partner_name, v_project.client_name, v_project.name), v_partner_email, v_partner_id, p_project_id, v_line_items, v_subtotal, v_tax_rate, v_tax_cents, v_subtotal + v_tax_cents, v_project.currency, public.platform_today(), public.platform_today() + p_due_days, 'draft', auth.uid(), 'Auto-generated from timesheets ' || p_start_date || ' – ' || p_end_date || E'\n' || p_start_date || ' – ' || p_end_date)
  RETURNING id INTO v_invoice_id;
  UPDATE public.time_entries SET is_invoiced = true, invoice_id = v_invoice_id, updated_at = now() WHERE id = ANY(v_entry_ids);
  invoice_id := v_invoice_id; invoice_number := v_invoice_num; line_count := v_line_count; total_cents := v_subtotal + v_tax_cents; hours_billed := v_total_hours;
  RETURN NEXT;
END; $$;


-- ── Proof: the rule itself — no row is read or written ──────────────────────
DO $$
DECLARE
  v record;
BEGIN
  SELECT * INTO v FROM public.invoice_split_origin_note(E'Generated from subscription 1b2c\nPO: 4711');
  IF v.customer_notes IS DISTINCT FROM 'PO: 4711' OR v.origin IS DISTINCT FROM 'Generated from subscription 1b2c' THEN
    RAISE EXCEPTION 'a subscription invoice note was split wrong: %', v;
  END IF;
  SELECT * INTO v FROM public.invoice_split_origin_note('Generated from contract 3f2a');
  IF v.customer_notes IS NOT NULL OR v.origin IS NULL THEN
    RAISE EXCEPTION 'a contract invoice note still reaches the customer: %', v;
  END IF;
  SELECT * INTO v FROM public.invoice_split_origin_note(E'Thank you for your business.\nPayment within 30 days.');
  IF v.customer_notes IS DISTINCT FROM E'Thank you for your business.\nPayment within 30 days.' OR v.origin IS NOT NULL THEN
    RAISE EXCEPTION 'a note a person wrote was touched: %', v;
  END IF;
END $$;
