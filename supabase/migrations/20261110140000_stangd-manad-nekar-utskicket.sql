-- ============================================================================
-- A closed month refuses the issue again (2026-11-10).
--
-- 20261110120000 wrapped the booking of a sent invoice in EXCEPTION WHEN
-- others, so that a salesperson without the accounting grant could send an
-- invoice ("Requires the accounting module" used to refuse the send). The net
-- was too wide: it also swallowed the period lock, so an invoice dated in a
-- closed month was issued, left unbooked, with only a warning in a log. The
-- night's fresh install caught it (record-to-report: "issuing it is refused —
-- its entry would land in the closed month").
--
-- The handler now lets through the grant refusal alone and re-raises
-- everything else. Body is 20261110120000's with that one change.
-- ============================================================================

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
      -- ONLY that refusal is let through. Every other error still stops the
      -- send: an entry that would land in a closed month must refuse the
      -- issue and leave the invoice a draft (record-to-report proves it).
      BEGIN
        v_res := public.book_invoice_issued(NEW.id);
      EXCEPTION WHEN others THEN
        IF SQLERRM NOT LIKE 'Requires the accounting module%' THEN
          RAISE;
        END IF;
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
