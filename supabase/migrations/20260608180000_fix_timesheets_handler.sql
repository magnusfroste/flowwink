-- log_time / timesheet_summary shipped with handler `db:timesheets`, which
-- routes to executeDbAction → there is no `timesheets` table and it isn't in
-- the generic-CRUD allowlist → every call failed at runtime with
-- "Unknown db table: timesheets". The correct handler is `module:timesheets`
-- (executeModuleAction → executeTimesheetsAction, which implements both skills).
-- The code seed in src/lib/modules/timesheets-module.ts is fixed; this repoints
-- the live rows directly because a module-gated skill-sync skips them on
-- instances where the timesheets module is disabled. Idempotent + conditional.
UPDATE public.agent_skills
SET handler = 'module:timesheets'
WHERE handler = 'db:timesheets'
  AND name IN ('log_time', 'timesheet_summary');

-- manage_projects / manage_tasks were intentionally removed from code (the
-- canonical skills live in projects-module). Stale `db:timesheets` duplicates
-- still linger as enabled rows on some instances — retire them.
UPDATE public.agent_skills
SET enabled = false, mcp_exposed = false
WHERE name IN ('manage_projects', 'manage_tasks')
  AND handler = 'db:timesheets';
