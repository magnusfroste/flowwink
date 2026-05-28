UPDATE public.agent_skills
SET description = 'Log time entries for projects. Use when: employee reports hours worked, FlowPilot processes daily standups, user says "I worked 4 hours on X". NOT for: project management (use manage_projects), summaries (use timesheet_summary).'
WHERE name = 'log_time'
  AND (description IS NULL OR length(description) < 60);

UPDATE public.agent_skills
SET description = 'Generate timesheet summaries and reports. Use when: admin asks for weekly/monthly hours overview, billing summary, or "how much time have we spent on project X". NOT for: logging time (use log_time).'
WHERE name = 'timesheet_summary'
  AND (description IS NULL OR length(description) < 60);

UPDATE public.agent_skills
SET description = 'List all documents linked to a specific contract. Use when: admin or agent asks "which documents are attached to contract X?", or wants to verify that a signed PDF is attached. NOT for: uploading new documents (use manage_document with related_entity_type=contract).'
WHERE name = 'list_contract_documents'
  AND (description IS NULL OR length(description) < 60);