CREATE OR REPLACE FUNCTION public.auto_mark_invoice_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice public.invoices;
  v_total_matched BIGINT;
  v_updated_count INT;
BEGIN
  IF NEW.entity_type <> 'invoice' OR NEW.entity_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO v_invoice FROM public.invoices WHERE id = NEW.entity_id;
  IF v_invoice.id IS NULL OR v_invoice.status = 'paid' THEN RETURN NEW; END IF;

  SELECT COALESCE(SUM(ABS(amount_cents)), 0) INTO v_total_matched
  FROM public.reconciliation_matches
  WHERE entity_type = 'invoice' AND entity_id = NEW.entity_id;

  IF v_total_matched >= v_invoice.total_cents THEN
    UPDATE public.invoices
       SET status = 'paid',
           paid_at = now(),
           paid_amount_cents = v_total_matched,
           updated_at = now()
     WHERE id = NEW.entity_id AND status <> 'paid';

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count > 0 THEN
      -- Fan out on the platform event bus so the accounting listener
      -- can post the journal entry (Dt 1930 / Cr 1510). Never hardcode
      -- bookkeeping into this trigger.
      PERFORM public.emit_platform_event(
        'invoice.paid',
        jsonb_build_object(
          'invoice_id', v_invoice.id,
          'invoice_number', v_invoice.invoice_number,
          'paid_amount_cents', v_total_matched,
          'total_cents', v_invoice.total_cents,
          'currency', v_invoice.currency,
          'source', 'auto_reconciliation',
          'reconciliation_match_id', NEW.id
        ),
        'trigger:auto_mark_invoice_paid'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;