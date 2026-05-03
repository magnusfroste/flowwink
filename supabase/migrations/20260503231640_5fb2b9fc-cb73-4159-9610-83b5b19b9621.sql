-- ============================================================================
-- Platform Event Bus: Lifecycle Triggers
-- Idempotent — safe to re-run.
-- ============================================================================

-- 1) invoice.paid ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_emit_invoice_paid()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.status = 'paid' AND (OLD.status IS DISTINCT FROM 'paid') THEN
    PERFORM emit_platform_event('invoice.paid', jsonb_build_object(
      'invoice_id', NEW.id,
      'lead_id', NEW.lead_id,
      'paid_at', COALESCE(NEW.paid_at, now())
    ), 'platform.invoices');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_emit_invoice_paid ON public.invoices;
CREATE TRIGGER trg_emit_invoice_paid AFTER UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.tg_emit_invoice_paid();

-- 2) quote.accepted ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_emit_quote_accepted()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.status = 'accepted' AND (OLD.status IS DISTINCT FROM 'accepted') THEN
    PERFORM emit_platform_event('quote.accepted', jsonb_build_object(
      'quote_id', NEW.id,
      'lead_id', NEW.lead_id,
      'accepted_at', COALESCE(NEW.accepted_at, now())
    ), 'platform.quotes');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_emit_quote_accepted ON public.quotes;
CREATE TRIGGER trg_emit_quote_accepted AFTER UPDATE ON public.quotes
FOR EACH ROW EXECUTE FUNCTION public.tg_emit_quote_accepted();

-- 3) contract.signed ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_emit_contract_signed()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.status = 'active' AND (OLD.status IS DISTINCT FROM 'active') THEN
    PERFORM emit_platform_event('contract.signed', jsonb_build_object(
      'contract_id', NEW.id,
      'signed_at', COALESCE(NEW.signed_at, now())
    ), 'platform.contracts');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_emit_contract_signed ON public.contracts;
CREATE TRIGGER trg_emit_contract_signed AFTER UPDATE ON public.contracts
FOR EACH ROW EXECUTE FUNCTION public.tg_emit_contract_signed();

-- 4) subscription.created + 5) subscription.churned ------------------------
CREATE OR REPLACE FUNCTION public.tg_emit_subscription_events()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM emit_platform_event('subscription.created', jsonb_build_object(
      'subscription_id', NEW.id,
      'customer_email', NEW.customer_email,
      'product_id', NEW.product_id,
      'unit_amount_cents', NEW.unit_amount_cents,
      'currency', NEW.currency,
      'billing_interval', NEW.billing_interval,
      'status', NEW.status
    ), 'platform.subscriptions');
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IN ('canceled','unpaid','incomplete_expired')
       AND (OLD.status IS DISTINCT FROM NEW.status) THEN
      PERFORM emit_platform_event('subscription.churned', jsonb_build_object(
        'subscription_id', NEW.id,
        'customer_email', NEW.customer_email,
        'product_id', NEW.product_id,
        'previous_status', OLD.status,
        'new_status', NEW.status,
        'canceled_at', COALESCE(NEW.canceled_at, NEW.ended_at, now()),
        'reason', NEW.at_risk_reason
      ), 'platform.subscriptions');
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_emit_subscription_events ON public.subscriptions;
CREATE TRIGGER trg_emit_subscription_events
AFTER INSERT OR UPDATE ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.tg_emit_subscription_events();

-- 6) shipment.dispatched ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_emit_shipment_dispatched()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.status IN ('shipped','in_transit','dispatched')
     AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM emit_platform_event('shipment.dispatched', jsonb_build_object(
      'shipment_id', NEW.id,
      'order_id', NEW.order_id,
      'carrier_code', NEW.carrier_code,
      'tracking_number', NEW.tracking_number,
      'tracking_url', NEW.tracking_url,
      'shipped_at', COALESCE(NEW.shipped_at, now())
    ), 'platform.shipments');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_emit_shipment_dispatched ON public.shipments;
CREATE TRIGGER trg_emit_shipment_dispatched AFTER UPDATE ON public.shipments
FOR EACH ROW EXECUTE FUNCTION public.tg_emit_shipment_dispatched();

-- 7) return.received --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_emit_return_received()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.status = 'received' AND (OLD.status IS DISTINCT FROM 'received') THEN
    PERFORM emit_platform_event('return.received', jsonb_build_object(
      'return_id', NEW.id,
      'rma_number', NEW.rma_number,
      'order_id', NEW.order_id,
      'reason', NEW.reason,
      'received_at', COALESCE(NEW.received_at, now())
    ), 'platform.returns');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_emit_return_received ON public.returns;
CREATE TRIGGER trg_emit_return_received AFTER UPDATE ON public.returns
FOR EACH ROW EXECUTE FUNCTION public.tg_emit_return_received();

-- 8) expense.approved -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_emit_expense_approved()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    PERFORM emit_platform_event('expense.approved', jsonb_build_object(
      'expense_report_id', NEW.id,
      'user_id', NEW.user_id,
      'period', NEW.period,
      'total_cents', NEW.total_cents,
      'currency', NEW.currency,
      'approved_at', COALESCE(NEW.approved_at, now()),
      'approved_by', NEW.approved_by
    ), 'platform.expenses');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_emit_expense_approved ON public.expense_reports;
CREATE TRIGGER trg_emit_expense_approved AFTER UPDATE ON public.expense_reports
FOR EACH ROW EXECUTE FUNCTION public.tg_emit_expense_approved();

-- 9) application.received ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_emit_application_received()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM emit_platform_event('application.received', jsonb_build_object(
    'application_id', NEW.id,
    'job_posting_id', NEW.job_posting_id,
    'candidate_name', NEW.candidate_name,
    'candidate_email', NEW.candidate_email,
    'source', NEW.source,
    'ai_score', NEW.ai_score,
    'recommendation', NEW.recommendation
  ), 'platform.recruitment');
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_emit_application_received ON public.applications;
CREATE TRIGGER trg_emit_application_received AFTER INSERT ON public.applications
FOR EACH ROW EXECUTE FUNCTION public.tg_emit_application_received();

-- 10) employee.hired --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_emit_employee_hired()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM emit_platform_event('employee.hired', jsonb_build_object(
    'employee_id', NEW.id,
    'email', NEW.email,
    'department', NEW.department,
    'start_date', NEW.start_date,
    'status', NEW.status
  ), 'platform.hr');
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_emit_employee_hired ON public.employees;
CREATE TRIGGER trg_emit_employee_hired AFTER INSERT ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.tg_emit_employee_hired();

-- 11) ticket.resolved -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_emit_ticket_resolved()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.status IN ('resolved','closed')
     AND (OLD.status IS DISTINCT FROM NEW.status)
     AND (OLD.status NOT IN ('resolved','closed') OR OLD.status IS NULL) THEN
    PERFORM emit_platform_event('ticket.resolved', jsonb_build_object(
      'ticket_id', NEW.id,
      'lead_id', NEW.lead_id,
      'previous_status', OLD.status,
      'new_status', NEW.status,
      'resolved_at', COALESCE(NEW.resolved_at, NEW.closed_at, now())
    ), 'platform.tickets');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_emit_ticket_resolved ON public.tickets;
CREATE TRIGGER trg_emit_ticket_resolved AFTER UPDATE ON public.tickets
FOR EACH ROW EXECUTE FUNCTION public.tg_emit_ticket_resolved();
