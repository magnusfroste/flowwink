-- ============================================================================
-- Browser Control is retired (2026-11-09).
--
-- The module was a Chrome-extension relay: FlowPilot asked for a login-walled
-- page (LinkedIn, X) and an admin's browser fetched it. Nobody used it, it was
-- off by default, and agents with their own browser (Claude in Chrome, OpenClaw)
-- do that job better and hand the result in over MCP. Its one skill,
-- browser_fetch, only forwarded public pages to web-scrape — scrape_url's own
-- path — so it is retired to scrape_url (_shared/skills/retired-skills.ts), and
-- the browser-fetch edge function is gone.
--
-- What an instance still carries, cleaned here (idempotent):
--   * site_settings.modules.browserControl and its module_teardowns entry
--   * role_module_access(_defaults) rows for the module
--   * the browser_fetch skill row — disabled, never deleted (the journal names
--     it), as sync-skills does for every orphan
-- ============================================================================

UPDATE public.site_settings
SET value = value - 'browserControl'
WHERE key IN ('modules', 'module_teardowns')
  AND jsonb_typeof(value) = 'object'
  AND value ? 'browserControl';

DELETE FROM public.role_module_access WHERE module_id IN ('browserControl', 'browser-control');
DELETE FROM public.role_module_access_defaults WHERE module_id IN ('browserControl', 'browser-control');

UPDATE public.agent_skills
SET enabled = false,
    mcp_exposed = false,
    updated_at = now()
WHERE name = 'browser_fetch'
  AND (enabled OR mcp_exposed);

-- Automations that ran it would now answer "retired" every tick.
UPDATE public.agent_automations
SET enabled = false,
    last_error = 'Disabled 2026-11-09: browser_fetch was retired with Browser Control. Point this automation at scrape_url.',
    updated_at = now()
WHERE skill_name = 'browser_fetch'
  AND enabled;
