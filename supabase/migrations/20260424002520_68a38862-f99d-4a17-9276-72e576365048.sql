
UPDATE public.agent_skills
SET handler = 'module:timesheets',
    updated_at = now()
WHERE name IN ('log_time','timesheet_summary')
  AND handler = 'db:timesheets';
