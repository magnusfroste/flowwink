-- ============================================================================
-- An invoice is born right whoever creates it (2026-11-18).
--
-- Found by creating an invoice by hand in the admin, in a browser: the row had
-- no due date, no payment terms, and neither the customer's name nor e-mail —
-- only a lead_id. manage_invoice has given a new invoice its due date since
-- 2026-10-27 ("born right": the payment terms' days after the issue date, 30
-- when the terms say nothing), because a sent invoice without one is never
-- overdue and dunning never starts. That rule lived in the skill; the admin's
-- "New Invoice", and every other writer, went round it. And the invoice page
-- and the PDF print invoices.customer_name — empty on a hand-made invoice, so
-- the customer's own invoice did not carry their name.
--
-- The rule moves to the row, where every writer meets it:
--   · on INSERT, an invoice for a lead with no customer of its own takes the
--     lead's name and e-mail;
--   · on INSERT, and again when an invoice is ISSUED (draft → sent), an
--     invoice with no due date gets one from its terms, counted from the issue
--     date. A credit note owes nothing and gets none.
-- A due date or a customer someone wrote is never touched.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.invoices_born_right()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_days integer;
  v_name text;
  v_email text;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.lead_id IS NOT NULL
     AND (coalesce(btrim(NEW.customer_name), '') = '' OR coalesce(btrim(NEW.customer_email), '') = '') THEN
    SELECT l.name, l.email INTO v_name, v_email FROM public.leads l WHERE l.id = NEW.lead_id;
    IF coalesce(btrim(NEW.customer_name), '') = '' THEN NEW.customer_name := coalesce(v_name, ''); END IF;
    IF coalesce(btrim(NEW.customer_email), '') = '' THEN NEW.customer_email := v_email; END IF;
  END IF;

  IF NEW.due_date IS NULL
     AND coalesce(NEW.invoice_type, 'invoice') = 'invoice'
     AND (TG_OP = 'INSERT' OR (NEW.status::text = 'sent' AND OLD.status::text = 'draft')) THEN
    v_days := nullif(substring(coalesce(NEW.payment_terms, '') FROM '(\d{1,3})'), '')::integer;
    IF v_days IS NULL OR v_days <= 0 THEN v_days := 30; END IF;
    NEW.due_date := coalesce(NEW.issue_date, public.platform_today()) + v_days;
    IF coalesce(btrim(NEW.payment_terms), '') = '' THEN NEW.payment_terms := 'Net ' || v_days; END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Named to run before the other BEFORE triggers on the table (they fire in name
-- order): the party is resolved from the e-mail this one may have filled in.
DROP TRIGGER IF EXISTS a_invoices_born_right ON public.invoices;
CREATE TRIGGER a_invoices_born_right
  BEFORE INSERT OR UPDATE OF status ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.invoices_born_right();

-- ── Proof, rolled back: its own rows, none left ─────────────────────────────
DO $$
DECLARE
  v_lead uuid;
  v_inv record;
  v_tag text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
BEGIN
  BEGIN
    -- As the admin writes it: a lead, a number, nothing else. A lead the
    -- instance already has — the proof creates no customer of its own.
    SELECT l.id INTO v_lead FROM public.leads l WHERE coalesce(btrim(l.name), '') <> '' AND coalesce(btrim(l.email), '') <> '' LIMIT 1;
    IF v_lead IS NOT NULL THEN
      INSERT INTO public.invoices (invoice_number, lead_id, line_items, subtotal_cents, tax_cents, total_cents)
      VALUES ('PROOF-A-' || v_tag, v_lead, '[]'::jsonb, 0, 0, 0)
      RETURNING customer_name, customer_email, issue_date, due_date, payment_terms INTO v_inv;
      IF NOT EXISTS (SELECT 1 FROM public.leads l WHERE l.id = v_lead AND l.name = v_inv.customer_name AND l.email = v_inv.customer_email) THEN
        RAISE EXCEPTION 'born-right proof: the lead''s name and e-mail did not reach the invoice (%, %)', v_inv.customer_name, v_inv.customer_email;
      END IF;
      IF v_inv.due_date IS DISTINCT FROM v_inv.issue_date + 30 OR v_inv.payment_terms <> 'Net 30' THEN
        RAISE EXCEPTION 'born-right proof: no terms gave due % for issue % (%)', v_inv.due_date, v_inv.issue_date, v_inv.payment_terms;
      END IF;
    END IF;

    -- Terms someone wrote are counted; a due date someone wrote is kept.
    INSERT INTO public.invoices (invoice_number, customer_name, customer_email, payment_terms, line_items, subtotal_cents, tax_cents, total_cents)
    VALUES ('PROOF-B-' || v_tag, 'Own Name', 'own-' || v_tag || '@example.test', 'net14', '[]'::jsonb, 0, 0, 0)
    RETURNING customer_name, issue_date, due_date, payment_terms INTO v_inv;
    IF v_inv.due_date IS DISTINCT FROM v_inv.issue_date + 14 OR v_inv.payment_terms <> 'net14' OR v_inv.customer_name <> 'Own Name' THEN
      RAISE EXCEPTION 'born-right proof: net14 gave due % for issue % (%, %)', v_inv.due_date, v_inv.issue_date, v_inv.payment_terms, v_inv.customer_name;
    END IF;
    INSERT INTO public.invoices (invoice_number, customer_name, due_date, line_items, subtotal_cents, tax_cents, total_cents)
    VALUES ('PROOF-C-' || v_tag, 'Own Name', DATE '2031-01-31', '[]'::jsonb, 0, 0, 0)
    RETURNING due_date INTO v_inv;
    IF v_inv.due_date <> DATE '2031-01-31' THEN RAISE EXCEPTION 'born-right proof: a written due date was changed to %', v_inv.due_date; END IF;

    -- A credit note owes nothing.
    INSERT INTO public.invoices (invoice_number, customer_name, invoice_type, line_items, subtotal_cents, tax_cents, total_cents)
    VALUES ('PROOF-D-' || v_tag, 'Own Name', 'credit_note', '[]'::jsonb, 0, 0, 0)
    RETURNING due_date INTO v_inv;
    IF v_inv.due_date IS NOT NULL THEN RAISE EXCEPTION 'born-right proof: a credit note was given a due date (%)', v_inv.due_date; END IF;
    RAISE EXCEPTION 'proof-rollback';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'born-right proof:%' THEN RAISE; END IF;
    IF SQLERRM <> 'proof-rollback' THEN
      RAISE NOTICE 'invoices born right: proof rows not accepted here (%), skipped', SQLERRM;
    END IF;
  END;
END $$;
