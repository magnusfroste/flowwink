
-- 1. Employee created
CREATE OR REPLACE FUNCTION public.trigger_employee_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM dispatch_automation_event(
    'employee.created', 'employee_created',
    jsonb_build_object('id', NEW.id, 'name', NEW.name, 'email', COALESCE(NEW.email, ''), 'department', COALESCE(NEW.department, ''), 'employment_type', NEW.employment_type::text),
    'employee', NEW.id::text
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_employee_created ON public.employees;
CREATE TRIGGER on_employee_created
  AFTER INSERT ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.trigger_employee_created();

-- 2. Leave requested + status changed
CREATE OR REPLACE FUNCTION public.trigger_leave_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM dispatch_automation_event(
    'leave.requested', 'leave_requested',
    jsonb_build_object('id', NEW.id, 'employee_id', NEW.employee_id, 'leave_type', NEW.leave_type, 'start_date', NEW.start_date, 'end_date', NEW.end_date, 'status', NEW.status),
    'leave', NEW.id::text
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_leave_created ON public.leave_requests;
CREATE TRIGGER on_leave_created
  AFTER INSERT ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.trigger_leave_created();

CREATE OR REPLACE FUNCTION public.trigger_leave_status_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM dispatch_automation_event(
      'leave.status_changed', 'leave_status_changed',
      jsonb_build_object('id', NEW.id, 'employee_id', NEW.employee_id, 'old_status', OLD.status, 'new_status', NEW.status, 'leave_type', NEW.leave_type),
      'leave', NEW.id::text
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_leave_status_changed ON public.leave_requests;
CREATE TRIGGER on_leave_status_changed
  AFTER UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.trigger_leave_status_changed();

-- 3. Expense submitted + status changed
CREATE OR REPLACE FUNCTION public.trigger_expense_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM dispatch_automation_event(
    'expense.submitted', 'expense_submitted',
    jsonb_build_object('id', NEW.id, 'description', COALESCE(NEW.description, ''), 'amount_cents', NEW.amount_cents, 'currency', NEW.currency, 'category', COALESCE(NEW.category, ''), 'status', NEW.status),
    'expense', NEW.id::text
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_expense_created ON public.expenses;
CREATE TRIGGER on_expense_created
  AFTER INSERT ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.trigger_expense_created();

CREATE OR REPLACE FUNCTION public.trigger_expense_status_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM dispatch_automation_event(
      'expense.status_changed', 'expense_status_changed',
      jsonb_build_object('id', NEW.id, 'old_status', OLD.status, 'new_status', NEW.status, 'amount_cents', NEW.amount_cents, 'currency', NEW.currency),
      'expense', NEW.id::text
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_expense_status_changed ON public.expenses;
CREATE TRIGGER on_expense_status_changed
  AFTER UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.trigger_expense_status_changed();

-- 4. Project created + task completed
CREATE OR REPLACE FUNCTION public.trigger_project_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM dispatch_automation_event(
    'project.created', 'project_created',
    jsonb_build_object('id', NEW.id, 'name', NEW.name, 'status', NEW.status),
    'project', NEW.id::text
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_project_created ON public.projects;
CREATE TRIGGER on_project_created
  AFTER INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.trigger_project_created();

CREATE OR REPLACE FUNCTION public.trigger_task_completed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'done' THEN
    PERFORM dispatch_automation_event(
      'task.completed', 'task_completed',
      jsonb_build_object('id', NEW.id, 'title', NEW.title, 'project_id', NEW.project_id),
      'project_task', NEW.id::text
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_task_completed ON public.project_tasks;
CREATE TRIGGER on_task_completed
  AFTER UPDATE ON public.project_tasks
  FOR EACH ROW EXECUTE FUNCTION public.trigger_task_completed();

-- 5. Document uploaded
CREATE OR REPLACE FUNCTION public.trigger_document_uploaded()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM dispatch_automation_event(
    'document.uploaded', 'document_uploaded',
    jsonb_build_object('id', NEW.id, 'title', NEW.title, 'category', COALESCE(NEW.category, ''), 'related_entity_type', COALESCE(NEW.related_entity_type, '')),
    'document', NEW.id::text
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_document_uploaded ON public.documents;
CREATE TRIGGER on_document_uploaded
  AFTER INSERT ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.trigger_document_uploaded();

-- 6. Contract created + status changed
CREATE OR REPLACE FUNCTION public.trigger_contract_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM dispatch_automation_event(
    'contract.created', 'contract_created',
    jsonb_build_object('id', NEW.id, 'title', NEW.title, 'counterparty_name', NEW.counterparty_name, 'status', NEW.status::text, 'contract_type', NEW.contract_type::text),
    'contract', NEW.id::text
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_contract_created ON public.contracts;
CREATE TRIGGER on_contract_created
  AFTER INSERT ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.trigger_contract_created();

CREATE OR REPLACE FUNCTION public.trigger_contract_status_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM dispatch_automation_event(
      'contract.status_changed', 'contract_status_changed',
      jsonb_build_object('id', NEW.id, 'title', NEW.title, 'old_status', OLD.status::text, 'new_status', NEW.status::text),
      'contract', NEW.id::text
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_contract_status_changed ON public.contracts;
CREATE TRIGGER on_contract_status_changed
  AFTER UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.trigger_contract_status_changed();
