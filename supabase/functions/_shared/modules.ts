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
export async function isModuleEnabled(client: any, moduleName: string): Promise<boolean> {
  const { data } = await client
    .from('site_settings')
    .select('value')
    .eq('key', 'modules')
    .maybeSingle();
  return (data?.value as any)?.[moduleName]?.enabled === true;
}
