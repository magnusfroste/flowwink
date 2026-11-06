/**
 * modules.ts — single source of truth for "is module X enabled?".
 *
 * Module state lives in a `site_settings` KEY/VALUE row (key='modules'), e.g.
 *   { "flowpilot": { "enabled": true, "adminUI": true }, "hr": {...}, ... }
 *
 * This must be read as `.select('value').eq('key','modules')` — NOT
 * `.select('modules')`, which targets a column that does not exist and silently
 * returns null. That exact mistake (in automation-dispatcher + event-dispatcher)
 * made `flowpilotOn` permanently false, so every executor='flowpilot' automation
 * was skipped as "module off" and never ran. Centralise the query here so the
 * column-vs-row trap can't be reintroduced one call site at a time.
 */
/**
 * One read, many questions: `const on = await loadEnabledModules(client)`,
 * then `on('leads')`. For a surface that asks about several modules (the
 * daily briefing asks about eight) — one row read instead of eight, and one
 * place that spells the row's shape. A missing row answers false for every
 * module: a surface that does not know which modules are on says nothing
 * about them.
 */
// deno-lint-ignore no-explicit-any -- the same loose client type isModuleEnabled takes (service or user client)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadEnabledModules(client: any): Promise<(moduleName: string) => boolean> {
  const { data, error } = await client
    .from('site_settings')
    .select('value')
    .eq('key', 'modules')
    .maybeSingle();
  if (error) console.warn('[modules] modules row unreadable — treating every module as off:', error.message);
  const value = (data?.value ?? {}) as Record<string, { enabled?: boolean } | undefined>;
  return (moduleName: string) => value[moduleName]?.enabled === true;
}

export async function isModuleEnabled(client: any, moduleName: string): Promise<boolean> {
  const { data } = await client
    .from('site_settings')
    .select('value')
    .eq('key', 'modules')
    .maybeSingle();
  return (data?.value as any)?.[moduleName]?.enabled === true;
}
