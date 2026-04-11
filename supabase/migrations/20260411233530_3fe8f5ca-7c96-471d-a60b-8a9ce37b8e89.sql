
-- Fix trigger: projects has no status column, use is_active
CREATE OR REPLACE FUNCTION public.trigger_project_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM dispatch_automation_event(
    'project.created', 'project_created',
    jsonb_build_object('id', NEW.id, 'name', NEW.name, 'is_active', NEW.is_active),
    'project', NEW.id::text
  );
  RETURN NEW;
END;
$$;

-- Update skill descriptions with proper routing markers
UPDATE public.agent_skills SET
  tool_definition = jsonb_set(tool_definition, '{function,description}',
    '"Upload, search, categorize, and delete documents in the central archive. Use when: storing contracts, HR docs, financial records, or project files. NOT for: media library images (manage_media), blog content."'::jsonb)
WHERE name = 'manage_document';

UPDATE public.agent_skills SET
  tool_definition = jsonb_set(tool_definition, '{function,description}',
    '"Create, update, search, and close projects. Use when: starting new client work, updating project status, reviewing active projects. NOT for: individual tasks (manage_project_task), timesheets (log_time)."'::jsonb)
WHERE name = 'manage_project';

UPDATE public.agent_skills SET
  tool_definition = jsonb_set(tool_definition, '{function,description}',
    '"Create, update, move, and list tasks within a project. Use when: adding work items, moving kanban tasks, checking task status. NOT for: CRM tasks (manage_crm_tasks), project-level operations (manage_project)."'::jsonb)
WHERE name = 'manage_project_task';

UPDATE public.agent_skills SET
  tool_definition = jsonb_set(tool_definition, '{function,description}',
    '"CRUD for employee records. Use when: onboarding new staff, updating departments, managing employment status. NOT for: leave management (manage_leave), expenses (manage_expenses)."'::jsonb)
WHERE name = 'manage_employee';

UPDATE public.agent_skills SET
  tool_definition = jsonb_set(tool_definition, '{function,description}',
    '"Manage leave requests: create, approve, deny, list. Use when: employee requests time off, manager needs to approve leave, checking leave balances. NOT for: employee records (manage_employee), timesheets (log_time)."'::jsonb)
WHERE name = 'manage_leave';

UPDATE public.agent_skills SET
  tool_definition = jsonb_set(tool_definition, '{function,description}',
    '"CRUD for contracts and agreements. Use when: creating vendor or client contracts, tracking renewals, updating contract status. NOT for: purchase orders (manage_purchase_order), deals (manage_deal)."'::jsonb)
WHERE name = 'manage_contract';
