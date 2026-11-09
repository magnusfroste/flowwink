-- ============================================================================
-- The Global Elements module is gone (2026-11-09).
--
-- It was "merged into Pages — kept for backward compatibility": no skills, no
-- tables, hidden from the Modules page, off by default. Its one live trace was
-- a side effect: the executor mapped the handler name `module:globalElements`
-- (manage_global_blocks, a Pages skill) to a module of the same name, so every
-- time an agent touched the header the dead module was switched on (liteit).
-- The handler name stays — it is a wire identifier — and now belongs to Pages.
--
-- Cleaned here (idempotent): the key in site_settings.modules and
-- module_teardowns, and any access-matrix rows.
-- ============================================================================

UPDATE public.site_settings
SET value = value - 'globalElements'
WHERE key IN ('modules', 'module_teardowns')
  AND jsonb_typeof(value) = 'object'
  AND value ? 'globalElements';

DELETE FROM public.role_module_access WHERE module_id = 'globalElements';
DELETE FROM public.role_module_access_defaults WHERE module_id = 'globalElements';
