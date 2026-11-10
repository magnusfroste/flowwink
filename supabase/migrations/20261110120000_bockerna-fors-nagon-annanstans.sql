-- ============================================================================
-- The books are kept somewhere else (2026-11-10, #862 part 1.4).
--
-- A customer runs sales, quotes, contracts, subscriptions and tickets in
-- FlowWink and keeps the books in another system (Fortnox, Visma …). FlowWink
-- booked anyway: every invoice sent or paid, every order paid and every vendor
-- invoice registered wrote a voucher against the chart of accounts — a second
-- set of books nobody asked for, growing silently beside the real one.
--
-- The dial is a declared fact: accounting_preferences.ledger = 'external'
-- (Accounting → Settings; default 'internal'). books_kept_here() is its one
-- reader. With the books elsewhere:
--   * the three automatic bookings do nothing (invoice issued/paid/cancelled,
--     order paid, vendor invoice registered);
--   * check_books answers that the books are external instead of listing every
--     invoice as unbooked work;
--   * book_unbooked_invoices books nothing.
-- Nothing already booked is touched, and switching back to 'internal' leaves
-- book_unbooked_invoices() to catch up.
--
-- Also fixed in on_invoice_status_book: the UPDATE → sent branch had no
-- exception block, so a person without the accounting grant who sent an
-- invoice was refused with "Requires the accounting module". A booking that
-- cannot be made never stops the send; it is warned, as the INSERT branch
-- already did. The one deliberate refusal stays: no exchange rate.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.books_kept_here()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $$
  SELECT COALESCE(
    (SELECT value ->> 'ledger' FROM public.site_settings WHERE key = 'accounting_preferences'),
    'internal') <> 'external'
$$;
REVOKE ALL ON FUNCTION public.books_kept_here() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.books_kept_here() TO authenticated, service_role;
COMMENT ON FUNCTION public.books_kept_here() IS
  'false when accounting_preferences.ledger = ''external'': the books are kept in another system and FlowWink books nothing by itself. The one reader of that dial.';

-- ── Invoices ─────────────────────────────────────────────────────────────────
-- Body is 20261026100000's plus the gate and the exception block on → sent.
CREATE OR REPLACE FUNCTION public.on_invoice_status_book()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE v_res jsonb;
BEGIN
  -- The books are kept elsewhere: the invoice is a commercial document here, not a voucher.
  IF NOT public.books_kept_here() THEN RETURN NEW; END IF;
  -- A POS receipt is booked by the session close — neither the receivable nor the payment is the invoice's to book.
  IF NEW.origin = 'pos_receipt' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    -- Bokför en faktura som föds färdig. Får aldrig fälla själva skrivningen:
    -- en kund som handlar ska inte nekas för att kontoplanen inte är vald.
    IF NEW.status IN ('sent'::invoice_status, 'paid'::invoice_status) THEN
      BEGIN
        v_res := public.book_invoice_issued(NEW.id);
        IF NOT coalesce((v_res ->> 'success')::boolean, false)
           AND (v_res ->> 'skipped') IS NULL THEN
          RAISE WARNING 'invoice % was created as % but the receivable was not booked: % — run book_unbooked_invoices()',
            NEW.invoice_number, NEW.status, coalesce(v_res ->> 'error', 'declined without a reason');
        END IF;
      EXCEPTION WHEN others THEN
        RAISE WARNING 'invoice % was created as % but could not be booked: % — run book_unbooked_invoices() once accounting is configured',
          NEW.invoice_number, NEW.status, SQLERRM;
      END;
      IF NEW.status = 'paid'::invoice_status THEN
        BEGIN
          v_res := public.book_invoice_paid(NEW.id);
          IF NOT coalesce((v_res ->> 'success')::boolean, false)
             AND (v_res ->> 'skipped') IS NULL THEN
            RAISE WARNING 'invoice % was created as paid but the payment was not booked: % — the receivable stands open',
              NEW.invoice_number, coalesce(v_res ->> 'error', 'declined without a reason');
          END IF;
        EXCEPTION WHEN others THEN
          RAISE WARNING 'invoice % was created as paid but the payment could not be booked: %',
            NEW.invoice_number, SQLERRM;
        END;
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'sent'::invoice_status THEN
      v_res := NULL;
      -- A booking that cannot be made never stops the send: a salesperson
      -- without the accounting grant was refused here ("Requires the accounting
      -- module") for sending an invoice. Warned, and book_unbooked_invoices()
      -- catches it up.
      BEGIN
        v_res := public.book_invoice_issued(NEW.id);
      EXCEPTION WHEN others THEN
        RAISE WARNING 'invoice % was sent but could not be booked: % — run book_unbooked_invoices()',
          NEW.invoice_number, SQLERRM;
      END;
      -- An admin issuing a foreign-currency invoice without a rate hears it
      -- now, not from a warning in a log: the send is refused with the fix.
      IF v_res IS NOT NULL
         AND NOT coalesce((v_res ->> 'success')::boolean, false) AND (v_res ->> 'skipped') IS NULL
         AND (v_res ->> 'error') LIKE 'No exchange rate%' THEN
        RAISE EXCEPTION '%', v_res ->> 'error' USING ERRCODE = 'check_violation';
      END IF;
    ELSIF NEW.status = 'paid'::invoice_status THEN
      PERFORM public.book_invoice_paid(NEW.id);
    ELSIF NEW.status::text IN ('cancelled', 'void') THEN
      -- Makuleringen får aldrig hindras av bokföringen, men heller aldrig
      -- passera tyst utan den.
      BEGIN
        v_res := public.book_invoice_cancelled(NEW.id);
      EXCEPTION WHEN others THEN
        RAISE WARNING 'invoice % was % but its issue entry was not reversed: % — run book_invoice_cancelled(%)',
          NEW.invoice_number, NEW.status, SQLERRM, NEW.id;
      END;
    END IF;
  END IF;
  RETURN NEW;
END $fn$;

-- ── Orders ───────────────────────────────────────────────────────────────────
-- Body is 20260917190000's plus the gate.
CREATE OR REPLACE FUNCTION public.on_order_paid_book()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE v_res jsonb;
BEGIN
  IF NOT public.books_kept_here() THEN RETURN NEW; END IF;
  IF NEW.status = 'paid' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'paid') THEN
    BEGIN
      PERFORM set_config('request.jwt.claims', COALESCE(current_setting('request.jwt.claims', true), '{"role":"service_role"}'), true);
      v_res := public.book_order_paid(NEW.id);
      IF NOT COALESCE((v_res->>'success')::boolean, false) AND (v_res->>'skipped') IS NULL THEN
        RAISE WARNING 'order % paid but not booked: % — run book_order_paid(%) once accounting is configured', NEW.id, v_res->>'error', NEW.id;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'order % paid but could not be booked: % — run book_order_paid(%) once accounting is configured', NEW.id, SQLERRM, NEW.id;
    END;
  END IF;
  RETURN NEW;
END $fn$;

-- ── Vendor invoices ──────────────────────────────────────────────────────────
-- Body is 20260827200000's plus the gate.
CREATE OR REPLACE FUNCTION public.book_vendor_invoice_on_register()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.books_kept_here() THEN RETURN NEW; END IF;
  -- Medvetet OSKYDDAD av något EXCEPTION-block. En sväljd bokföring är exakt
  -- det fel den här migrationen lagar: fakturan registrerades, ingenting
  -- bokfördes, och ingen fick veta.
  PERFORM public.book_vendor_invoice(NEW.id, NEW.invoice_date);
  RETURN NEW;
END;
$function$;

-- ── The two readers that would call it unbooked work ────────────────────────
-- Patched in place (their bodies moved today in 20261110090001): one early
-- answer after the permission check. Idempotent — a body that already asks
-- books_kept_here() is left alone; a body that does not match is refused loudly.
DO $$
DECLARE
  v_def text;
  v_new text;
  v_anchor text;
BEGIN
  -- check_books
  v_def := pg_get_functiondef('public.check_books(date)'::regprocedure);
  IF v_def NOT LIKE '%books_kept_here()%' THEN
    v_anchor := E'RAISE EXCEPTION ''Only accounting staff can run the books health check'' USING ERRCODE = ''42501'';\n  END IF;';
    IF position(v_anchor IN v_def) = 0 THEN
      RAISE EXCEPTION 'check_books: the body did not match — add the books_kept_here() answer by hand';
    END IF;
    v_new := replace(v_def, v_anchor, v_anchor || E'\n'
      || E'  -- The books are kept in another system: nothing here is unbooked work.\n'
      || E'  IF NOT public.books_kept_here() THEN\n'
      || E'    RETURN jsonb_build_object(''as_of'', p_as_of, ''currency'', v_cur, ''external_ledger'', true,\n'
      || E'      ''summary'', jsonb_build_object(''high'', 0, ''medium'', 0, ''low'', 0, ''total'', 0),\n'
      || E'      ''ok'', true, ''findings'', ''[]''::jsonb, ''next_deadlines'', ''[]''::jsonb, ''overdue_filings'', 0,\n'
      || E'      ''calendar_note'', ''The books are kept in an external system (Accounting → Settings → Ledger). FlowWink books nothing and checks nothing here.'',\n'
      || E'      ''generated_at'', now());\n'
      || E'  END IF;');
    EXECUTE v_new;
  END IF;

  -- book_unbooked_invoices
  v_def := pg_get_functiondef('public.book_unbooked_invoices(boolean, integer)'::regprocedure);
  IF v_def NOT LIKE '%books_kept_here()%' THEN
    v_new := regexp_replace(v_def, E'(\\nBEGIN\\s*\\n)',
      E'\\1  IF NOT public.books_kept_here() THEN\n'
      || E'    RETURN jsonb_build_object(''success'', true, ''dry_run'', p_dry_run, ''found'', 0, ''booked'', 0, ''total_cents'', 0, ''failed'', ''[]''::jsonb,\n'
      || E'      ''external_ledger'', true, ''note'', ''The books are kept in an external system — nothing is booked here.'');\n'
      || E'  END IF;\n');
    IF v_new = v_def THEN
      RAISE EXCEPTION 'book_unbooked_invoices: the body did not match — add the books_kept_here() answer by hand';
    END IF;
    EXECUTE v_new;
  END IF;
END $$;
