/**
 * A reset keeps the platform's own configuration (2026-11-21).
 *
 * Migrations never run twice, so a table a wipe empties and nothing refills is
 * gone for good. Sandbox, the morning after its 04:00 rebuild, had no stock
 * locations, trash sources, outreach country policy, HR rule templates,
 * year-end statement sections, cron cadence profiles or partner titles; the
 * admin's "Reset site data" also emptied the automations, which the skill sync
 * never re-adds. These read the LATEST definition of both wipes.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../..');
const MIG = join(ROOT, 'supabase/migrations');

function latestKeep(fn: string): Set<string> {
  const file = readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort()
    .filter((f) => readFileSync(join(MIG, f), 'utf-8').includes(`FUNCTION public.${fn}(p_confirm text)`)).pop()!;
  const sql = readFileSync(join(MIG, file), 'utf-8');
  const body = sql.slice(sql.indexOf(`FUNCTION public.${fn}(p_confirm text)`));
  const keep = body.slice(body.indexOf('KEEP text[] := ARRAY['), body.indexOf('];'));
  return new Set([...keep.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]));
}

const PLATFORM_REFERENCE = [
  'account_statement_sections', 'cron_cadence', 'hr_rule_templates', 'outreach_country_policy',
  'partner_titles', 'stock_locations', 'trash_sources',
];

describe('resets', () => {
  const sandbox = latestKeep('sandbox_reset_wipe');
  const site = latestKeep('reset_site_data');

  it('both wipes keep the reference only a migration seeds', () => {
    for (const t of PLATFORM_REFERENCE) {
      expect(sandbox.has(t), `sandbox_reset_wipe takes ${t}`).toBe(true);
      expect(site.has(t), `reset_site_data takes ${t}`).toBe(true);
    }
  });

  it('the site reset keeps everything the sandbox wipe keeps but who may sign in', () => {
    // The sandbox wipe resets people; a site reset keeps its admin and keys too.
    for (const t of sandbox) expect(site.has(t), `reset_site_data takes ${t}, the sandbox wipe keeps it`).toBe(true);
  });

  it('the automations survive a site reset (the sync never re-adds a name it seeded)', () => {
    expect(site.has('agent_automations')).toBe(true);
  });
});
