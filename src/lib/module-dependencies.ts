/**
 * Module dependency edges for modules that do not yet declare `requires` on
 * their defineModule manifest (key depends on value). Every other edge comes
 * from the module itself. Read by /admin/modules and by the skills artifact
 * (scripts/skills-to-json.ts), so the browser toggle and manage_modules on the
 * server cascade along the same graph.
 */
export const LEGACY_MODULE_DEPENDENCIES: Readonly<Record<string, string>> = {
  deals: 'leads',
  liveSupport: 'chat',
};
